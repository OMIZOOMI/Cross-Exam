import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { BrowserIsolationUnavailableError } from "./isolation";

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
  nodeExecutable?: string;
};

export type LinuxIsolationResult = {
  unit: string;
  exitCode: number;
  stdout: string;
  stderr?: string;
  timedOut: boolean;
  properties: Record<string, string>;
  cleaned: boolean;
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

type LinuxBackendDependencies = {
  platform: NodeJS.Platform;
  execute: (request: CommandRequest) => Promise<CommandResult>;
  validateEnvironment: (options: Required<LinuxIsolationOptions>) => Promise<string | null>;
  verifyControlGroupEmpty: (controlGroup: string) => Promise<boolean>;
  uuid: () => string;
};

const REQUIRED_PROPERTIES = [
  "Result",
  "MemoryMax",
  "TasksMax",
  "CPUQuotaPerSecUSec",
  "ControlGroup",
  "MainPID",
  "ExecMainStatus",
] as const;

const CLEANUP_PROPERTIES = [
  "ActiveState",
  "SubState",
  "ControlGroup",
  "MainPID",
  "TasksCurrent",
] as const;

const productionDependencies: LinuxBackendDependencies = {
  platform: process.platform,
  execute: executeCommand,
  validateEnvironment,
  verifyControlGroupEmpty,
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

    return { available: true, reason: "available" };
  }

  async run(mode: ProbeMode, input: object): Promise<LinuxIsolationResult> {
    if (!(PROBE_MODES as readonly string[]).includes(mode)) {
      throw new TypeError("Unsupported isolation probe mode.");
    }
    const serializedInput = serializeInput(input);
    const detection = await this.detect();
    if (!detection.available) {
      throw new BrowserIsolationUnavailableError();
    }

    const unit = `crossexam-isolation-${this.#dependencies.uuid()}.service`;
    const runRequest = this.#buildRunRequest(unit, mode, serializedInput);
    let execution: CommandResult | undefined;
    let properties: Record<string, string> = {};
    let cleaned = false;

    try {
      execution = await this.#dependencies.execute(runRequest);
      const shown = await this.#show(unit, REQUIRED_PROPERTIES);
      if (shown.exitCode !== 0 || shown.timedOut) {
        throw new Error("Unable to inspect the transient isolation service.");
      }
      properties = parseProperties(shown.stdout);
      assertAppliedLimits(properties, unit);
    } finally {
      cleaned = await this.#cleanup(unit, properties.ControlGroup || `/system.slice/${unit}`);
    }

    if (execution === undefined) {
      throw new Error("The transient isolation service did not start.");
    }

    const serviceExitCode = parseExitCode(properties.ExecMainStatus, execution.exitCode);
    return {
      unit,
      exitCode: serviceExitCode,
      stdout: truncateUtf8(execution.stdout, MAX_OUTPUT_BYTES),
      ...(execution.stderr ? { stderr: truncateUtf8(execution.stderr, MAX_OUTPUT_BYTES) } : {}),
      timedOut: execution.timedOut || properties.Result === "timeout",
      properties,
      cleaned,
    };
  }

  #buildRunRequest(unit: string, mode: ProbeMode, input: string): CommandRequest {
    const { browserDirectory, nodeExecutable, runtimeDirectory, socketDirectory } = this.#options;
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
      "--property=TemporaryFileSystem=/tmp",
      `--property=BindReadOnlyPaths=${runtimeDirectory}:/app`,
      `--property=BindReadOnlyPaths=${browserDirectory}:/browser`,
      `--property=BindReadOnlyPaths=${socketDirectory}:/run/crossexam`,
      `--property=BindReadOnlyPaths=${nodeExecutable}:/runtime/node`,
      `--property=BindReadOnlyPaths=${path.join(runtimeDirectory, "resolv.conf")}:/etc/resolv.conf`,
      `--property=BindReadOnlyPaths=${path.join(runtimeDirectory, "hosts")}:/etc/hosts`,
      "--property=ReadWritePaths=/tmp",
      "--property=WorkingDirectory=/app",
      "/usr/bin/env",
      "-i",
      "HOME=/tmp",
      "TMPDIR=/tmp",
      "PATH=/runtime:/usr/bin:/bin",
      "PLAYWRIGHT_BROWSERS_PATH=/browser",
      "LANG=C",
      "/runtime/node",
      "/app/probe.cjs",
      mode,
    ];

    return {
      file: SUDO,
      args: systemdArgs,
      input,
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

  async #cleanup(unit: string, originalControlGroup: string): Promise<boolean> {
    try {
      await this.#dependencies.execute({
        file: SUDO,
        args: ["-n", "--", SYSTEMCTL, "kill", "--kill-who=all", "--signal=SIGKILL", unit],
        timeoutMs: 5_000,
      });
      const stop = await this.#dependencies.execute({
        file: SUDO,
        args: ["-n", "--", SYSTEMCTL, "stop", unit],
        timeoutMs: 5_000,
      });

      const shown = await this.#show(unit, CLEANUP_PROPERTIES);
      let inactive = false;
      let controlGroup = originalControlGroup;
      if (shown.exitCode === 0 && !shown.timedOut) {
        const finalProperties = parseProperties(shown.stdout);
        inactive = isInactiveAndEmpty(finalProperties);
        controlGroup = finalProperties.ControlGroup || controlGroup;
      } else {
        const active = await this.#dependencies.execute({
          file: SUDO,
          args: ["-n", "--", SYSTEMCTL, "is-active", "--quiet", unit],
          timeoutMs: 5_000,
        });
        inactive = !active.timedOut && (active.exitCode === 3 || active.exitCode === 4);
      }

      const cgroupEmpty = await this.#dependencies.verifyControlGroupEmpty(controlGroup);
      const reset = await this.#dependencies.execute({
        file: SUDO,
        args: ["-n", "--", SYSTEMCTL, "reset-failed", unit],
        timeoutMs: 5_000,
      });

      return (
        !stop.timedOut &&
        (stop.exitCode === 0 || stop.exitCode === 5) &&
        inactive &&
        cgroupEmpty &&
        !reset.timedOut &&
        (reset.exitCode === 0 || reset.exitCode === 5)
      );
    } catch {
      return false;
    }
  }
}

async function executeCommand(request: CommandRequest): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(request.file, [...request.args], {
      cwd: "/",
      env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];
    let capturedBytes = 0;
    let observedBytes = 0;
    let timedOut = false;
    let settled = false;

    const consume = (chunk: Buffer, retain: boolean) => {
      observedBytes += chunk.length;
      if (retain && capturedBytes < MAX_OUTPUT_BYTES) {
        const remaining = MAX_OUTPUT_BYTES - capturedBytes;
        const portion = chunk.subarray(0, remaining);
        chunks.push(portion);
        capturedBytes += portion.length;
      }
      if (
        !retain &&
        errorChunks.reduce((sum, item) => sum + item.byteLength, 0) < MAX_OUTPUT_BYTES
      ) {
        errorChunks.push(chunk.subarray(0, MAX_OUTPUT_BYTES));
      }
      if (observedBytes > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
      }
    };

    child.stdout.on("data", (chunk: Buffer) => consume(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => consume(chunk, false));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, request.timeoutMs);
    timer.unref();

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout: Buffer.concat(chunks, capturedBytes).toString("utf8"),
        stderr: Buffer.concat(errorChunks).subarray(0, MAX_OUTPUT_BYTES).toString("utf8"),
        timedOut,
      });
    };

    child.once("error", () => finish(127));
    child.once("close", (code, signal) => finish(code ?? (signal === "SIGKILL" ? 137 : 1)));
    child.stdin.on("error", () => undefined);
    child.stdin.end(request.input);
  });
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

async function verifyControlGroupEmpty(controlGroup: string): Promise<boolean> {
  if (controlGroup === "") return true;
  if (
    !controlGroup.startsWith("/") ||
    controlGroup.includes("..") ||
    !/^\/[A-Za-z0-9_.@:/\\-]+$/.test(controlGroup)
  ) {
    return false;
  }
  try {
    const processes = await readFile(
      path.join("/sys/fs/cgroup", controlGroup, "cgroup.procs"),
      "utf8",
    );
    return processes.trim() === "";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
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

function assertAppliedLimits(properties: Record<string, string>, unit: string): void {
  for (const name of REQUIRED_PROPERTIES) {
    if (!(name in properties)) {
      throw new Error(`Missing transient service property: ${name}.`);
    }
  }
  if (
    properties.MemoryMax !== "1073741824" ||
    properties.TasksMax !== "128" ||
    !["1s", "1000000us", "1000000"].includes(properties.CPUQuotaPerSecUSec ?? "") ||
    !/^\/[A-Za-z0-9_.@:/\\-]+$/.test(properties.ControlGroup || `/system.slice/${unit}`) ||
    !/^\d+$/.test(properties.MainPID ?? "") ||
    !/^\d+$/.test(properties.ExecMainStatus ?? "")
  ) {
    throw new Error(
      `Transient service limits were not applied as requested: ${JSON.stringify(properties)}`,
    );
  }
}

function isInactiveAndEmpty(properties: Record<string, string>): boolean {
  const state = properties.ActiveState;
  const tasks = properties.TasksCurrent;
  return (
    state !== undefined &&
    !["active", "activating", "deactivating", "reloading"].includes(state) &&
    properties.MainPID === "0" &&
    (tasks === "0" || tasks === "" || tasks === "[not set]")
  );
}

function parseExitCode(value: string | undefined, fallback: number): number {
  if (value === undefined || !/^\d+$/.test(value)) return fallback;
  return Math.min(Number(value), 255);
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
