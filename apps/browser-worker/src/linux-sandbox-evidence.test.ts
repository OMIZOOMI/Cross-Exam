import { open, readlink } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { readCgroupFile } from "./linux-cgroup";
import {
  ChromiumSandboxEvidenceError,
  parseSandboxProcessSnapshot,
  type SandboxProcessEvidence,
  type SandboxProcessSnapshot,
  startChromiumSandboxObserver,
  verifyChromiumSandboxEvidence,
} from "./linux-sandbox-evidence";

vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
  open: vi.fn(),
  readlink: vi.fn(),
}));
vi.mock("./linux-cgroup", async (original) => ({
  ...(await original<typeof import("./linux-cgroup")>()),
  readCgroupFile: vi.fn(),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

const executable =
  "/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const mainPID = 100;
function snapshot(role: "worker" | "browser" | "zygote" | "renderer"): SandboxProcessSnapshot {
  const pid = { worker: mainPID, browser: 101, zygote: 102, renderer: 103 }[role];
  const sandboxed = role === "zygote" || role === "renderer";
  return {
    pid,
    cmdline:
      role === "worker"
        ? ["/runtime/node", "/app/probe.mjs"]
        : [executable, ...(role === "browser" ? [] : [`--type=${role}`])],
    status: `Uid:\t998 998 998 998\nGid:\t998 998 998 998\nNSpid:\t${pid}${sandboxed ? " 2" : ""}\nNoNewPrivs:\t1\nSeccomp:\t2\nSeccomp_filters:\t${role === "renderer" ? 15 : 14}\nCapEff:\t0000000000000000\nCapBnd:\t0000000000000000\n`,
    namespaces: {
      user: `user:[${sandboxed ? 200 : 1}]`,
      pid: `pid:[${sandboxed ? 300 : 2}]`,
      net: "net:[3]",
    },
    profile: role === "worker" ? "unconfined\n" : "crossexam-chromium-userns (unconfined)\n",
    uidMap: sandboxed ? "998 998 1\n" : "0 0 4294967295\n",
    gidMap: sandboxed ? "998 998 1\n" : "0 0 4294967295\n",
    setgroups: sandboxed ? "deny\n" : "allow\n",
  };
}
function evidence(role: "worker" | "browser" | "zygote" | "renderer") {
  return parseSandboxProcessSnapshot(snapshot(role), mainPID) as SandboxProcessEvidence;
}
function valid() {
  return {
    worker: evidence("worker"),
    samples: [evidence("browser"), evidence("zygote"), evidence("renderer")],
  };
}

it("proves exact attachment, own-ID mapping, namespace separation, and renderer-added seccomp", () => {
  const { worker, samples } = valid();
  expect(verifyChromiumSandboxEvidence(worker, samples)).toMatchObject({
    selectedMechanism: "userns",
    profileName: "crossexam-chromium-userns",
    observations: 3,
    renderer: {
      role: "renderer",
      seccomp: 2,
      seccompFilters: 15,
      uidMap: [[998, 998, 1]],
      gidMap: [[998, 998, 1]],
      setgroups: "deny",
    },
  });
});

it("does not require a new network namespace or a sandboxed secondary zygote", () => {
  const { worker, samples } = valid();
  const secondary = { ...evidence("zygote"), pid: 110, namespaces: worker.namespaces };
  expect(verifyChromiumSandboxEvidence(worker, [secondary, ...samples]).zygote.pid).toBe(102);
});

it("ignores another executable and non-renderer Chromium utility processes", () => {
  expect(
    parseSandboxProcessSnapshot({ ...snapshot("browser"), cmdline: ["/tmp/chromium"] }, mainPID),
  ).toBeUndefined();
  expect(
    parseSandboxProcessSnapshot(
      { ...snapshot("browser"), cmdline: [executable, "--type=utility"] },
      mainPID,
    ),
  ).toBeUndefined();
});

it.each([
  "--no-sandbox",
  "--disable-namespace-sandbox",
  "--disable-seccomp-filter-sandbox",
  "--disable-setuid-sandbox",
  "--no-sandbox=true",
])("rejects forbidden Chromium argument %s", (flag) => {
  const browser = snapshot("browser");
  browser.cmdline.push(flag);
  expect(() => parseSandboxProcessSnapshot(browser, mainPID)).toThrow("FORBIDDEN_CHROMIUM_FLAG");
});

it.each(["browser", "zygote", "renderer"] as const)(
  "recognizes Chromium153's single rewritten %s process title",
  (role) => {
    const item = snapshot(role);
    item.cmdline.push("--disable-background-networking");
    item.cmdline = [item.cmdline.join(" ")];
    expect(parseSandboxProcessSnapshot(item, mainPID)?.role).toBe(role);
  },
);

it.each([
  `${executable}-other --type=zygote`,
  `/tmp${executable} --type=zygote`,
  `prefix ${executable} --type=zygote`,
  `${executable}x --type=zygote`,
])("rejects rewritten title with a wrong executable prefix: %s", (title) => {
  expect(
    parseSandboxProcessSnapshot({ ...snapshot("zygote"), cmdline: [title] }, mainPID),
  ).toBeUndefined();
});

it.each([
  "--no-sandbox",
  "--disable-namespace-sandbox",
  "--disable-seccomp-filter-sandbox",
  "--disable-setuid-sandbox",
  "--no-sandbox=true",
])("rejects forbidden %s in a rewritten process title", (flag) => {
  const item = snapshot("renderer");
  item.cmdline = [`${executable} --type=renderer ${flag}`];
  expect(() => parseSandboxProcessSnapshot(item, mainPID)).toThrow("FORBIDDEN_CHROMIUM_FLAG");
});

it("rejects ambiguous role markers in original argv and rewritten titles", () => {
  for (const cmdline of [
    [executable, "--type=zygote", "--type=renderer"],
    [`${executable} --type=zygote --type=renderer`],
  ]) {
    expect(() => parseSandboxProcessSnapshot({ ...snapshot("zygote"), cmdline }, mainPID)).toThrow(
      "AMBIGUOUS_CHROMIUM_ROLE",
    );
  }
});

it("rejects mixed original/title representations and embedded control characters", () => {
  const item = snapshot("zygote");
  item.cmdline = [`${executable} --type=zygote`, "--another"];
  expect(parseSandboxProcessSnapshot(item, mainPID)).toBeUndefined();
  item.cmdline = [`${executable} --type=zygote\n--hidden`];
  expect(() => parseSandboxProcessSnapshot(item, mainPID)).toThrow("INVALID_CHROMIUM_TITLE");
});

it("retains bounded normalized evidence when final sandbox proof is incomplete", () => {
  const { worker, samples } = valid();
  const incomplete = { ...evidence("renderer"), seccompFilters: worker.seccompFilters };
  try {
    verifyChromiumSandboxEvidence(worker, [
      ...samples.slice(0, 2),
      ...Array.from({ length: 50 }, () => incomplete),
    ]);
    throw new Error("expected missing renderer proof");
  } catch (error) {
    expect(error).toBeInstanceOf(ChromiumSandboxEvidenceError);
    const failed = error as ChromiumSandboxEvidenceError;
    expect(failed.code).toBe("MISSING_SANDBOXED_RENDERER");
    expect(Object.keys(failed.partialEvidence ?? {}).sort()).toEqual([
      "browser",
      "observations",
      "renderer",
      "worker",
      "zygote",
    ]);
    expect(failed.partialEvidence?.observations).toBe(52);
    expect(failed.partialEvidence?.renderer?.seccompFilters).toBe(worker.seccompFilters);
    expect(JSON.stringify(failed.partialEvidence)).not.toContain("cmdline");
    expect(JSON.stringify(failed.partialEvidence)).not.toContain("/app/probe.mjs");
  }
});

it.each(["browser", "zygote", "renderer"] as const)("requires observed %s evidence", (role) => {
  const { worker, samples } = valid();
  expect(() =>
    verifyChromiumSandboxEvidence(
      worker,
      samples.filter((sample) => sample.role !== role),
    ),
  ).toThrow();
});

it("requires the expected profile actually attached, not merely loaded", () => {
  const { worker, samples } = valid();
  samples[0] = { ...evidence("browser"), profile: "unconfined" };
  expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow("MISSING_ATTACHED_BROWSER");
});

it.each(["capabilityEffective", "capabilityBounding"] as const)(
  "retains empty outer %s",
  (field) => {
    const { worker, samples } = valid();
    worker[field] = "0000000000200000";
    expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow(
      "INVALID_OUTER_SECURITY_STATE",
    );
  },
);

it("retains NoNewPrivileges for worker and renderer", () => {
  const { worker, samples } = valid();
  worker.noNewPrivileges = 0;
  expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow(
    "INVALID_OUTER_SECURITY_STATE",
  );
  worker.noNewPrivileges = 1;
  samples[2] = { ...evidence("renderer"), noNewPrivileges: 0 };
  expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow(
    "MISSING_SANDBOXED_RENDERER",
  );
});

it.each(["user", "pid"] as const)("rejects renderer sharing the worker's %s namespace", (name) => {
  const { worker, samples } = valid();
  samples[2] = {
    ...evidence("renderer"),
    namespaces: { ...evidence("renderer").namespaces, [name]: worker.namespaces[name] },
  };
  expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow(
    "MISSING_SANDBOXED_RENDERER",
  );
});

it.each(["uidMap", "gidMap"] as const)("requires a completed own-ID %s", (name) => {
  const { worker, samples } = valid();
  samples[1] = { ...evidence("zygote"), [name]: [[0, 0, 4294967295]] };
  expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow("MISSING_SANDBOXED_ZYGOTE");
});

it("requires setgroups deny and does not accept seccomp inherited only from systemd", () => {
  const { worker, samples } = valid();
  samples[1] = { ...evidence("zygote"), setgroups: "allow" };
  expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow("MISSING_SANDBOXED_ZYGOTE");
  samples[1] = evidence("zygote");
  samples[2] = { ...evidence("renderer"), seccompFilters: worker.seccompFilters };
  expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow(
    "MISSING_SANDBOXED_RENDERER",
  );
});

it.each([
  ["status", "Uid:\t0 0 0 0\n", "MISSING_NSPID"],
  ["uidMap", "0 998 0\n", "INVALID_ID_MAPPING"],
  ["setgroups", "unknown", "INVALID_SETGROUPS"],
  ["profile", "unsafe\nprofile", "INVALID_PROFILE"],
] as const)("fails on malformed %s", (name, value, code) => {
  const input = snapshot("renderer");
  input[name] = value;
  expect(() => parseSandboxProcessSnapshot(input, mainPID)).toThrow(code);
});

it("does not accept root or mixed host UID identity", () => {
  for (const value of ["0 0 0 0", "998 0 998 998"]) {
    const input = snapshot("renderer");
    input.status = input.status.replace("Uid:\t998 998 998 998", `Uid:\t${value}`);
    expect(() => parseSandboxProcessSnapshot(input, mainPID)).toThrow("ROOT_OR_MIXED_IDENTITY");
  }
});

it("rejects malformed/traversing cgroup input before any host observation", () => {
  expect(() => startChromiumSandboxObserver("/../../host", mainPID)).toThrow(
    "Invalid or ambiguous cgroup path",
  );
  expect(() =>
    startChromiumSandboxObserver("/system.slice/crossexam-isolation-test.service", 0),
  ).toThrow("INVALID_MAIN_PID");
});

it("cannot claim proof without a captured worker snapshot", () => {
  expect(() => verifyChromiumSandboxEvidence(undefined, [])).toThrow("MISSING_WORKER");
});

it.each(["uidMap", "gidMap"] as const)(
  "skips the expected startup sample with empty %s without accepting it as proof",
  (name) => {
    const item = snapshot("zygote");
    item[name] = " \n";
    expect(parseSandboxProcessSnapshot(item, mainPID)).toBeUndefined();
    const { worker, samples } = valid();
    expect(() =>
      verifyChromiumSandboxEvidence(
        worker,
        samples.filter((sample) => sample.role !== "zygote"),
      ),
    ).toThrow("MISSING_SANDBOXED_ZYGOTE");
    expect(verifyChromiumSandboxEvidence(worker, samples).selectedMechanism).toBe("userns");
  },
);

it("does not accept the namespace-usability test child as the unsandboxed browser parent", () => {
  const { worker, samples } = valid();
  samples[0] = { ...evidence("browser"), namespaces: evidence("zygote").namespaces };
  expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow("MISSING_ATTACHED_BROWSER");
});

it("does not mistake temporary overflow IDs for a successfully mapped namespace", () => {
  const item = snapshot("zygote");
  item.status = item.status.replaceAll("998", "65534");
  const pending = parseSandboxProcessSnapshot(item, mainPID) as SandboxProcessEvidence;
  const { worker, samples } = valid();
  samples[1] = pending;
  expect(() => verifyChromiumSandboxEvidence(worker, samples)).toThrow("MISSING_SANDBOXED_ZYGOTE");
});

it("does not accept missing worker mappings as normal Chromium startup", () => {
  const item = snapshot("worker");
  item.uidMap = "";
  expect(() => parseSandboxProcessSnapshot(item, mainPID)).toThrow("MISSING_WORKER_ID_MAPPING");
});

const group = "/system.slice/crossexam-isolation-test.service";
function mockProcReads(
  failedFile?: string,
  code = "EACCES",
  outsidePID?: number,
  pendingPID?: number,
) {
  vi.mocked(readCgroupFile).mockResolvedValue("100\n101\n102\n103\n");
  let pendingReads = 0;
  const snapshots = new Map(
    ["worker", "browser", "zygote", "renderer"].map((role) => {
      const item = snapshot(role as "worker" | "browser" | "zygote" | "renderer");
      return [item.pid, item] as const;
    }),
  );
  const fileValue = (file: string) => {
    if (file === failedFile) throw Object.assign(new Error(code), { code });
    const match = /^\/proc\/(\d+)\/(.*)$/u.exec(file);
    const pid = Number(match?.[1]);
    const item = snapshots.get(pid);
    const name = match?.[2];
    if (!item) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    switch (name) {
      case "cgroup":
        return `0::${pid === outsidePID ? "/other.service" : group}\n`;
      case "status":
        return item.status;
      case "cmdline":
        return `${item.cmdline.join("\u0000")}\u0000`;
      case "attr/current":
        return item.profile;
      case "uid_map":
        if (pid === pendingPID && pendingReads++ === 0) return "";
        return item.uidMap;
      case "gid_map":
        return item.gidMap;
      case "setgroups":
        return item.setgroups;
      case "ns/user":
        return item.namespaces.user;
      case "ns/pid":
        return item.namespaces.pid;
      case "ns/net":
        return item.namespaces.net;
      default:
        throw new Error(`Unexpected proc file: ${file}`);
    }
  };
  vi.mocked(readlink).mockImplementation(async (file) => fileValue(String(file)));
  vi.mocked(open).mockImplementation(async (file) => {
    const contents = Buffer.from(fileValue(String(file)));
    return {
      async read(buffer: Buffer, offset: number, length: number, position: number) {
        const bytesRead = contents.copy(buffer, offset, position, position + length);
        return { buffer, bytesRead };
      },
      close: vi.fn(async () => undefined),
    } as unknown as Awaited<ReturnType<typeof open>>;
  });
}

it("observes only the captured cgroup and returns compact evidence without arguments", async () => {
  vi.useFakeTimers();
  mockProcReads();
  const observer = startChromiumSandboxObserver(group, mainPID);
  await vi.advanceTimersByTimeAsync(100);
  const result = await observer.stop();
  expect(result.selectedMechanism).toBe("userns");
  expect(readCgroupFile).toHaveBeenCalledWith(`/sys/fs/cgroup${group}/cgroup.procs`);
  expect(JSON.stringify(result)).not.toContain("cmdline");
  expect(JSON.stringify(result)).not.toContain("/app/probe.mjs");
});

it("continues observation past incomplete namespace setup and requires a later completed sample", async () => {
  vi.useFakeTimers();
  mockProcReads(undefined, undefined, undefined, 102);
  const observer = startChromiumSandboxObserver(group, mainPID);
  await vi.advanceTimersByTimeAsync(200);
  const result = await observer.stop();
  expect(result.zygote.uidMap).toEqual([[998, 998, 1]]);
  expect(result.zygote.gidMap).toEqual([[998, 998, 1]]);
  expect(result.zygote.setgroups).toBe("deny");
});

it.each(["EACCES", "EPERM", "EIO", "EMFILE"])(
  "fails closed on observer read error %s",
  async (code) => {
    mockProcReads("/proc/102/ns/user", code);
    const observer = startChromiumSandboxObserver(group, mainPID);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await expect(observer.stop()).rejects.toMatchObject({ code: `PROC_READ_${code}` });
  },
);

it("skips a PID that vanished but cannot manufacture missing sandbox evidence", async () => {
  vi.useFakeTimers();
  mockProcReads("/proc/102/ns/user", "ENOENT");
  const observer = startChromiumSandboxObserver(group, mainPID);
  await vi.advanceTimersByTimeAsync(100);
  await expect(observer.stop()).rejects.toMatchObject({ code: "MISSING_SANDBOXED_ZYGOTE" });
});

it("does not inspect a reused PID after its cgroup identity no longer matches", async () => {
  vi.useFakeTimers();
  mockProcReads(undefined, undefined, 103);
  const observer = startChromiumSandboxObserver(group, mainPID);
  await vi.advanceTimersByTimeAsync(100);
  await expect(observer.stop()).rejects.toMatchObject({ code: "MISSING_SANDBOXED_RENDERER" });
  expect(open).not.toHaveBeenCalledWith("/proc/103/status", expect.anything());
});

it("rejects excessive cgroup membership before process inspection", async () => {
  vi.mocked(readCgroupFile).mockResolvedValue(
    Array.from({ length: 257 }, (_, i) => i + 1).join("\n"),
  );
  const observer = startChromiumSandboxObserver(group, mainPID);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await expect(observer.stop()).rejects.toMatchObject({ code: "INVALID_CGROUP_PROCESSES" });
  expect(open).not.toHaveBeenCalled();
});
