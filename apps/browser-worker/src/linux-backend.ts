import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { BrowserIsolationUnavailableError } from "./isolation";
import {
  type ActiveCgroup,
  activeIdentity,
  CgroupVerificationError,
  type ControlGroupCleanupState,
  cgroupDirectory,
  inspectControlGroup,
  readCgroupFile,
  verifyActiveCgroup,
} from "./linux-cgroup";
import { validatePreparedRoot } from "./linux-root";

const GETENT = "/usr/bin/getent";
const SUDO = "/usr/bin/sudo";
const SYSTEMCTL = "/usr/bin/systemctl";
const SYSTEMD_RUN = "/usr/bin/systemd-run";
const WORKER_USER = "crossexam-worker";
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 64 * 1024;

const PROBE_MODES = [
  "network",
  "filesystem",
  "pids",
  "memory",
  "timeout",
  "browser",
  "tls",
  "proxy-down",
] as const;

export type ProbeMode = (typeof PROBE_MODES)[number];

export type LinuxIsolationOptions = {
  runtimeDirectory: string;
  browserDirectory: string;
  socketDirectory: string;
  rootDirectory?: string;
  nodeExecutable?: string;
};

export type LinuxIsolationResult = {
  unit: string;
  exitCode: number;
  stdout: string;
  stderr?: string;
  timedOut: boolean;
  properties: Record<string, string>;
  active: { properties: Record<string, string>; cgroup: ActiveCgroup };
  cleanup: CleanupEvidence;
  cleaned: boolean;
};

export type CleanupCommandEvidence = {
  exitCode: number;
  timedOut: boolean;
};

export type CleanupEvidence = {
  kill: CleanupCommandEvidence;
  stop: CleanupCommandEvidence;
  finalQuery: CleanupCommandEvidence;
  finalState: Record<string, string>;
  inactive: boolean;
  capturedCgroup: string | null;
  cgroup: ControlGroupCleanupState | "not-checked";
  resetFailed: CleanupCommandEvidence;
  finalCleaned: boolean;
};

type CommandRequest = {
  file: string;
  args: readonly string[];
  input?: string;
  timeoutMs: number;
};

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr?: string;
  timedOut: boolean;
};

type RunningCommand = {
  completion: Promise<CommandResult>;
  readonly finished: boolean;
  release(input?: string): void;
  terminate(): void;
};

type LinuxBackendDependencies = {
  platform: NodeJS.Platform;
  execute: (request: CommandRequest) => Promise<CommandResult>;
  start: (request: CommandRequest) => RunningCommand;
  readCgroupFile: (file: string) => Promise<string>;
  pause: () => Promise<void>;
  validateEnvironment: (options: Required<LinuxIsolationOptions>) => Promise<string | null>;
  validatePreparedRoot: (root: string, owner: number) => Promise<void>;
  inspectControlGroup: (controlGroup: string) => Promise<ControlGroupCleanupState>;
  uuid: () => string;
};

const ACTIVE_PROPERTIES = [
  "LoadState",
  "ActiveState",
  "SubState",
  "InvocationID",
  "MemoryMax",
  "MemorySwapMax",
  "TasksMax",
  "CPUQuotaPerSecUSec",
  "ControlGroup",
  "MainPID",
] as const;
const TERMINAL_PROPERTIES = [
  "LoadState",
  "ActiveState",
  "InvocationID",
  "Result",
  "ExecMainCode",
  "ExecMainStatus",
] as const;

const CLEANUP_PROPERTIES = [
  "LoadState",
  "ActiveState",
  "SubState",
  "ControlGroup",
  "MainPID",
  "TasksCurrent",
] as const;

const productionDependencies: LinuxBackendDependencies = {
  platform: process.platform,
  execute: executeCommand,
  start: startCommand,
  readCgroupFile,
  pause: () => new Promise((resolve) => setTimeout(resolve, 50)),
  validateEnvironment,
  validatePreparedRoot,
  inspectControlGroup,
  uuid: randomUUID,
};

/**
 * Linux-only process boundary for the fixed worker probe. This class deliberately
 * has no generic executable/argv or caller-supplied isolation override.
 */
export class LinuxIsolationBackend {
  readonly #options: Required<LinuxIsolationOptions>;
  readonly #dependencies: LinuxBackendDependencies;

  constructor(
    options: LinuxIsolationOptions,
    dependencies: LinuxBackendDependencies = productionDependencies,
  ) {
    this.#options = {
      ...options,
      rootDirectory: options.rootDirectory ?? path.join(options.runtimeDirectory, "root"),
      nodeExecutable: options.nodeExecutable ?? process.execPath,
    };
    this.#dependencies = dependencies;
  }

  async detect(): Promise<{ available: boolean; reason: string }> {
    if (this.#dependencies.platform !== "linux") {
      return { available: false, reason: "platform-not-linux" };
    }

    const environmentReason = await this.#dependencies.validateEnvironment(this.#options);
    if (environmentReason !== null) {
      return { available: false, reason: environmentReason };
    }

    const checks: readonly [string, string, readonly string[]][] = [
      ["systemd-unavailable", SYSTEMCTL, ["show", "--property=Version", "--value"]],
      ["sudo-systemd-run-denied", SUDO, ["-n", "--", SYSTEMD_RUN, "--version"]],
      ["sudo-systemctl-denied", SUDO, ["-n", "--", SYSTEMCTL, "--version"]],
      ["worker-user-unavailable", GETENT, ["passwd", WORKER_USER]],
    ];

    for (const [reason, file, args] of checks) {
      const result = await this.#dependencies.execute({ file, args, timeoutMs: 5_000 });
      if (result.exitCode !== 0 || result.timedOut) {
        return { available: false, reason };
      }
      if (file === GETENT && !isUnprivilegedWorkerRecord(result.stdout)) {
        return { available: false, reason };
      }
    }

    try {
      await this.#dependencies.validatePreparedRoot(this.#options.rootDirectory, 0);
    } catch {
      return { available: false, reason: "prepared-root-unavailable" };
    }

    return { available: true, reason: "available" };
  }

  async run(
    mode: ProbeMode,
    input: object,
    observeVerifiedActive?: (active: ActiveCgroup) => void,
  ): Promise<LinuxIsolationResult> {
    if (!(PROBE_MODES as readonly string[]).includes(mode)) {
      throw new TypeError("Unsupported isolation probe mode.");
    }
    const serializedInput = serializeInput(input);
    const detection = await this.detect();
    if (!detection.available) {
      throw new BrowserIsolationUnavailableError();
    }

    const unit = `crossexam-isolation-${this.#dependencies.uuid()}.service`;
    const runRequest = this.#buildRunRequest(unit, mode);
    let launcher: RunningCommand | undefined;
    let execution: CommandResult | undefined;
    let activeProperties: Record<string, string> = {};
    let cgroup: ActiveCgroup | undefined;
    let capturedGroup: string | undefined;
    let properties: Record<string, string> = {};
    let cleanup = emptyCleanupEvidence();
    let phase = "startup";
    let failure: unknown;

    try {
      launcher = this.#dependencies.start(runRequest);
      const deadline = Date.now() + 5_000;
      while (true) {
        if (launcher.finished) throw new Error("Launcher exited before active verification.");
        const shown = await this.#show(unit, ACTIVE_PROPERTIES);
        activeProperties = parseProperties(shown.stdout);
        if (shown.timedOut || Date.now() >= deadline)
          throw new Error("Active-service startup deadline.");
        if (shown.exitCode === 0 && activeProperties.ActiveState === "active") break;
        if (
          activeProperties.ActiveState === "failed" ||
          activeProperties.ActiveState === "deactivating"
        )
          throw new Error("Service failed before active verification.");
        await this.#dependencies.pause();
      }
      phase = "active-cgroup";
      // Capture only an actually observed, unit-specific path, including when a later check fails.
      cgroupDirectory(activeProperties.ControlGroup ?? "", unit);
      capturedGroup = activeProperties.ControlGroup;
      cgroup = await verifyActiveCgroup(activeProperties, unit, this.#dependencies.readCgroupFile);
      const confirmation = await this.#show(unit, ACTIVE_PROPERTIES);
      const confirmed = activeIdentity(parseProperties(confirmation.stdout), unit);
      if (
        confirmation.exitCode !== 0 ||
        confirmation.timedOut ||
        launcher.finished ||
        confirmed.controlGroup !== cgroup.controlGroup ||
        confirmed.mainPID !== cgroup.mainPID ||
        confirmed.invocationID !== cgroup.invocationID
      )
        throw new Error("Service identity changed before probe release.");
      // Read-only fixture observer starts only after the full active barrier.
      // It cannot replace verification or release input before it succeeds.
      observeVerifiedActive?.(cgroup);
      phase = "probe-completion";
      // The fixed probe reads to stdin EOF. No probe operation can run before this point.
      launcher.release(serializedInput);
      execution = await launcher.completion;
      phase = "terminal-evidence";
      const shown = await this.#show(unit, TERMINAL_PROPERTIES);
      if (shown.timedOut) throw new Error("Terminal evidence query timed out.");
      properties = parseProperties(shown.stdout);
      // A successful transient service may already be unloaded. Its launcher status is authoritative.
      // Failed units are retained by systemd (no --collect): require their original invocation identity.
      if (
        execution.exitCode !== 0 &&
        !execution.timedOut &&
        (shown.exitCode !== 0 ||
          properties.LoadState !== "loaded" ||
          properties.InvocationID !== cgroup.invocationID ||
          properties.ActiveState !== "failed")
      )
        throw new Error("Unable to identify failed service outcome.");
    } catch (error) {
      failure = error;
    } finally {
      cleanup = await this.#cleanup(unit, capturedGroup);
      // Stop the launcher only after stopping its service, including startup/verification failures.
      if (launcher && !launcher.finished) launcher.terminate();
      if (launcher) execution ??= await launcher.completion;
    }

    if (failure || !execution || !cgroup) {
      throw new Error(
        `Linux isolation failure: ${JSON.stringify({
          phase,
          unit,
          activeProperties,
          controlGroup: capturedGroup ?? null,
          kernelValues:
            failure instanceof CgroupVerificationError ? failure.values : cgroup?.values,
          cleanup,
          cleaned: cleanup.finalCleaned,
          message: failure instanceof Error ? failure.message : "Incomplete execution",
          launcher: execution,
        })}`,
      );
    }
    return {
      unit,
      exitCode: execution.exitCode,
      stdout: truncateUtf8(execution.stdout, MAX_OUTPUT_BYTES),
      ...(execution.stderr ? { stderr: truncateUtf8(execution.stderr, MAX_OUTPUT_BYTES) } : {}),
      timedOut:
        execution.timedOut ||
        (properties.InvocationID === cgroup.invocationID && properties.Result === "timeout"),
      properties,
      active: { properties: activeProperties, cgroup },
      cleanup,
      cleaned: cleanup.finalCleaned,
    };
  }

  #buildRunRequest(unit: string, mode: ProbeMode): CommandRequest {
    const { socketDirectory } = this.#options;
    const systemdArgs = [
      "-n",
      "--",
      SYSTEMD_RUN,
      "--quiet",
      "--pipe",
      "--wait",
      "--service-type=exec",
      `--unit=${unit}`,
      "--property=User=crossexam-worker",
      "--property=Group=crossexam-worker",
      "--property=SupplementaryGroups=",
      "--property=KillMode=control-group",
      "--property=MemoryMax=1073741824",
      "--property=MemorySwapMax=0",
      "--property=OOMPolicy=kill",
      "--property=TasksMax=128",
      "--property=CPUQuota=100%",
      `--property=RuntimeMaxSec=${mode === "timeout" ? 10 : 45}s`,
      "--property=LimitNOFILE=1024",
      "--property=TimeoutStopSec=5s",
      "--property=NoNewPrivileges=yes",
      "--property=CapabilityBoundingSet=",
      "--property=AmbientCapabilities=",
      "--property=PrivateIPC=yes",
      "--property=ProtectProc=invisible",
      // ProcSubset=pid hides /proc/net etc. The network probe must read the
      // private namespace route files, so the pid subset applies only to the
      // filesystem probe, which verifies restricted /proc behavior.
      ...(mode === "filesystem" ? ["--property=ProcSubset=pid"] : []),
      "--property=PrivateDevices=yes",
      "--property=PrivateNetwork=yes",
      "--property=PrivateTmp=yes",
      "--property=ProtectHome=yes",
      "--property=ProtectSystem=strict",
      "--property=ProtectKernelModules=yes",
      "--property=ProtectKernelTunables=yes",
      "--property=ProtectControlGroups=yes",
      "--property=RestrictSUIDSGID=yes",
      "--property=LockPersonality=yes",
      "--property=UMask=0077",
      `--property=RootDirectory=${this.#options.rootDirectory}`,
      "--property=TemporaryFileSystem=/tmp",
      `--property=BindReadOnlyPaths=${path.join(socketDirectory, "proxy.sock")}:/run/crossexam/proxy.sock`,
      "--property=ReadWritePaths=/tmp",
      "--property=WorkingDirectory=/app",
      "/usr/bin/env",
      "-i",
      "HOME=/tmp",
      "TMPDIR=/tmp",
      "PATH=/runtime:/usr/bin:/bin",
      "PLAYWRIGHT_BROWSERS_PATH=/browser",
      "LANG=C",
      // Task 10D-B only: retain bounded raw launch logs before Playwright rewrites them.
      ...(mode === "browser" ? ["DEBUG=pw:browser"] : []),
      "/runtime/node",
      "/app/probe.cjs",
      mode,
    ];

    return {
      file: SUDO,
      args: systemdArgs,
      timeoutMs: 50_000,
    };
  }

  async #show(unit: string, names: readonly string[]): Promise<CommandResult> {
    return this.#dependencies.execute({
      file: SUDO,
      args: [
        "-n",
        "--",
        SYSTEMCTL,
        "show",
        unit,
        "--no-pager",
        ...names.map((name) => `--property=${name}`),
      ],
      timeoutMs: 5_000,
    });
  }

  async #cleanup(unit: string, originalControlGroup: string | undefined): Promise<CleanupEvidence> {
    const capturedCgroup = originalControlGroup ?? null;
    let kill: CleanupCommandEvidence = { exitCode: 127, timedOut: false };
    let stop: CleanupCommandEvidence = { exitCode: 127, timedOut: false };
    let finalQuery: CleanupCommandEvidence = { exitCode: 127, timedOut: false };
    let finalState: Record<string, string> = {};
    let cgroup: ControlGroupCleanupState | "not-checked" = "not-checked";
    let resetFailed: CleanupCommandEvidence = { exitCode: 127, timedOut: false };
    try {
      const killResult = await this.#dependencies.execute({
        file: SUDO,
        args: ["-n", "--", SYSTEMCTL, "kill", "--kill-who=all", "--signal=SIGKILL", unit],
        timeoutMs: 5_000,
      });
      kill = commandEvidence(killResult);
      const stopResult = await this.#dependencies.execute({
        file: SUDO,
        args: ["-n", "--", SYSTEMCTL, "stop", unit],
        timeoutMs: 5_000,
      });
      stop = commandEvidence(stopResult);

      const shown = await this.#show(unit, CLEANUP_PROPERTIES);
      finalQuery = commandEvidence(shown);
      if (shown.exitCode === 0 && !shown.timedOut) finalState = parseProperties(shown.stdout);

      if (originalControlGroup !== undefined)
        cgroup = await this.#dependencies.inspectControlGroup(originalControlGroup);
      const resetResult = await this.#dependencies.execute({
        file: SUDO,
        args: ["-n", "--", SYSTEMCTL, "reset-failed", unit],
        timeoutMs: 5_000,
      });
      resetFailed = commandEvidence(resetResult);
    } catch {
      // The structured result below records the last completed proof step.
    }
    return assessCleanup({
      kill,
      stop,
      finalQuery,
      finalState,
      capturedCgroup,
      cgroup,
      resetFailed,
    });
  }
}

type CleanupAssessmentInput = Omit<CleanupEvidence, "inactive" | "finalCleaned">;

export function assessCleanup(input: CleanupAssessmentInput): CleanupEvidence {
  const inactive = isInactiveAndEmpty(input.finalState);
  const cgroupEmpty = input.cgroup === "absent" || input.cgroup === "empty";
  const finalCleaned =
    !input.stop.timedOut &&
    !input.finalQuery.timedOut &&
    input.finalQuery.exitCode === 0 &&
    inactive &&
    cgroupEmpty;
  return { ...input, inactive, finalCleaned };
}

function commandEvidence(result: CommandResult): CleanupCommandEvidence {
  return { exitCode: result.exitCode, timedOut: result.timedOut };
}

function emptyCleanupEvidence(): CleanupEvidence {
  return assessCleanup({
    kill: { exitCode: 127, timedOut: false },
    stop: { exitCode: 127, timedOut: false },
    finalQuery: { exitCode: 127, timedOut: false },
    finalState: {},
    capturedCgroup: null,
    cgroup: "not-checked",
    resetFailed: { exitCode: 127, timedOut: false },
  });
}

async function executeCommand(request: CommandRequest): Promise<CommandResult> {
  const running = startCommand(request);
  running.release(request.input);
  return running.completion;
}

/** Starts with stdin held open. Completion and input release are deliberately separate. */
export function startCommand(request: CommandRequest): RunningCommand {
  const child = spawn(request.file, [...request.args], {
    cwd: "/",
    env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const chunks: Buffer[] = [];
  const errorChunks: Buffer[] = [];
  let capturedBytes = 0;
  let errorBytes = 0;
  let observedBytes = 0;
  let timedOut = false;
  let finished = false;
  let released = false;
  let finish: (result: CommandResult) => void = () => {};
  const completion = new Promise<CommandResult>((resolve) => {
    finish = resolve;
  });
  const consume = (chunk: Buffer, stderr: boolean) => {
    observedBytes += chunk.length;
    const retained = stderr ? errorBytes : capturedBytes;
    const portion = chunk.subarray(0, Math.max(0, MAX_OUTPUT_BYTES - retained));
    (stderr ? errorChunks : chunks).push(portion);
    if (stderr) errorBytes += portion.length;
    else capturedBytes += portion.length;
    if (observedBytes > MAX_OUTPUT_BYTES) terminate();
  };
  child.stdout.on("data", (chunk: Buffer) => consume(chunk, false));
  child.stderr.on("data", (chunk: Buffer) => consume(chunk, true));
  const terminate = () => {
    child.kill("SIGKILL");
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  };
  const timer = setTimeout(() => {
    timedOut = true;
    terminate();
  }, request.timeoutMs);
  timer.unref();
  const settle = (exitCode: number) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    finish({
      exitCode,
      stdout: Buffer.concat(chunks, capturedBytes).toString("utf8"),
      stderr: Buffer.concat(errorChunks, errorBytes).toString("utf8"),
      timedOut,
    });
  };
  child.once("error", () => settle(127));
  child.once("close", (code, signal) => settle(code ?? (signal === "SIGKILL" ? 137 : 1)));
  child.stdin.on("error", () => undefined);
  return {
    completion,
    get finished() {
      return finished;
    },
    release(input) {
      if (released || finished) throw new Error("Launcher input cannot be released.");
      released = true;
      child.stdin.end(input);
    },
    terminate,
  };
}

async function validateEnvironment(
  options: Required<LinuxIsolationOptions>,
): Promise<string | null> {
  try {
    await access("/sys/fs/cgroup/cgroup.controllers", constants.R_OK);
  } catch {
    return "cgroups-v2-unavailable";
  }

  try {
    await validateMountPath(options.runtimeDirectory, "directory");
    await validateMountPath(options.browserDirectory, "directory");
    await validateMountPath(options.socketDirectory, "directory");
    await validateMountPath(options.nodeExecutable, "file", constants.X_OK);
    assertSeparatedMounts(options);

    const runtimeEntries = await readdir(options.runtimeDirectory);
    const expectedEntries = new Set([
      "hosts",
      "node_modules",
      "probe.cjs",
      "resolv.conf",
      "test-cert.pem",
    ]);
    if (
      runtimeEntries.length !== expectedEntries.size ||
      runtimeEntries.some((entry) => !expectedEntries.has(entry))
    ) {
      return "runtime-layout-invalid";
    }

    await validateMountPath(path.join(options.runtimeDirectory, "node_modules"), "directory");
    await validateMountPath(path.join(options.runtimeDirectory, "probe.cjs"), "file");
    await validateMountPath(path.join(options.runtimeDirectory, "test-cert.pem"), "file");
    await validateMountPath(path.join(options.runtimeDirectory, "resolv.conf"), "file");
    await validateMountPath(path.join(options.runtimeDirectory, "hosts"), "file");
    await assertNoSymlinks(options.runtimeDirectory, 50_000);
    await assertNoSymlinks(options.browserDirectory, 50_000);

    const moduleEntries = await readdir(path.join(options.runtimeDirectory, "node_modules"));
    if (
      moduleEntries.length === 0 ||
      moduleEntries.some(
        (entry) => !["@playwright", "playwright", "playwright-core"].includes(entry),
      ) ||
      !moduleEntries.some((entry) => entry === "@playwright" || entry === "playwright")
    ) {
      return "runtime-layout-invalid";
    }

    const [certificate, resolv, hosts] = await Promise.all([
      readFile(path.join(options.runtimeDirectory, "test-cert.pem"), "utf8"),
      readFile(path.join(options.runtimeDirectory, "resolv.conf"), "utf8"),
      readFile(path.join(options.runtimeDirectory, "hosts"), "utf8"),
    ]);
    if (
      certificate.length > 256 * 1024 ||
      !certificate.includes("-----BEGIN CERTIFICATE-----") ||
      certificate.includes("PRIVATE KEY") ||
      resolv.length > 1_024 ||
      hosts.length > 1_024 ||
      resolv.trim() !== "" ||
      hosts.trim() !== ""
    ) {
      return "runtime-layout-invalid";
    }

    const socketEntries = await readdir(options.socketDirectory);
    if (socketEntries.length !== 1 || socketEntries[0] !== "proxy.sock") {
      return "proxy-socket-unavailable";
    }
    const socket = await lstat(path.join(options.socketDirectory, "proxy.sock"));
    if (!socket.isSocket()) {
      return "proxy-socket-unavailable";
    }
  } catch {
    return "invalid-trusted-paths";
  }

  return null;
}

async function validateMountPath(
  candidate: string,
  kind: "directory" | "file",
  accessMode = constants.R_OK,
): Promise<void> {
  if (
    !path.isAbsolute(candidate) ||
    path.normalize(candidate) !== candidate ||
    candidate.includes("\0") ||
    candidate.includes("\n") ||
    candidate.includes("\r")
  ) {
    throw new Error("Unsafe mount path.");
  }
  const [resolved, information] = await Promise.all([realpath(candidate), lstat(candidate)]);
  if (resolved !== candidate || information.isSymbolicLink()) {
    throw new Error("Symbolic mount path.");
  }
  if (kind === "directory" ? !information.isDirectory() : !information.isFile()) {
    throw new Error("Unexpected mount path type.");
  }
  await access(candidate, accessMode);
}

function assertSeparatedMounts(options: Required<LinuxIsolationOptions>): void {
  const mounts = [options.runtimeDirectory, options.browserDirectory, options.socketDirectory];
  for (let index = 0; index < mounts.length; index += 1) {
    const mount = mounts[index];
    if (mount === undefined) continue;
    for (let other = index + 1; other < mounts.length; other += 1) {
      const otherMount = mounts[other];
      if (otherMount === undefined) continue;
      if (containsPath(mount, otherMount) || containsPath(otherMount, mount)) {
        throw new Error("Mount paths overlap.");
      }
    }
  }

  const forbiddenRoots = [process.cwd(), homedir(), "/home", "/root", "/Users"].filter(
    (root) => root !== "/",
  );
  for (const mount of [
    options.runtimeDirectory,
    options.browserDirectory,
    options.socketDirectory,
    options.nodeExecutable,
  ]) {
    if (forbiddenRoots.some((root) => containsPath(root, mount))) {
      throw new Error("Repository and home paths cannot be mounted.");
    }
  }
}

function containsPath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertNoSymlinks(root: string, limit: number): Promise<void> {
  const pending = [root];
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      visited += 1;
      if (visited > limit || entry.isSymbolicLink()) {
        throw new Error("Unsafe prepared directory.");
      }
      if (entry.isDirectory()) {
        pending.push(path.join(current, entry.name));
      } else if (!entry.isFile()) {
        throw new Error("Unexpected prepared-directory entry.");
      }
    }
  }
}

function isUnprivilegedWorkerRecord(record: string): boolean {
  const fields = record.trim().split(":");
  return fields[0] === WORKER_USER && /^\d+$/.test(fields[2] ?? "") && Number(fields[2]) > 0;
}

function serializeInput(input: object): string {
  assertJsonValue(input, 0, { nodes: 0 });
  const serialized = `${JSON.stringify(input)}\n`;
  if (Buffer.byteLength(serialized) > MAX_INPUT_BYTES) {
    throw new RangeError("Isolation probe input exceeds 64 KiB.");
  }
  return serialized;
}

function assertJsonValue(value: unknown, depth: number, state: { nodes: number }): void {
  state.nodes += 1;
  if (depth > 20 || state.nodes > 10_000) {
    throw new TypeError("Isolation probe input is too complex.");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, depth + 1, state);
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError("Isolation probe input must contain only JSON values.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Isolation probe input must be a plain JSON object.");
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new TypeError("Isolation probe input contains a forbidden key.");
    }
    assertJsonValue(item, depth + 1, state);
  }
}

function parseProperties(output: string): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    properties[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return properties;
}

function isInactiveAndEmpty(properties: Record<string, string>): boolean {
  const state = properties.ActiveState;
  const tasks = properties.TasksCurrent;
  return (
    state !== undefined &&
    !["active", "activating", "deactivating", "reloading"].includes(state) &&
    properties.MainPID === "0" &&
    (tasks === undefined || tasks === "0" || tasks === "" || tasks === "[not set]")
  );
}

function truncateUtf8(value: string, maximumBytes: number): string {
  const bytes = Buffer.from(value);
  return bytes.length <= maximumBytes
    ? value
    : bytes
        .subarray(0, maximumBytes)
        .toString("utf8")
        .replace(/\uFFFD$/u, "");
}
