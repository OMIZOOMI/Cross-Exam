import { constants } from "node:fs";
import { open, readlink } from "node:fs/promises";
import path from "node:path";
import { CHROMIUM_APPARMOR } from "./linux-apparmor";
import { cgroupDirectory, readCgroupFile } from "./linux-cgroup";

const CHROMIUM_EXECUTABLE = CHROMIUM_APPARMOR.executable;
const PROFILE_NAME = CHROMIUM_APPARMOR.profile;
const MAX_PROCESSES = 256;
const POLL_INTERVAL_MS = 100;
const OBSERVATION_LIMIT_MS = 30_000;
const FORBIDDEN_FLAGS = [
  "--no-sandbox",
  "--disable-namespace-sandbox",
  "--disable-seccomp-filter-sandbox",
  "--disable-setuid-sandbox",
];

type Role = "worker" | "browser" | "zygote" | "renderer";
type Namespaces = { user: string; pid: string; net: string };
export type SandboxProcessSnapshot = {
  pid: number;
  cmdline: string[];
  status: string;
  namespaces: Namespaces;
  profile: string;
  uidMap: string;
  gidMap: string;
  setgroups: string;
};
export type SandboxProcessEvidence = {
  pid: number;
  role: Role;
  uid: number;
  gid: number;
  namespaces: Namespaces;
  namespacePids: number[];
  noNewPrivileges: number;
  seccomp: number;
  seccompFilters: number;
  capabilityEffective: string;
  capabilityBounding: string;
  profile: string;
  uidMap: number[][];
  gidMap: number[][];
  setgroups: "allow" | "deny";
};
export type SandboxEvidence = {
  selectedMechanism: "userns";
  profileName: string;
  worker: SandboxProcessEvidence;
  browser: SandboxProcessEvidence;
  zygote: SandboxProcessEvidence;
  renderer: SandboxProcessEvidence;
  observations: number;
};

export class ChromiumSandboxEvidenceError extends Error {
  constructor(readonly code: string) {
    super(`Chromium sandbox evidence failed: ${code}`);
    this.name = "ChromiumSandboxEvidenceError";
  }
}

function requireEvidence(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ChromiumSandboxEvidenceError(code);
}

function field(status: string, name: string): string {
  const result = new RegExp(`^${name}:[ \\t]*(.*)$`, "m").exec(status)?.[1];
  requireEvidence(result !== undefined, `MISSING_${name.toUpperCase()}`);
  return result.trim();
}

function numbers(value: string, maximum = Number.MAX_SAFE_INTEGER): number[] {
  const parts = value.trim().split(/\s+/u);
  requireEvidence(
    parts.every((part) => /^\d+$/.test(part)),
    "INVALID_NUMERIC_FIELD",
  );
  const parsed = parts.map(Number);
  requireEvidence(
    parsed.every((number) => Number.isSafeInteger(number) && number <= maximum),
    "INVALID_NUMERIC_FIELD",
  );
  return parsed;
}

function oneNumber(status: string, name: string): number {
  const result = numbers(field(status, name));
  requireEvidence(result.length === 1, `INVALID_${name.toUpperCase()}`);
  return result[0] as number;
}

function identity(status: string, name: "Uid" | "Gid"): number {
  const values = numbers(field(status, name), 4294967295);
  requireEvidence(values.length === 4, `INVALID_${name.toUpperCase()}`);
  // Host-view proc data must never describe root or an elevated identity.
  requireEvidence(
    values.every((value) => value > 0 && value === values[0]),
    "ROOT_OR_MIXED_IDENTITY",
  );
  return values[0] as number;
}

function capability(status: string, name: "CapEff" | "CapBnd"): string {
  const value = field(status, name);
  requireEvidence(/^[a-fA-F\d]{1,16}$/.test(value), "INVALID_CAPABILITIES");
  return value.toLowerCase();
}

function mappings(value: string): number[][] {
  // A newly cloned namespace has no mappings until Chromium's parent writes
  // them. This valid startup state is not completed sandbox evidence.
  if (value.trim() === "") return [];
  const lines = value.trim().split("\n");
  requireEvidence(lines.length <= 5, "EXCESSIVE_ID_MAPPING");
  return lines.map((line) => {
    const entries = numbers(line, 4294967295);
    requireEvidence(entries.length === 3 && (entries[2] as number) > 0, "INVALID_ID_MAPPING");
    return entries;
  });
}

/** Pure parser: only the selected immutable Chromium command is eligible. */
export function parseSandboxProcessSnapshot(
  snapshot: SandboxProcessSnapshot,
  mainPID: number,
): SandboxProcessEvidence | undefined {
  let role: Role;
  if (snapshot.pid === mainPID) role = "worker";
  else {
    if (snapshot.cmdline[0] !== CHROMIUM_EXECUTABLE) return undefined;
    requireEvidence(
      !snapshot.cmdline.some((argument) =>
        FORBIDDEN_FLAGS.some((flag) => argument === flag || argument.startsWith(`${flag}=`)),
      ),
      "FORBIDDEN_CHROMIUM_FLAG",
    );
    const types = snapshot.cmdline.filter((argument) => argument.startsWith("--type="));
    requireEvidence(types.length <= 1, "AMBIGUOUS_CHROMIUM_ROLE");
    const type = types[0];
    if (type === undefined) role = "browser";
    else if (type === "--type=zygote") role = "zygote";
    else if (type === "--type=renderer") role = "renderer";
    else return undefined;
  }
  requireEvidence(Number.isSafeInteger(snapshot.pid) && snapshot.pid > 0, "INVALID_PID");
  for (const name of ["user", "pid", "net"] as const)
    requireEvidence(
      new RegExp(`^${name}:\\[\\d+\\]$`).test(snapshot.namespaces[name]),
      "INVALID_NAMESPACE",
    );
  const namespacePids = numbers(field(snapshot.status, "NSpid"));
  requireEvidence(
    namespacePids.length <= 32 &&
      namespacePids.every((pid) => pid > 0) &&
      namespacePids[0] === snapshot.pid,
    "INVALID_NAMESPACE_PIDS",
  );
  const setgroups = snapshot.setgroups.trim();
  requireEvidence(setgroups === "allow" || setgroups === "deny", "INVALID_SETGROUPS");
  const profile = snapshot.profile.trim();
  requireEvidence(
    profile.length <= 256 && !/[\r\n]/u.test(profile) && !profile.includes("\u0000"),
    "INVALID_PROFILE",
  );
  const uidMap = mappings(snapshot.uidMap);
  const gidMap = mappings(snapshot.gidMap);
  if (role !== "worker" && (uidMap.length === 0 || gidMap.length === 0)) return undefined;
  requireEvidence(uidMap.length > 0 && gidMap.length > 0, "MISSING_WORKER_ID_MAPPING");
  return {
    pid: snapshot.pid,
    role,
    uid: identity(snapshot.status, "Uid"),
    gid: identity(snapshot.status, "Gid"),
    namespaces: snapshot.namespaces,
    namespacePids,
    noNewPrivileges: oneNumber(snapshot.status, "NoNewPrivs"),
    seccomp: oneNumber(snapshot.status, "Seccomp"),
    seccompFilters: oneNumber(snapshot.status, "Seccomp_filters"),
    capabilityEffective: capability(snapshot.status, "CapEff"),
    capabilityBounding: capability(snapshot.status, "CapBnd"),
    profile,
    uidMap,
    gidMap,
    setgroups,
  };
}

function isOwnIdMap(map: number[][], hostID: number): boolean {
  // Chromium 153 preserves the account ID inside its user namespace; it does
  // not map that account to namespace UID/GID zero (NamespaceUtils::WriteToIdMapFile).
  return map.length === 1 && map[0]?.[0] === hostID && map[0]?.[1] === hostID && map[0]?.[2] === 1;
}

function namespaceSandboxed(
  sample: SandboxProcessEvidence,
  worker: SandboxProcessEvidence,
): boolean {
  return (
    sample.namespaces.user !== worker.namespaces.user &&
    sample.namespaces.pid !== worker.namespaces.pid &&
    sample.namespacePids.length > worker.namespacePids.length &&
    sample.noNewPrivileges === 1 &&
    sample.uid === worker.uid &&
    sample.gid === worker.gid &&
    sample.setgroups === "deny" &&
    isOwnIdMap(sample.uidMap, worker.uid) &&
    isOwnIdMap(sample.gidMap, worker.gid)
  );
}

/** Require a real namespace path plus renderer-added seccomp, not launch alone. */
export function verifyChromiumSandboxEvidence(
  worker: SandboxProcessEvidence | undefined,
  samples: SandboxProcessEvidence[],
): SandboxEvidence {
  requireEvidence(worker?.role === "worker", "MISSING_WORKER");
  requireEvidence(
    worker.noNewPrivileges === 1 &&
      BigInt(`0x${worker.capabilityEffective}`) === 0n &&
      BigInt(`0x${worker.capabilityBounding}`) === 0n,
    "INVALID_OUTER_SECURITY_STATE",
  );
  const browser = samples.find(
    (sample) =>
      sample.role === "browser" &&
      sample.profile === `${PROFILE_NAME} (unconfined)` &&
      sample.noNewPrivileges === 1 &&
      sample.namespaces.user === worker.namespaces.user &&
      sample.namespaces.pid === worker.namespaces.pid &&
      sample.uid === worker.uid &&
      sample.gid === worker.gid,
  );
  requireEvidence(browser !== undefined, "MISSING_ATTACHED_BROWSER");
  const zygote = samples.find(
    (sample) => sample.role === "zygote" && namespaceSandboxed(sample, worker),
  );
  requireEvidence(zygote !== undefined, "MISSING_SANDBOXED_ZYGOTE");
  const renderer = samples.find(
    (sample) =>
      sample.role === "renderer" &&
      namespaceSandboxed(sample, worker) &&
      sample.seccomp === 2 &&
      sample.seccompFilters > worker.seccompFilters,
  );
  requireEvidence(renderer !== undefined, "MISSING_SANDBOXED_RENDERER");
  return {
    selectedMechanism: "userns",
    profileName: PROFILE_NAME,
    worker,
    browser,
    zygote,
    renderer,
    observations: samples.length,
  };
}

async function boundedRead(file: string, maximum = 32 * 1024): Promise<string> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    requireEvidence(length <= maximum, "PROC_READ_EXCEEDS_BOUND");
    return buffer.subarray(0, length).toString("utf8");
  } finally {
    await handle.close();
  }
}

function disappeared(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ESRCH";
}

async function snapshotProcess(
  pid: number,
  controlGroup: string,
): Promise<SandboxProcessSnapshot | undefined> {
  const root = `/proc/${pid}`;
  const isMember = async () =>
    (await boundedRead(`${root}/cgroup`, 4096)).trim() === `0::${controlGroup}`;
  try {
    if (!(await isMember())) return undefined;
    const status = await boundedRead(`${root}/status`);
    if (/^State:\s+[ZX]\b/mu.test(status)) return undefined;
    const cmdline = (await boundedRead(`${root}/cmdline`)).split("\u0000").filter(Boolean);
    if (cmdline.length === 0) return undefined;
    const [user, pidNamespace, net, profile, uidMap, gidMap, setgroups] = await Promise.all([
      readlink(`${root}/ns/user`),
      readlink(`${root}/ns/pid`),
      readlink(`${root}/ns/net`),
      boundedRead(`${root}/attr/current`, 1024),
      boundedRead(`${root}/uid_map`, 4096),
      boundedRead(`${root}/gid_map`, 4096),
      boundedRead(`${root}/setgroups`, 64),
    ]);
    if (!(await isMember())) return undefined;
    return {
      pid,
      cmdline,
      status,
      namespaces: { user, pid: pidNamespace, net },
      profile,
      uidMap,
      gidMap,
      setgroups,
    };
  } catch (error) {
    if (disappeared(error)) return undefined;
    throw new ChromiumSandboxEvidenceError(
      `PROC_READ_${(error as NodeJS.ErrnoException).code ?? "UNKNOWN"}`,
    );
  }
}

/** Host-side read-only observer; caller supplies the already verified unit cgroup. */
export function startChromiumSandboxObserver(
  controlGroup: string,
  mainPID: number,
): { stop(): Promise<SandboxEvidence> } {
  requireEvidence(Number.isSafeInteger(mainPID) && mainPID > 0, "INVALID_MAIN_PID");
  const directory = cgroupDirectory(controlGroup, path.posix.basename(controlGroup));
  let stopped = false;
  let wake: (() => void) | undefined;
  let failure: unknown;
  let worker: SandboxProcessEvidence | undefined;
  const samples: SandboxProcessEvidence[] = [];
  const seen = new Set<string>();
  const loop = (async () => {
    const deadline = Date.now() + OBSERVATION_LIMIT_MS;
    try {
      while (!stopped && Date.now() < deadline) {
        let processText: string;
        try {
          processText = await readCgroupFile(`${directory}/cgroup.procs`);
        } catch (error) {
          if (disappeared(error)) break;
          throw error;
        }
        const processes = processText.trim() === "" ? [] : numbers(processText);
        requireEvidence(
          processes.length <= MAX_PROCESSES && processes.every((pid) => pid > 0),
          "INVALID_CGROUP_PROCESSES",
        );
        for (const pid of processes) {
          if (stopped) break;
          const snapshot = await snapshotProcess(pid, controlGroup);
          if (!snapshot) continue;
          const sample = parseSandboxProcessSnapshot(snapshot, mainPID);
          if (!sample) continue;
          if (sample.role === "worker") {
            worker ??= sample;
            continue;
          }
          const key = JSON.stringify(sample);
          if (!seen.has(key)) {
            requireEvidence(samples.length < 512, "EXCESSIVE_SANDBOX_OBSERVATIONS");
            seen.add(key);
            samples.push(sample);
          }
        }
        if (!stopped)
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              wake = undefined;
              resolve();
            }, POLL_INTERVAL_MS);
            wake = () => {
              clearTimeout(timer);
              wake = undefined;
              resolve();
            };
          });
      }
    } catch (error) {
      failure = error;
    }
  })();
  return {
    async stop() {
      stopped = true;
      wake?.();
      await loop;
      if (failure) throw failure;
      return verifyChromiumSandboxEvidence(worker, samples);
    },
  };
}
