/**
 * Executable used inside the Linux isolation worker. The host passes one JSON
 * object on stdin (maximum 4 KiB):
 *
 *   {
 *     "hostSentinelPath"?: string, // absolute; default /host-sentinel
 *     "tcpPort"?: number,          // default 41231
 *     "udpPort"?: number,          // default 41232
 *     "proxyOrigin"?: string       // if present, must be the fixed fixture origin
 *   }
 *
 * The first CLI argument is one of: network, filesystem, pids, memory,
 * timeout, browser, tls, or proxy-down. Normal probes emit exactly one
 * `passed`/`failed` JSON record and set a non-zero status on failure. Memory
 * and timeout emit one `ready` record; their required cgroup OOM kill or
 * systemd deadline kill is verified by the host from the service result.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import dgram from "node:dgram";
import {
  lstat,
  open,
  readdir,
  readFile,
  readlink,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import net, { type AddressInfo, type Socket } from "node:net";
import os from "node:os";
import { posix as path } from "node:path";
import tls from "node:tls";
import { collectFixtureBrowserEvidence } from "../../apps/browser-worker/src/browser-collector";
import {
  BrowserRuntimeError,
  toBrowserRuntimeError,
} from "../../apps/browser-worker/src/browser-diagnostics";
import {
  type FixtureWorker,
  launchFixtureWorker,
} from "../../apps/browser-worker/src/fixture-worker";
import { AccessDeniedError, expectDeniedPath } from "../../apps/browser-worker/src/linux-access";
import {
  manifestEntryIssue,
  ROOT_MANIFEST_NAME,
  rootLayoutIssues,
} from "../../apps/browser-worker/src/linux-root-layout";
import {
  type ProcStatusIdentity,
  parseProcStatusIdentity,
  supplementaryGroupsAreEmptyOrPrimary,
} from "../../apps/browser-worker/src/proc-status";
import {
  ACCESSIBILITY_ENGINE_VERSION,
  BROWSER_EVIDENCE_LIMITS,
  BrowserAccessibilityEvidenceSchema,
  type BrowserEvidenceCollection,
  BrowserEvidenceCollectionSchema,
  BrowserPerformanceEvidenceSchema,
} from "../../packages/contracts/src/index";

const MAX_INPUT_BYTES = 4 * 1024;
const MAX_RESULT_BYTES = 8 * 1024;
const SOCKET_TIMEOUT_MS = 500;
const BROWSER_OPERATION_TIMEOUT_MS = 8_000;
const WORKER_TIMEOUT_MS = 25_000;
const UNIX_PROXY_SOCKET = "/run/crossexam/proxy.sock";
const TLS_CA_PATH = "/app/test-cert.pem";
const FIXTURE_ORIGIN = "http://entry.crossexam-fixture.com";
const DEFAULT_HOST_SENTINEL = "/host-sentinel";
const DEFAULT_TCP_PORT = 41_231;
const DEFAULT_UDP_PORT = 41_232;
const MEMORY_LIMIT_BYTES = 1536 * 1024 * 1024;
const MEMORY_CHUNK_BYTES = 16 * 1024 * 1024;

const SENTINEL_ADDRESSES = Object.freeze([
  "127.0.0.1",
  "::1",
  "10.203.0.1",
  "198.18.0.1",
  "169.254.169.254",
  "fd00:ce::1",
  "fe80::1",
]);

const MODES = Object.freeze([
  "network",
  "filesystem",
  "pids",
  "memory",
  "timeout",
  "browser",
  "collector",
  "tls",
  "proxy-down",
] as const);

type Mode = (typeof MODES)[number];

type ProbeInput = Readonly<{
  hostSentinelPath: string;
  repositorySentinelPath: string;
  homeSentinelPath: string;
  worldSentinelPath: string;
  unrelatedSocketPath: string;
  unrelatedPid: number;
  tcpPort: number;
  udpPort: number;
  proxyOrigin: typeof FIXTURE_ORIGIN;
}>;

type SafeDetails = Readonly<Record<string, boolean | number | string>>;

type ProbeRecord =
  | Readonly<{
      version: 1;
      mode: Mode;
      status: "passed";
      checks: SafeDetails;
      browserEvidence?: BrowserEvidenceCollection;
    }>
  | Readonly<{
      version: 1;
      mode: Mode | "invalid";
      status: "failed";
      code: string;
      stage?: string;
      errorClass?: string;
      errorCode?: string;
      message?: string;
    }>
  | Readonly<{
      version: 1;
      mode: "memory" | "timeout";
      status: "ready";
      verification: "oom-kill-required" | "deadline-kill-required";
      checks: SafeDetails;
    }>;

class ProbeFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProbeFailure";
  }
}

function ensure(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ProbeFailure(code);
}

function isMode(value: string | undefined): value is Mode {
  return MODES.some((mode) => mode === value);
}

function validPort(value: unknown, fallback: number, code: string): number {
  if (value === undefined) return fallback;
  ensure(Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 65_535, code);
  return Number(value);
}

function parseInput(value: unknown): ProbeInput {
  ensure(value !== null && typeof value === "object" && !Array.isArray(value), "INVALID_INPUT");
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "hostSentinelPath",
    "repositorySentinelPath",
    "homeSentinelPath",
    "worldSentinelPath",
    "unrelatedSocketPath",
    "unrelatedPid",
    "tcpPort",
    "udpPort",
    "proxyOrigin",
  ]);
  ensure(
    Object.keys(record).every((key) => allowedKeys.has(key)),
    "UNKNOWN_INPUT_FIELD",
  );

  const sentinel = record.hostSentinelPath ?? DEFAULT_HOST_SENTINEL;
  ensure(
    typeof sentinel === "string" &&
      sentinel.length >= 2 &&
      sentinel.length <= 256 &&
      sentinel.startsWith("/") &&
      !sentinel.includes("\0") &&
      path.normalize(sentinel) === sentinel,
    "INVALID_SENTINEL_PATH",
  );

  const proxyOrigin = record.proxyOrigin ?? FIXTURE_ORIGIN;
  ensure(proxyOrigin === FIXTURE_ORIGIN, "INVALID_FIXTURE_ORIGIN");
  const pathFields = [
    "repositorySentinelPath",
    "homeSentinelPath",
    "worldSentinelPath",
    "unrelatedSocketPath",
  ] as const;
  const pathValues = Object.fromEntries(pathFields.map((key) => [key, record[key]])) as Record<
    (typeof pathFields)[number],
    unknown
  >;
  for (const key of pathFields) {
    const value = pathValues[key];
    ensure(
      typeof value === "string" &&
        value.length >= 2 &&
        value.startsWith("/") &&
        path.normalize(value) === value &&
        !value.includes("\0"),
      `INVALID_${key}`,
    );
  }
  const unrelatedPid = record.unrelatedPid;
  ensure(Number.isSafeInteger(unrelatedPid) && Number(unrelatedPid) > 1, "INVALID_UNRELATED_PID");

  return Object.freeze({
    hostSentinelPath: sentinel,
    repositorySentinelPath: pathValues.repositorySentinelPath as string,
    homeSentinelPath: pathValues.homeSentinelPath as string,
    worldSentinelPath: pathValues.worldSentinelPath as string,
    unrelatedSocketPath: pathValues.unrelatedSocketPath as string,
    unrelatedPid: Number(unrelatedPid),
    tcpPort: validPort(record.tcpPort, DEFAULT_TCP_PORT, "INVALID_TCP_PORT"),
    udpPort: validPort(record.udpPort, DEFAULT_UDP_PORT, "INVALID_UDP_PORT"),
    proxyOrigin,
  });
}

async function readInput(): Promise<ProbeInput> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += buffer.byteLength;
    ensure(bytes <= MAX_INPUT_BYTES, "INPUT_TOO_LARGE");
    chunks.push(buffer);
  }
  ensure(bytes > 0, "EMPTY_INPUT");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch {
    throw new ProbeFailure("INVALID_JSON");
  }
  return parseInput(parsed);
}

let wroteResult = false;

async function writeResult(result: ProbeRecord): Promise<void> {
  ensure(!wroteResult, "DUPLICATE_RESULT");
  const serialized = `${JSON.stringify(result)}\n`;
  const maximum =
    result.mode === "collector"
      ? BROWSER_EVIDENCE_LIMITS.resultBytes + MAX_RESULT_BYTES
      : MAX_RESULT_BYTES;
  ensure(Buffer.byteLength(serialized) <= maximum, "RESULT_TOO_LARGE");
  wroteResult = true;
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(serialized, (error) => (error ? reject(error) : resolve()));
  });
}

function ipFamily(address: string): "udp4" | "udp6" {
  return net.isIP(address) === 6 ? "udp6" : "udp4";
}

async function tcpAttempt(address: string, port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: address, port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(SOCKET_TIMEOUT_MS, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function udpAttempt(address: string, port: number, payload: Buffer): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = dgram.createSocket(ipFamily(address));
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // A synchronous send failure can leave the datagram socket unbound.
      }
      resolve(accepted);
    };
    timer = setTimeout(() => finish(false), SOCKET_TIMEOUT_MS);
    socket.once("error", () => finish(false));
    try {
      socket.send(payload, port, address, (error) => finish(error === null));
    } catch {
      finish(false);
    }
  });
}

function dnsQuery(): Buffer {
  const labels = ["sentinel", "crossexam-fixture", "com"];
  const encodedName = Buffer.concat(
    labels.map((label) =>
      Buffer.concat([Buffer.from([label.length]), Buffer.from(label, "ascii")]),
    ),
  );
  return Buffer.concat([
    Buffer.from([0xce, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    encodedName,
    Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01]),
  ]);
}

async function readSmallFile(file: string, maximum: number): Promise<string> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(maximum + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
    ensure(bytesRead <= maximum, "KERNEL_FILE_TOO_LARGE");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function hasIpv4DefaultRoute(routes: string): boolean {
  return routes
    .split("\n")
    .slice(1)
    .some((line) => line.trim().split(/\s+/)[1] === "00000000");
}

function hasIpv6DefaultRoute(routes: string): boolean {
  const zero = "0".repeat(32);
  return routes.split("\n").some((line) => {
    const fields = line.trim().split(/\s+/);
    // Linux exposes an unreachable/reject ::/0 cache entry on lo without any egress route.
    const rejected = (Number.parseInt(fields[8] ?? "0", 16) & 0x200) !== 0;
    return fields[0] === zero && fields[1] === "00" && !rejected;
  });
}

async function runNetwork(input: ProbeInput): Promise<SafeDetails> {
  const interfaces = os.networkInterfaces();
  const interfaceNames = Object.keys(interfaces).sort();
  const interfaceAddresses = Object.values(interfaces).flatMap((entries) => entries ?? []);
  const interfacesOnlyLoopback =
    interfaceNames.length === 1 &&
    interfaceNames[0] === "lo" &&
    interfaceAddresses.length > 0 &&
    interfaceAddresses.every((entry) => entry.internal);

  const [ipv4Routes, ipv6Routes] = await Promise.all([
    readSmallFile("/proc/net/route", 64 * 1024),
    readSmallFile("/proc/net/ipv6_route", 64 * 1024),
  ]);
  const noIpv4DefaultRoute = !hasIpv4DefaultRoute(ipv4Routes);
  const noIpv6DefaultRoute = !hasIpv6DefaultRoute(ipv6Routes);

  const [serviceTcp, dnsTcp, serviceUdp, dnsUdp] = await Promise.all([
    Promise.all(SENTINEL_ADDRESSES.map((address) => tcpAttempt(address, input.tcpPort))),
    Promise.all(SENTINEL_ADDRESSES.map((address) => tcpAttempt(address, 53))),
    Promise.all(
      SENTINEL_ADDRESSES.map((address) =>
        udpAttempt(address, input.udpPort, Buffer.from("crossexam-udp-sentinel", "ascii")),
      ),
    ),
    Promise.all(SENTINEL_ADDRESSES.map((address) => udpAttempt(address, 53, dnsQuery()))),
  ]);

  const tcpConnections = [...serviceTcp, ...dnsTcp].filter(Boolean).length;
  const tcpAttempts = serviceTcp.length + dnsTcp.length;
  ensure(interfacesOnlyLoopback, "NON_LOOPBACK_INTERFACE");
  ensure(noIpv4DefaultRoute, "IPV4_DEFAULT_ROUTE_PRESENT");
  ensure(noIpv6DefaultRoute, "IPV6_DEFAULT_ROUTE_PRESENT");
  ensure(tcpConnections === 0, "DIRECT_TCP_ESCAPE");

  return {
    interfacesOnlyLoopback,
    noIpv4DefaultRoute,
    noIpv6DefaultRoute,
    tcpAttempts,
    tcpFailures: tcpAttempts - tcpConnections,
    tcpConnections,
    udpServiceAttempts: serviceUdp.length,
    udpServiceSendsAccepted: serviceUdp.filter(Boolean).length,
    dnsUdpAttempts: dnsUdp.length,
    dnsUdpSendsAccepted: dnsUdp.filter(Boolean).length,
    dnsTcpAttempts: dnsTcp.length,
    dnsTcpConnections: dnsTcp.filter(Boolean).length,
  };
}

async function deniedPath(file: string, label: string): Promise<string> {
  try {
    return await expectDeniedPath(file, "access", label);
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    const code =
      error.code === "ACCESS_SUCCEEDED"
        ? `ACCESS_SUCCEEDED_${label}`
        : `ACCESS_${label}_${error.code}`;
    throw new ProbeFailure(code);
  }
}

async function connectUnixSocket(socketPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new ProbeFailure("PROXY_SOCKET_TIMEOUT"));
    }, 2_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function runFilesystem(input: ProbeInput): Promise<SafeDetails> {
  const appProbe = `/app/.crossexam-write-${process.pid}`;
  const temporaryProbe = `/tmp/.crossexam-write-${process.pid}`;
  let appWriteBlocked = false;
  try {
    await writeFile(appProbe, "probe", { flag: "wx", mode: 0o600 });
    await unlink(appProbe).catch(() => undefined);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    if (!["EROFS", "EACCES", "EPERM"].includes(code)) throw new ProbeFailure(`APP_WRITE_${code}`);
    appWriteBlocked = true;
  }

  let tmpWritable = false;
  try {
    await writeFile(temporaryProbe, "probe", { flag: "wx", mode: 0o600 });
    tmpWritable = true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    throw new ProbeFailure(`TMP_WRITE_${code}`);
  } finally {
    await unlink(temporaryProbe).catch(() => undefined);
  }

  const [repositoryDenied, homeDenied, worldDenied, socketDenied] = await Promise.all([
    deniedPath(input.repositorySentinelPath, "REPOSITORY"),
    deniedPath(input.homeSentinelPath, "HOME"),
    deniedPath(input.worldSentinelPath, "WORLD_HOST"),
    deniedPath(input.unrelatedSocketPath, "UNRELATED_SOCKET"),
  ]);
  await connectUnixSocket(UNIX_PROXY_SOCKET);
  const proxySocketStat = await stat(UNIX_PROXY_SOCKET);
  const ownProcStatus = await readFile("/proc/self/status", "utf8");
  const ownNamespace = await readlink("/proc/self/ns/net");
  ensure(ownProcStatus.includes("Name:"), "OWN_PROC_UNAVAILABLE");
  ensure(/^net:\[[0-9]+\]$/u.test(ownNamespace), "OWN_NAMESPACE_UNAVAILABLE");
  const procPaths = ["root", "cwd", "fd", "environ", "ns/net"];
  const unrelatedProc = Object.fromEntries(
    await Promise.all(
      procPaths.map(async (entry) => [
        entry,
        await deniedPath(
          `/proc/${input.unrelatedPid}/${entry}`,
          `PROC_${entry.replaceAll("/", "_").toUpperCase()}`,
        ),
      ]),
    ),
  ) as Record<string, string>;
  const capEffText = /^CapEff:\s*([0-9a-f]+)$/imu.exec(ownProcStatus)?.[1];
  const capBndText = /^CapBnd:\s*([0-9a-f]+)$/imu.exec(ownProcStatus)?.[1];
  ensure(capEffText !== undefined && capBndText !== undefined, "PROC_STATUS_MISSING_CAPABILITIES");
  const capEff = Number.parseInt(capEffText, 16);
  const capBnd = Number.parseInt(capBndText, 16);
  const capabilitiesEmpty =
    Number.isFinite(capEff) && capEff === 0 && Number.isFinite(capBnd) && capBnd === 0;
  let identity: ProcStatusIdentity;
  try {
    identity = parseProcStatusIdentity(ownProcStatus);
  } catch {
    throw new ProbeFailure("PROC_STATUS_INVALID");
  }
  const supplementaryGroupsEmpty = supplementaryGroupsAreEmptyOrPrimary(identity);
  const rootEntries = await readdir("/");
  const layoutIssues = rootLayoutIssues(rootEntries);
  const runtimeLayout = layoutIssues.length === 0;
  const manifestPath = `/${ROOT_MANIFEST_NAME}`;
  const manifestInfo = await lstat(manifestPath);
  const manifestIssue = manifestEntryIssue({
    isFile: manifestInfo.isFile(),
    isSymbolicLink: manifestInfo.isSymbolicLink(),
    mode: manifestInfo.mode,
  });
  const manifestIsTrustedMetadata = manifestIssue === null;

  const sensitiveName =
    /(?:^|_)(?:API_?KEY|AUTH|COOKIE|CREDENTIAL|JWT|PASS(?:WORD|WD)?|PRIVATE_?KEY|SECRET|SSH_AUTH_SOCK|TOKEN)(?:$|_)/i;
  const proxyName = /^(?:ALL|HTTP|HTTPS|NO)_PROXY$/i;
  const sensitiveEnvironmentEntries = Object.keys(process.env).filter(
    (name) => sensitiveName.test(name) || proxyName.test(name),
  ).length;
  const fixedRuntime = process.execPath === "/runtime/node";
  const fixedWorkingDirectory = process.cwd() === "/app";

  ensure(appWriteBlocked, "APP_WRITABLE");
  ensure(tmpWritable, "TMP_NOT_WRITABLE");
  ensure(proxySocketStat.isSocket(), "PROXY_SOCKET_NOT_SOCKET");
  ensure(runtimeLayout, "UNEXPECTED_ROOT_ENTRY");
  ensure(manifestIsTrustedMetadata, manifestIssue ?? "MANIFEST_INVALID");
  ensure(capabilitiesEmpty, "UNEXPECTED_CAPABILITIES");
  ensure(supplementaryGroupsEmpty, "UNEXPECTED_SUPPLEMENTARY_GROUPS");
  ensure(sensitiveEnvironmentEntries === 0, "SENSITIVE_ENVIRONMENT_PRESENT");
  ensure(fixedRuntime && fixedWorkingDirectory, "UNEXPECTED_RUNTIME_LAYOUT");

  return {
    appWriteBlocked,
    tmpWritable,
    repositoryDenied,
    homeDenied,
    worldDenied,
    socketDenied,
    proxySocketAccessible: true,
    unrelatedPidRootDenied: unrelatedProc.root ?? "UNKNOWN",
    unrelatedPidCwdDenied: unrelatedProc.cwd ?? "UNKNOWN",
    unrelatedPidFdDenied: unrelatedProc.fd ?? "UNKNOWN",
    unrelatedPidEnvironDenied: unrelatedProc.environ ?? "UNKNOWN",
    unrelatedPidNamespaceDenied: unrelatedProc["ns/net"] ?? "UNKNOWN",
    ownProc: true,
    ownNamespace,
    capabilitiesEmpty,
    supplementaryGroupsEmpty,
    runtimeLayout,
    manifestIsTrustedMetadata,
    sensitiveEnvironmentEntries,
    fixedRuntime,
    fixedWorkingDirectory,
  };
}

async function waitForSpawn(child: ChildProcess): Promise<"spawned" | string> {
  return await new Promise((resolve) => {
    child.once("spawn", () => resolve("spawned"));
    child.once("error", (error: NodeJS.ErrnoException) => resolve(error.code ?? "UNKNOWN"));
  });
}

async function stopChildren(children: ChildProcess[]): Promise<void> {
  for (const child of children) child.kill("SIGKILL");
  await Promise.race([
    Promise.all(
      children.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) resolve();
            else child.once("close", () => resolve());
          }),
      ),
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

async function runPids(): Promise<SafeDetails> {
  const children: ChildProcess[] = [];
  let attempts = 0;
  let eagainFailures = 0;
  let otherFailures = 0;
  try {
    for (let index = 0; index < 160; index += 1) {
      attempts += 1;
      const child = spawn("/usr/bin/sleep", ["60"], { stdio: "ignore" });
      const outcome = await waitForSpawn(child);
      if (outcome === "spawned") children.push(child);
      else if (outcome === "EAGAIN") eagainFailures += 1;
      else otherFailures += 1;
    }
  } finally {
    await stopChildren(children);
  }

  ensure(otherFailures === 0, "UNEXPECTED_SPAWN_FAILURE");
  ensure(eagainFailures > 0 && children.length < 160, "PID_LIMIT_NOT_ENFORCED");
  return {
    attempts,
    spawned: children.length,
    eagainFailures,
    otherFailures,
    childrenCleaned: true,
  };
}

type Relay = Readonly<{
  url: string;
  close(): Promise<void>;
}>;

async function startUnixRelay(): Promise<Relay> {
  const sockets = new Set<Socket>();
  const server = net.createServer((client) => {
    sockets.add(client);
    const upstream = net.connect(UNIX_PROXY_SOCKET);
    sockets.add(upstream);
    const discardError = () => undefined;
    client.on("error", discardError);
    upstream.on("error", () => client.destroy());
    client.on("close", () => {
      sockets.delete(client);
      upstream.destroy();
    });
    upstream.on("close", () => {
      sockets.delete(upstream);
      client.destroy();
    });
    upstream.once("connect", () => {
      client.pipe(upstream);
      upstream.pipe(client);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => {
        if (!server.listening) resolve();
        else server.close(() => resolve());
      });
    },
  };
}

async function runBrowser(input: ProbeInput): Promise<SafeDetails> {
  // Task 10D-B only. Runs under this exact service before Chromium, changes no
  // outer controls, and writes bounded diagnostic records to stderr only.
  const diagnostic = spawnSync("/usr/bin/crossexam-sandbox-diagnostic", [], {
    encoding: "utf8",
    timeout: 6_000,
    maxBuffer: 16 * 1024,
    env: { LANG: "C" },
  });
  process.stderr.write(
    `sandbox-diagnostic context=worker status=${diagnostic.status} signal=${diagnostic.signal} error=${diagnostic.error?.message ?? "none"}\n${diagnostic.stdout ?? ""}${diagnostic.stderr ?? ""}`,
  );
  // The allowance belongs only to Chromium. This unchanged helper must still
  // encounter Ubuntu's default restriction, demonstrating policy scope.
  ensure(
    diagnostic.status === 0 &&
      /operation=clone-NEWUSER result=0 errno=0/.test(diagnostic.stdout ?? "") &&
      /value=unprivileged_userns \(enforce\)/.test(diagnostic.stdout ?? "") &&
      /operation=\/proc\/self\/setgroups result=-1 errno=13/.test(diagnostic.stdout ?? ""),
    "UNPROFILED_USERNS_POLICY_CHANGED",
  );
  // Exact pinned headless-shell build; DEBUG output below independently records
  // Playwright's actual selection. --version does not navigate or start a page.
  const version = spawnSync(
    "/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
    ["--version"],
    { encoding: "utf8", timeout: 2_000, maxBuffer: 4 * 1024, env: { LANG: "C" } },
  );
  process.stderr.write(
    `sandbox-browser-version=${JSON.stringify({ status: version.status, error: version.error?.message ?? null, stdout: version.stdout, stderr: version.stderr })}\n`,
  );
  ensure(
    version.status === 0 && version.stdout.includes("153.0.8010.12"),
    "CHROMIUM_VERSION_MISMATCH",
  );
  const relay = await startUnixRelay();
  let worker: FixtureWorker | undefined;
  let stage = "chromium-launch";
  try {
    worker = await launchFixtureWorker({
      proxyServer: relay.url,
      timeoutMs: WORKER_TIMEOUT_MS,
    });
    stage = "navigation";
    const response = await worker.page.goto(`${input.proxyOrigin}/`, {
      waitUntil: "load",
      timeout: BROWSER_OPERATION_TIMEOUT_MS,
    });
    ensure(response?.status() === 200, "FIXTURE_NAVIGATION_FAILED");
    ensure((await worker.page.title()) === "Linux isolation fixture", "FIXTURE_TITLE_MISMATCH");

    stage = "resource-check";
    const resources = await worker.page.evaluate(async () => {
      const scriptLoaded = new Promise<boolean>((resolve) => {
        const script = document.createElement("script");
        script.src = "/script.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.append(script);
      });
      const frameLoaded = new Promise<boolean>((resolve) => {
        const frame = document.createElement("iframe");
        frame.src = "/frame.html";
        frame.onload = () => resolve(true);
        frame.onerror = () => resolve(false);
        document.body.append(frame);
      });
      const fetched = fetch("/fetch.txt").then(
        (value) => value.ok,
        () => false,
      );
      const xhr = new Promise<boolean>((resolve) => {
        const request = new XMLHttpRequest();
        request.open("GET", "/xhr.txt");
        request.onloadend = () => resolve(request.status === 200);
        request.onerror = () => resolve(false);
        request.send();
      });
      const [script, frame, fetchOk, xhrOk] = await Promise.all([
        scriptLoaded,
        frameLoaded,
        fetched,
        xhr,
      ]);
      return { script, frame, fetchOk, xhrOk };
    });
    ensure(Object.values(resources).every(Boolean), "FIXTURE_RESOURCE_FAILED");

    stage = "private-target-check";
    const deniedTargets = await worker.page.evaluate(async () => {
      const targets = [
        "http://private.crossexam-fixture.com/",
        "http://mixed.crossexam-fixture.com/",
      ];
      return await Promise.all(
        targets.map(async (target) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2_500);
          try {
            return await fetch(target, { signal: controller.signal }).then(
              (response) => !response.ok,
              () => true,
            );
          } finally {
            clearTimeout(timer);
          }
        }),
      );
    });
    ensure(deniedTargets.every(Boolean), "PRIVATE_DNS_TARGET_ALLOWED");

    return {
      navigationStatus: response.status(),
      titleMatched: true,
      scriptLoaded: resources.script,
      frameLoaded: resources.frame,
      fetchSucceeded: resources.fetchOk,
      xhrSucceeded: resources.xhrOk,
      privateTargetsDenied: deniedTargets.filter(Boolean).length,
      screenshotsCaptured: 0,
    };
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    throw toBrowserRuntimeError(stage, error);
  } finally {
    await worker?.close();
    await relay.close();
  }
}

async function runCollector(): Promise<{
  checks: SafeDetails;
  browserEvidence: BrowserEvidenceCollection;
}> {
  const relay = await startUnixRelay();
  try {
    const evidence = BrowserEvidenceCollectionSchema.parse(
      await collectFixtureBrowserEvidence({
        fixture: "rich",
        proxyServer: relay.url,
        timeoutMs: WORKER_TIMEOUT_MS,
      }),
    );
    ensure(evidence.outcome === "completed", "COLLECTOR_NOT_COMPLETED");
    ensure(
      evidence.navigation.status === 200 && evidence.navigation.chain.length === 2,
      "COLLECTOR_NAVIGATION",
    );
    ensure(evidence.dom?.title === "Rendered fixture", "COLLECTOR_RENDERED_DOM");
    ensure(
      evidence.console.some((entry) => entry.level === "warning"),
      "COLLECTOR_CONSOLE",
    );
    ensure(
      evidence.pageErrors.some((entry) => entry.name === "TypeError"),
      "COLLECTOR_PAGE_ERROR",
    );
    ensure(
      evidence.requests.some((entry) => entry.resourceType === "xhr"),
      "COLLECTOR_XHR",
    );
    ensure(
      evidence.requests.some((entry) => entry.method === "POST" && entry.outcome === "failed"),
      "COLLECTOR_POST_POLICY",
    );
    ensure(!JSON.stringify(evidence).includes("DISPOSABLE_NOT_A_SECRET"), "COLLECTOR_PRIVACY");
    const performance = BrowserPerformanceEvidenceSchema.parse(evidence.performance);
    ensure(
      performance.navigation !== null && (performance.navigation.responseStart ?? 0) > 0,
      "PERFORMANCE_NAVIGATION",
    );
    ensure(
      performance.metrics.fcp.status === "available" && (performance.metrics.fcp.value ?? 0) > 0,
      "PERFORMANCE_FCP",
    );
    ensure(
      performance.metrics.lcp.status === "available" && performance.lcp.length >= 2,
      "PERFORMANCE_LCP",
    );
    ensure(
      performance.metrics.cls.status === "available" && (performance.metrics.cls.value ?? 0) > 0,
      "PERFORMANCE_CLS",
    );
    ensure(
      performance.observed.longTasks > 0 &&
        (performance.deliveredTotals.maximumLongTaskDuration ?? 0) >= 80,
      "PERFORMANCE_LONG_TASK",
    );
    ensure(
      performance.resources.some(
        (entry) => entry.url?.endsWith("/collector/xhr") && (entry.decodedBodySize ?? 0) > 100000,
      ),
      "PERFORMANCE_RESOURCE",
    );
    const accessibility = BrowserAccessibilityEvidenceSchema.parse(evidence.accessibility);
    ensure(
      accessibility.status === "completed" &&
        accessibility.engineVersion === ACCESSIBILITY_ENGINE_VERSION,
      "ACCESSIBILITY_ENGINE",
    );
    ensure(
      accessibility.ruleResults?.violations.some((rule) => rule.id === "image-alt"),
      "ACCESSIBILITY_VIOLATION",
    );
    ensure(
      accessibility.ruleResults?.passes.ruleIds.includes("html-has-lang") &&
        accessibility.ruleResults.passes.ruleIds.includes("button-name"),
      "ACCESSIBILITY_PASS",
    );
    ensure(
      accessibility.ruleResults?.violations
        .find((rule) => rule.id === "button-name")
        ?.nodes.some((node) => node.path?.endsWith("button:nth-of-type(2)")),
      "ACCESSIBILITY_DYNAMIC",
    );
    ensure(
      accessibility.ruleResults?.incomplete.some((rule) => rule.id === "color-contrast"),
      "ACCESSIBILITY_MANUAL_REVIEW",
    );
    ensure(
      !JSON.stringify(accessibility).includes("failureSummary") &&
        !JSON.stringify(accessibility).includes("<"),
      "ACCESSIBILITY_NO_SNIPPETS",
    );
    const bounded = BrowserEvidenceCollectionSchema.parse(
      await collectFixtureBrowserEvidence({
        fixture: "bounds",
        proxyServer: relay.url,
        timeoutMs: WORKER_TIMEOUT_MS,
      }),
    );
    ensure(bounded.outcome === "completed", "COLLECTOR_BOUNDS_NOT_COMPLETED");
    ensure(
      (bounded.truncation.dropped.console ?? 0) > 0 &&
        (bounded.truncation.dropped.responses ?? 0) > 0 &&
        (bounded.truncation.dropped.headings ?? 0) > 0 &&
        (bounded.truncation.dropped.forms ?? 0) > 0,
      "COLLECTOR_BOUNDS",
    );
    ensure(
      !JSON.stringify(bounded).includes("DISPOSABLE_NOT_A_SECRET"),
      "COLLECTOR_BOUNDS_PRIVACY",
    );
    const boundedPerformance = BrowserPerformanceEvidenceSchema.parse(bounded.performance);
    ensure(
      boundedPerformance.truncation.dropped.resources > 0 &&
        boundedPerformance.observed.resources > boundedPerformance.resources.length,
      "PERFORMANCE_RESOURCE_BOUNDS",
    );
    const boundedAccessibility = BrowserAccessibilityEvidenceSchema.parse(bounded.accessibility);
    ensure(
      boundedAccessibility.status === "completed" &&
        boundedAccessibility.truncation.violationNodes > 0,
      "ACCESSIBILITY_BOUNDS",
    );
    ensure(
      (boundedAccessibility.ruleResults?.violations.find((rule) => rule.id === "label")
        ?.affectedNodes ?? 0) === 60,
      "ACCESSIBILITY_NODE_TOTAL",
    );
    ensure(
      Buffer.byteLength(JSON.stringify(evidence)) <= 32768 &&
        Buffer.byteLength(JSON.stringify(bounded)) <= 32768,
      "PERFORMANCE_COMBINED_CEILING",
    );
    return {
      browserEvidence: evidence,
      checks: {
        schemaValid: true,
        observed: true,
        navigation: true,
        renderedDom: true,
        console: true,
        pageError: true,
        xhr: true,
        postDenied: true,
        sensitiveMarkerAbsent: true,
        bounds: true,
        performanceSchemaValid: true,
        labNavigation: true,
        fcp: true,
        lcp: true,
        cls: true,
        longTask: true,
        performanceResources: true,
        performanceBounds: true,
        performanceResourcesDropped: boundedPerformance.truncation.dropped.resources,
        accessibilitySchemaValid: true,
        accessibilityEngine: ACCESSIBILITY_ENGINE_VERSION,
        accessibilityViolation: true,
        accessibilityPass: true,
        accessibilityDynamic: true,
        accessibilityManualReview: true,
        accessibilityNoSnippets: true,
        accessibilityBounds: true,
        accessibilityNodesDropped: boundedAccessibility.truncation.violationNodes,
        accessibilityBytes: Buffer.byteLength(JSON.stringify(accessibility)),
        combinedCeilingUnchanged: true,
        bytes: Buffer.byteLength(JSON.stringify(evidence)),
        boundedBytes: Buffer.byteLength(JSON.stringify(bounded)),
        consoleDropped: bounded.truncation.dropped.console ?? 0,
        responsesDropped: bounded.truncation.dropped.responses ?? 0,
      },
    };
  } finally {
    await relay.close();
  }
}

async function connectTcp(host: string, port: number): Promise<Socket> {
  return await new Promise<Socket>((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new ProbeFailure("SOCKET_TIMEOUT"));
    }, BROWSER_OPERATION_TIMEOUT_MS);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function readHeader(socket: Socket, code: string): Promise<{ header: string; rest: Buffer }> {
  return await new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
    };
    const fail = () => {
      cleanup();
      reject(new ProbeFailure(code));
    };
    const onError = () => fail();
    const onEnd = () => fail();
    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.byteLength > 16 * 1024) return fail();
      const end = buffered.indexOf("\r\n\r\n");
      if (end === -1) return;
      cleanup();
      socket.pause();
      resolve({
        header: buffered.subarray(0, end + 4).toString("latin1"),
        rest: buffered.subarray(end + 4),
      });
    };
    const timer = setTimeout(fail, BROWSER_OPERATION_TIMEOUT_MS);
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
    socket.resume();
  });
}

async function runTls(): Promise<SafeDetails> {
  const relay = await startUnixRelay();
  let socket: Socket | undefined;
  let secureSocket: tls.TLSSocket | undefined;
  try {
    const relayPort = Number(new URL(relay.url).port);
    socket = await connectTcp("127.0.0.1", relayPort);
    socket.write(
      "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nConnection: close\r\n\r\n",
      "ascii",
    );
    const connectResponse = await readHeader(socket, "CONNECT_RESPONSE_INVALID");
    ensure(/^HTTP\/1\.[01] 200(?: |\r)/.test(connectResponse.header), "CONNECT_NOT_ALLOWED");
    if (connectResponse.rest.byteLength > 0) socket.unshift(connectResponse.rest);

    const caStat = await stat(TLS_CA_PATH);
    ensure(caStat.isFile() && caStat.size > 0 && caStat.size <= 64 * 1024, "TLS_CA_INVALID");
    const ca = await readFile(TLS_CA_PATH);
    secureSocket = tls.connect({
      socket,
      servername: "example.com",
      ca,
      rejectUnauthorized: true,
    });
    secureSocket.resume();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new ProbeFailure("TLS_TIMEOUT")), 5_000);
      secureSocket?.once("secureConnect", () => {
        clearTimeout(timer);
        resolve();
      });
      secureSocket?.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    ensure(secureSocket.authorized, "TLS_NOT_AUTHORIZED");
    secureSocket.write("GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n", "ascii");
    const httpResponse = await readHeader(secureSocket, "TLS_HTTP_RESPONSE_INVALID");
    ensure(/^HTTP\/1\.[01] 200(?: |\r)/.test(httpResponse.header), "TLS_HTTP_NOT_200");
    return {
      connectAccepted: true,
      tlsAuthorized: true,
      rejectUnauthorized: true,
      serverNameMatched: true,
      httpStatus: 200,
      tlsOverrides: 0,
    };
  } finally {
    secureSocket?.destroy();
    socket?.destroy();
    await relay.close();
  }
}

async function runProxyDown(input: ProbeInput): Promise<SafeDetails> {
  const relay = await startUnixRelay();
  let worker: FixtureWorker | undefined;
  try {
    worker = await launchFixtureWorker({
      proxyServer: relay.url,
      timeoutMs: WORKER_TIMEOUT_MS,
    });
    let navigationFailed = false;
    try {
      await worker.page.goto(`${input.proxyOrigin}/`, {
        waitUntil: "load",
        timeout: 5_000,
      });
    } catch {
      navigationFailed = true;
    }
    ensure(navigationFailed, "DIRECT_PROXY_FALLBACK");
    return { navigationFailed, directFallbackObserved: false };
  } finally {
    await worker?.close();
    await relay.close();
  }
}

async function waitForChildReady(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProbeFailure("STUBBORN_CHILD_TIMEOUT")), 3_000);
    child.once("message", (message) => {
      if (message !== "ready") return;
      clearTimeout(timer);
      resolve();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new ProbeFailure("STUBBORN_CHILD_EXITED"));
    });
  });
}

async function armTimeoutProbe(): Promise<void> {
  const relay = await startUnixRelay();
  let worker: FixtureWorker | undefined;
  let child: ChildProcess | undefined;
  let armed = false;
  try {
    worker = await launchFixtureWorker({
      proxyServer: relay.url,
      timeoutMs: WORKER_TIMEOUT_MS,
    });
    child = spawn(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM',()=>{});if(process.send)process.send('ready');setInterval(()=>{},1000)",
      ],
      { detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    await waitForChildReady(child);
    ensure(worker.browser.isConnected(), "CHROMIUM_NOT_RUNNING");
    process.on("SIGTERM", () => undefined);
    await writeResult({
      version: 1,
      mode: "timeout",
      status: "ready",
      verification: "deadline-kill-required",
      checks: {
        chromiumRunning: true,
        stubbornChildRunning: child.exitCode === null,
        workerTimeoutMs: WORKER_TIMEOUT_MS,
      },
    });
    armed = true;
    setInterval(() => undefined, 1_000);
    await new Promise<never>(() => undefined);
  } finally {
    if (!armed) {
      child?.kill("SIGKILL");
      await worker?.close();
      await relay.close();
    }
  }
}

async function armMemoryProbe(): Promise<void> {
  await writeResult({
    version: 1,
    mode: "memory",
    status: "ready",
    verification: "oom-kill-required",
    checks: {
      residentWritesArmed: true,
      maximumAllocationBytes: MEMORY_LIMIT_BYTES,
      chunkBytes: MEMORY_CHUNK_BYTES,
    },
  });
  const allocations: Buffer[] = [];
  let allocated = 0;
  while (allocated < MEMORY_LIMIT_BYTES) {
    const chunk = Buffer.allocUnsafe(MEMORY_CHUNK_BYTES);
    chunk.fill(0xa5);
    allocations.push(chunk);
    allocated += chunk.byteLength;
  }
  ensure(allocations.length === 0, "MEMORY_LIMIT_NOT_ENFORCED");
}

async function runNormalMode(
  mode: Exclude<Mode, "collector">,
  input: ProbeInput,
): Promise<SafeDetails> {
  switch (mode) {
    case "network":
      return await runNetwork(input);
    case "filesystem":
      return await runFilesystem(input);
    case "pids":
      return await runPids();
    case "browser":
      return await runBrowser(input);
    case "tls":
      return await runTls();
    case "proxy-down":
      return await runProxyDown(input);
    case "memory":
    case "timeout":
      throw new ProbeFailure("INVALID_NORMAL_MODE");
  }
}

async function main(): Promise<void> {
  const modeArgument = process.argv[2];
  try {
    const input = await readInput();
    ensure(isMode(modeArgument), "INVALID_MODE");
    if (modeArgument === "memory") {
      await armMemoryProbe();
      return;
    }
    if (modeArgument === "timeout") {
      await armTimeoutProbe();
      return;
    }
    if (modeArgument === "collector") {
      const { checks, browserEvidence } = await runCollector();
      await writeResult({
        version: 1,
        mode: "collector",
        status: "passed",
        checks,
        browserEvidence,
      });
      return;
    }
    const checks = await runNormalMode(modeArgument, input);
    await writeResult({ version: 1, mode: modeArgument, status: "passed", checks });
  } catch (error) {
    process.exitCode = 1;
    if (wroteResult) {
      process.stderr.write("probe failed after readiness marker\n");
      return;
    }
    if (error instanceof BrowserRuntimeError) {
      await writeResult({
        version: 1,
        mode: isMode(modeArgument) ? modeArgument : "invalid",
        status: "failed",
        code: "BROWSER_RUNTIME_FAILURE",
        stage: error.stage,
        errorClass: error.errorClass,
        errorCode: error.errorCode,
        message: error.causeMessage,
      }).catch(() => {
        process.stderr.write("probe result write failed\n");
      });
      return;
    }
    const code = error instanceof ProbeFailure ? error.code : "UNEXPECTED_FAILURE";
    await writeResult({
      version: 1,
      mode: isMode(modeArgument) ? modeArgument : "invalid",
      status: "failed",
      code,
    }).catch(() => {
      process.stderr.write("probe result write failed\n");
    });
  }
}

void main();
