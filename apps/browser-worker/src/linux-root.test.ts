import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
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
