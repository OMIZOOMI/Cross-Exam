import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";

const files = ["memory.max", "memory.swap.max", "pids.max", "cpu.max", "cgroup.procs"] as const;
export type CgroupValues = Record<(typeof files)[number], string | null>;
export type ActiveCgroup = {
  controlGroup: string;
  mainPID: number;
  invocationID: string;
  pidMember: true;
  values: CgroupValues;
};
export type ControlGroupCleanupState = "absent" | "empty" | "populated" | "error";
export class CgroupVerificationError extends Error {
  constructor(
    message: string,
    readonly values?: CgroupValues,
  ) {
    super(message);
    this.name = "CgroupVerificationError";
  }
}

export function cgroupDirectory(controlGroup: string, unit: string): string {
  if (
    !/^crossexam-isolation-[a-zA-Z0-9-]+\.service$/.test(unit) ||
    controlGroup.length > 4096 ||
    !/^\/(?:[A-Za-z0-9_.@-]+\/)*[A-Za-z0-9_.@-]+$/.test(controlGroup) ||
    controlGroup.split("/").some((part) => part === "." || part === "..") ||
    path.posix.basename(controlGroup) !== unit
  )
    throw new CgroupVerificationError("Invalid or ambiguous cgroup path.");
  return `/sys/fs/cgroup${controlGroup}`;
}

export function activeIdentity(properties: Record<string, string>, unit: string) {
  if (
    properties.LoadState !== "loaded" ||
    properties.ActiveState !== "active" ||
    !/^[1-9]\d*$/.test(properties.MainPID ?? "") ||
    !Number.isSafeInteger(Number(properties.MainPID)) ||
    !/^[a-f\d]{32}$/.test(properties.InvocationID ?? "") ||
    /^0+$/.test(properties.InvocationID ?? "")
  )
    throw new CgroupVerificationError("Service identity is not verifiably active.");
  const controlGroup = properties.ControlGroup ?? "";
  cgroupDirectory(controlGroup, unit);
  if (
    properties.MemoryMax !== "1073741824" ||
    properties.MemorySwapMax !== "0" ||
    properties.TasksMax !== "128" ||
    !["1s", "1000000us", "1000000"].includes(properties.CPUQuotaPerSecUSec ?? "")
  )
    throw new CgroupVerificationError(
      "Active service configuration does not match requested limits.",
    );
  return {
    controlGroup,
    mainPID: Number(properties.MainPID),
    invocationID: properties.InvocationID as string,
  };
}

/** Fixed kernel files only. Reject symlinked directories/files and bound virtual-file reads. */
export async function readCgroupFile(file: string): Promise<string> {
  const directory = path.posix.dirname(file);
  const name = path.posix.basename(file);
  const group = directory.slice("/sys/fs/cgroup".length);
  if (
    cgroupDirectory(group, path.posix.basename(group)) !== directory ||
    (!(files as readonly string[]).includes(name) && name !== "cgroup.events")
  )
    throw new CgroupVerificationError("Unexpected cgroup file.");
  if ((await realpath(directory)) !== directory)
    throw new CgroupVerificationError("Symlinked cgroup directory.");
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const buffer = Buffer.alloc(16 * 1024 + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 16 * 1024) throw new CgroupVerificationError("Cgroup file exceeds bound.");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/** The reader seam is internal to this package; no production caller supplies kernel values. */
export async function verifyActiveCgroup(
  properties: Record<string, string>,
  unit: string,
  read: (file: string) => Promise<string> = readCgroupFile,
): Promise<ActiveCgroup> {
  const identity = activeIdentity(properties, unit);
  const directory = cgroupDirectory(identity.controlGroup, unit);
  const values = Object.fromEntries(files.map((name) => [name, null])) as CgroupValues;
  const results = await Promise.allSettled(
    files.map(async (name) => {
      const value = await read(`${directory}/${name}`);
      if (Buffer.byteLength(value) > 16 * 1024) throw new Error("Oversized kernel value");
      values[name] = value.trim();
    }),
  );
  if (results.some((result) => result.status === "rejected"))
    throw new CgroupVerificationError("Required cgroup files could not be read.", values);
  const cpu = /^([1-9]\d*)[ \t]+([1-9]\d*)$/.exec(values["cpu.max"] ?? "");
  const processes = values["cgroup.procs"]?.split("\n") ?? [];
  if (
    values["memory.max"] !== "1073741824" ||
    values["memory.swap.max"] !== "0" ||
    values["pids.max"] !== "128" ||
    !cpu ||
    BigInt(cpu[1] as string) !== BigInt(cpu[2] as string) ||
    !processes.length ||
    processes.some((pid) => !/^[1-9]\d*$/.test(pid)) ||
    !processes.includes(String(identity.mainPID))
  )
    throw new CgroupVerificationError(
      "Active kernel limits or PID membership do not match.",
      values,
    );
  return { ...identity, pidMember: true, values };
}

type ControlGroupInspectionDependencies = {
  resolvePath: (directory: string) => Promise<string>;
  read: (file: string) => Promise<string>;
};

const productionInspectionDependencies: ControlGroupInspectionDependencies = {
  resolvePath: realpath,
  read: readCgroupFile,
};

export async function inspectControlGroup(
  controlGroup: string,
  dependencies: ControlGroupInspectionDependencies = productionInspectionDependencies,
): Promise<ControlGroupCleanupState> {
  let directory: string;
  try {
    directory = cgroupDirectory(controlGroup, path.posix.basename(controlGroup));
    await dependencies.resolvePath(directory);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "error";
  }
  try {
    // populated covers all descendants, unlike reading only this group's cgroup.procs.
    const events = await dependencies.read(`${directory}/cgroup.events`);
    const populated = events
      .split("\n")
      .filter((line) => line.startsWith("populated "))
      .join("");
    if (populated === "populated 0") return "empty";
    if (populated === "populated 1") return "populated";
    return "error";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "error";
  }
}

export async function verifyControlGroupEmpty(controlGroup: string): Promise<boolean> {
  const state = await inspectControlGroup(controlGroup);
  return state === "absent" || state === "empty";
}
