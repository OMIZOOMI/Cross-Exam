import { chmod, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  diffPreparedRoot,
  parseDependencies,
  sealRoot,
  validatePreparedRoot,
  validateWorkerIdentity,
} from "./linux-root";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function buildRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ce-root-test-"));
  roots.push(root);
  for (const file of [
    "runtime/node",
    "app/probe.cjs",
    "app/test-cert.pem",
    "etc/passwd",
    "etc/group",
    "etc/hosts",
    "etc/resolv.conf",
    "usr/bin/env",
    "usr/bin/sleep",
    "browser/chromium-1/chrome-linux/chrome",
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), "fixture");
  }
  for (const dir of ["proc", "dev", "tmp", "run/crossexam", "sys", "var/tmp"])
    await mkdir(path.join(root, dir), { recursive: true });
  await mkdir(path.join(root, "root"), { mode: 0o750 });
  await chmod(path.join(root, "root"), 0o750);
  await symlink("usr/bin", path.join(root, "bin"));
  return root;
}
async function fixture() {
  const root = await buildRoot();
  await sealRoot(root);
  return root;
}
it("validates a sealed immutable root and hash inventory", async () => {
  await validatePreparedRoot(await fixture(), process.getuid?.() ?? 0);
});
it.each(["lib", "lib64"])(
  "accepts %s as an intentional prepared-root runtime library directory",
  async (directory) => {
    const root = await buildRoot();
    await mkdir(path.join(root, directory, "x86_64-linux-gnu"), { recursive: true });
    await writeFile(path.join(root, directory, "x86_64-linux-gnu/libc.so.6"), "fixture");
    await sealRoot(root);
    await validatePreparedRoot(root, process.getuid?.() ?? 0);
  },
);
it("rejects arbitrary other top-level runtime library lookalikes", async () => {
  const root = await buildRoot();
  await mkdir(path.join(root, "lib32"), { recursive: true });
  await writeFile(path.join(root, "lib32/libc.so.6"), "fixture");
  await expect(sealRoot(root)).rejects.toThrow(/unexpected prepared-root entry: lib32/);
});
it.each(["unexpected", "etc/shadow", "run/admin.sock", "home/user", "app/../secret"])(
  "rejects unexpected asset %s even during sealing",
  async (name) => {
    const root = await fixture();
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), "not allowed");
    await expect(sealRoot(root)).rejects.toThrow();
  },
);
it("rejects extra directories", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "unexpected-directory"));
  await expect(validatePreparedRoot(root, process.getuid?.() ?? 0)).rejects.toThrow();
});
it("rejects changed runtime content", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "app/probe.cjs"), "changed");
  await expect(validatePreparedRoot(root, process.getuid?.() ?? 0)).rejects.toThrow();
});
it("rejects worker-writable assets", async () => {
  const root = await fixture();
  await chmod(path.join(root, "runtime/node"), 0o777);
  await expect(validatePreparedRoot(root, process.getuid?.() ?? 0)).rejects.toThrow();
});
it("rejects symlinks and traversal in inventory", async () => {
  const root = await fixture();
  await symlink("/etc/passwd", path.join(root, "app/link"));
  await expect(sealRoot(root)).rejects.toThrow();
  await rm(path.join(root, "app/link"));
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({ "../escape": {} }));
  await expect(validatePreparedRoot(root, process.getuid?.() ?? 0)).rejects.toThrow();
});
it("rejects unintended Unix sockets", async () => {
  const root = await fixture();
  const socket = net.createServer();
  await new Promise<void>((resolve) =>
    socket.listen(path.join(root, "run/crossexam/proxy.sock"), resolve),
  );
  try {
    await expect(sealRoot(root)).rejects.toThrow();
  } finally {
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
});
it("fails on missing required runtime dependency", () => {
  expect(() => parseDependencies("libx.so => not found\n")).toThrow();
  expect(() => parseDependencies("libx.so => not found\n")).toThrow(/missing/);
});
it("extracts resolved dependencies and standalone interpreter paths", () => {
  expect(
    parseDependencies(
      "\tlinux-vdso.so.1 (0x1)\n\tlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x2)\n\t/lib64/ld-linux-x86-64.so.2 (0x3)\n",
    ),
  ).toEqual(["/lib/x86_64-linux-gnu/libc.so.6", "/lib64/ld-linux-x86-64.so.2"]);
});
it("deduplicates repeated dependency paths", () => {
  expect(
    parseDependencies(
      "libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x1)\nlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x2)\n",
    ),
  ).toEqual(["/lib/x86_64-linux-gnu/libc.so.6"]);
});
it("ignores unrelated lines without absolute paths", () => {
  expect(parseDependencies("linux-vdso.so.1 (0x1)\nnot a library line\n")).toEqual([]);
});
it.each(["0", "991 27", "991 999", "", "991x"])(
  "rejects privileged or unexpected group identity %s",
  (groups) => {
    expect(() => validateWorkerIdentity("991", "991", groups)).toThrow();
  },
);
it("accepts only the dedicated primary group", () => {
  expect(validateWorkerIdentity("991", "991", "991")).toEqual({ uid: 991, gid: 991 });
});

describe("diffPreparedRoot", () => {
  it("reports no differences for an identical sealed root", async () => {
    const root = await fixture();
    const diff = await diffPreparedRoot(root);
    expect(diff).toMatchObject({
      truncated: false,
      addedCount: 0,
      removedCount: 0,
      changedCount: 0,
      added: [],
      removed: [],
      changed: [],
    });
  });

  it("reports an added file and directory", async () => {
    const root = await buildRoot();
    await sealRoot(root);
    await writeFile(path.join(root, "app/extra.txt"), "extra");
    await mkdir(path.join(root, "app/extra-dir"), { recursive: true });
    const diff = await diffPreparedRoot(root);
    const addedPaths = diff.added.map((entry) => entry.path);
    expect(addedPaths).toContain("app/extra.txt");
    expect(addedPaths).toContain("app/extra-dir");
    expect(diff.added.find((entry) => entry.path === "app/extra.txt")?.kind).toBe("file");
  });

  it("reports a removed path", async () => {
    const root = await fixture();
    await unlink(path.join(root, "app/probe.cjs"));
    const diff = await diffPreparedRoot(root);
    expect(diff.removed.map((entry) => entry.path)).toContain("app/probe.cjs");
    expect(diff.removedCount).toBeGreaterThanOrEqual(1);
  });

  it("reports a changed file content of equal size via hash", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "app/probe.cjs"), "XXXXXXX"); // same length as "fixture"
    const diff = await diffPreparedRoot(root);
    expect(diff.changed.map((entry) => entry.path)).toContain("app/probe.cjs");
  });

  it("reports a changed mode", async () => {
    const root = await fixture();
    await chmod(path.join(root, "app/probe.cjs"), 0o600);
    const diff = await diffPreparedRoot(root);
    expect(diff.changed.map((entry) => entry.path)).toContain("app/probe.cjs");
  });

  it("reports a socket added by a hypothetical mount target", async () => {
    const root = await fixture();
    const server = net.createServer();
    await new Promise<void>((resolve) =>
      server.listen(path.join(root, "run/crossexam/proxy.sock"), resolve),
    );
    try {
      const diff = await diffPreparedRoot(root);
      const entry = diff.added.find((item) => item.path === "run/crossexam/proxy.sock");
      expect(entry?.kind).toBe("socket");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("bounds reported paths while preserving total counts", async () => {
    const root = await buildRoot();
    await sealRoot(root);
    for (let index = 0; index < 150; index += 1)
      await writeFile(path.join(root, `app/extra-${index}.txt`), "x");
    const diff = await diffPreparedRoot(root);
    expect(diff.added.length).toBeLessThanOrEqual(100);
    expect(diff.addedCount).toBeGreaterThanOrEqual(150);
  });

  it("does not treat the manifest itself as a mutation", async () => {
    const root = await fixture();
    const diff = await diffPreparedRoot(root);
    for (const entry of [...diff.added, ...diff.removed, ...diff.changed])
      expect(entry.path).not.toBe(".crossexam-root-manifest.json");
  });

  it("never includes file contents in diagnostics", async () => {
    const root = await buildRoot();
    await sealRoot(root);
    await writeFile(path.join(root, "app/secret.txt"), "SUPER-SECRET-CONTENT");
    const diff = await diffPreparedRoot(root);
    expect(JSON.stringify(diff)).not.toContain("SUPER-SECRET-CONTENT");
    for (const entry of diff.added)
      expect(Object.keys(entry).sort()).toEqual(["kind", "mode", "path", "size"]);
  });
});

describe("deterministic base-filesystem entries", () => {
  const uid = process.getuid?.() ?? 0;

  it("accepts the canonical bin -> usr/bin symlink and root directory", async () => {
    const root = await fixture();
    await expect(validatePreparedRoot(root, uid)).resolves.toBeUndefined();
    const diff = await diffPreparedRoot(root);
    expect(diff.changed.map((entry) => entry.path)).not.toContain("bin");
    expect(diff.changed.map((entry) => entry.path)).not.toContain("root");
  });

  it("repeated validation of an unchanged canonical root passes", async () => {
    const root = await fixture();
    await validatePreparedRoot(root, uid);
    await expect(validatePreparedRoot(root, uid)).resolves.toBeUndefined();
  });

  it.each([
    ["absolute target", "/usr/bin"],
    ["traversal target", "../etc/passwd"],
    ["other internal target", "usr/lib"],
  ])("rejects bin with %s", async (_label, target) => {
    const root = await buildRoot();
    await rm(path.join(root, "bin"));
    await symlink(target, path.join(root, "bin"));
    await expect(sealRoot(root)).rejects.toThrow();
  });

  it("rejects a symlink at any path other than bin", async () => {
    const root = await buildRoot();
    await symlink("usr/bin", path.join(root, "app/link"));
    await expect(sealRoot(root)).rejects.toThrow();
  });

  it("fails validation when the bin target changes after sealing", async () => {
    const root = await fixture();
    await rm(path.join(root, "bin"));
    await symlink("usr/lib", path.join(root, "bin"));
    await expect(validatePreparedRoot(root, uid)).rejects.toThrow();
  });

  it("rejects a worker-writable root directory", async () => {
    const root = await fixture();
    await chmod(path.join(root, "root"), 0o777);
    await expect(validatePreparedRoot(root, uid)).rejects.toThrow(/worker-writable/);
  });

  it("rejects an arbitrary extra top-level entry", async () => {
    const root = await buildRoot();
    await mkdir(path.join(root, "unexpected"));
    await expect(sealRoot(root)).rejects.toThrow(/unexpected prepared-root entry/);
  });
});
