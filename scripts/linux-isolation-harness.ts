import { spawn, spawnSync } from "node:child_process";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import https from "node:https";
import net, { type AddressInfo, type Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertAppArmorEnvironmentAndProfile } from "../apps/browser-worker/src/linux-apparmor";
import {
  LinuxIsolationBackend,
  type LinuxIsolationResult,
} from "../apps/browser-worker/src/linux-backend";
import { diffPreparedRoot } from "../apps/browser-worker/src/linux-root";
import {
  ChromiumSandboxEvidenceError,
  startChromiumSandboxObserver,
} from "../apps/browser-worker/src/linux-sandbox-evidence";
import {
  BrowserEvidenceCollectionSchema,
  BrowserPerformanceEvidenceSchema,
} from "../packages/contracts/src/index";
import { startProxy } from "../packages/engine/src/browser-egress/core";
import type { EgressProxy } from "../packages/engine/src/browser-egress/types";
import { EgressError } from "../packages/engine/src/security/types";
import {
  collectorFixtureDelay,
  collectorFixtureResponse,
} from "../tests/browser-security/collector-fixtures";
import { startSentinels } from "./linux-sentinels";

const root = "/var/lib/crossexam";
const runtimeDirectory = `${root}/runtime`;
const browserDirectory = `${root}/browser`;
const preparedRoot = `${root}/root`;
const socketDirectory = "/run/crossexam";
const nodeExecutable = "/opt/crossexam-runtime/node";
const socketPath = `${socketDirectory}/proxy.sock`;
const origin = "http://entry.crossexam-fixture.com";
const certificate = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/engine/src/security/fixtures/test-cert.pem",
);
const key = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/engine/src/security/fixtures/test-key.pem",
);

type Relay = { close(): Promise<void> };
type FilesystemFixtures = {
  repository: string;
  home: string;
  world: string;
  socket: string;
  pid: number;
  close(): Promise<void>;
  socketHits(): number;
};
let currentStage = "startup";

function recordCompletedProbe(mode: string, result: LinuxIsolationResult): void {
  // Preserve proof immediately, even if a later probe or assertion fails.
  console.log(
    JSON.stringify({
      mode,
      phase: "probe-completed",
      active: result.active,
      terminal: result.properties,
      exitCode: result.exitCode,
      cleanup: result.cleanup,
      cleaned: result.cleaned,
    }),
  );
}

async function startFilesystemFixtures(): Promise<FilesystemFixtures> {
  // Deliberately outside the prepared root and outside PrivateTmp coverage,
  // so only RootDirectory confinement can hide these host files/sockets.
  const directory = "/opt/crossexam-fixtures";
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true, mode: 0o755 });
  const repository = `${directory}/repository-sentinel`;
  const home = `${directory}/home-sentinel`;
  const world = `${directory}/world-readable-sentinel`;
  const socket = `${directory}/unrelated.sock`;
  await writeFile(repository, "owned repository fixture\n", { mode: 0o600 });
  await writeFile(home, "owned home fixture\n", { mode: 0o600 });
  await writeFile(world, "world readable fixture\n", { mode: 0o644 });
  await access(repository);
  await access(home);
  await access(world);
  let hits = 0;
  const server = net.createServer((client) => {
    hits++;
    client.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, resolve);
  });
  const positiveSocket = await new Promise<Socket>((resolve, reject) => {
    const client = net.connect(socket);
    client.once("connect", () => resolve(client));
    client.once("error", reject);
  });
  positiveSocket.destroy();
  hits = 0;
  const child = spawn("/bin/sleep", ["300"], { stdio: "ignore" });
  if (!child.pid) throw new Error("fixture PID did not start");
  process.kill(child.pid, 0);
  return {
    repository,
    home,
    world,
    socket,
    pid: child.pid,
    close: async () => {
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => child.once("close", () => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    },
    socketHits: () => hits,
  };
}

async function createRelay(proxy: EgressProxy): Promise<Relay> {
  await rm(socketPath, { force: true });
  const clients = new Set<Socket>();
  const target = new URL(proxy.url);
  const server = net.createServer((client) => {
    clients.add(client);
    const upstream = net.connect(Number(target.port), target.hostname);
    clients.add(upstream);
    const close = () => {
      client.destroy();
      upstream.destroy();
      clients.delete(client);
      clients.delete(upstream);
    };
    client.once("close", close);
    upstream.once("close", close);
    upstream.once("error", close);
    upstream.once("connect", () => {
      client.pipe(upstream);
      upstream.pipe(client);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  await chmod(socketPath, 0o666);
  return {
    close: async () => {
      for (const socket of clients) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(socketPath, { force: true });
    },
  };
}

function fixtureResponse(pathname: string): {
  statusCode: number;
  headers: Record<string, string>;
  body: Uint8Array;
} {
  const collector = collectorFixtureResponse(pathname);
  if (collector) return collector;
  const bodies: Record<string, [string, string]> = {
    "/": ["text/html", "<!doctype html><title>Linux isolation fixture</title><body>fixture</body>"],
    "/script.js": ["text/javascript", "window.scriptLoaded = true"],
    "/frame.html": ["text/html", "<title>frame</title>"],
    "/fetch.txt": ["text/plain", "fetch-ok"],
    "/xhr.txt": ["text/plain", "xhr-ok"],
  };
  const [contentType, body] = bodies[pathname] ?? ["text/plain", "missing"];
  return {
    statusCode: pathname in bodies ? 200 : 404,
    headers: { "content-type": contentType },
    body: Buffer.from(body),
  };
}

async function run() {
  if (process.platform !== "linux") throw new Error("Linux isolation harness must run on Linux.");
  const sentinels = await startSentinels();
  const filesystemFixtures = await startFilesystemFixtures();
  const [cert, privateKey] = await Promise.all([readFile(certificate), readFile(key)]);
  const tlsServer = https.createServer({ cert, key: privateKey }, (_request, response) =>
    response.end("TLS fixture"),
  );
  await new Promise<void>((resolve) => tlsServer.listen(0, "127.0.0.1", resolve));
  const tlsPort = (tlsServer.address() as AddressInfo).port;
  let proxy: EgressProxy | undefined;
  let relay: Relay | undefined;
  try {
    await assertAppArmorEnvironmentAndProfile();
    console.log(
      JSON.stringify({
        phase: "apparmor-preflight",
        enabled: true,
        usernsRestriction: 1,
        profileLoaded: true,
      }),
    );
    currentStage = "start-proxy";
    proxy = await startProxy({
      resolve: async (hostname) => {
        if (hostname === "private.crossexam-fixture.com")
          return [{ address: "10.203.0.1", family: 4 }];
        if (hostname === "mixed.crossexam-fixture.com")
          return [
            { address: "93.184.216.34", family: 4 },
            { address: "::1", family: 6 },
          ];
        if (hostname === "entry.crossexam-fixture.com" || hostname === "example.com")
          return [{ address: "93.184.216.34", family: 4 }];
        throw new EgressError("DNS_RESOLUTION_FAILED", "dns");
      },
      request: async (target, pin) => {
        if (pin.address !== "93.184.216.34" || target.hostname !== "entry.crossexam-fixture.com")
          throw new EgressError("PEER_MISMATCH", "connection");
        const pathname = new URL(target.url).pathname;
        const delay = collectorFixtureDelay(pathname);
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return fixtureResponse(pathname);
      },
      connect: async (target) => {
        if (target.hostname !== "example.com")
          throw new EgressError("REQUEST_FAILED", "connection");
        return await new Promise<Socket>((resolve, reject) => {
          const socket = net.connect(tlsPort, "127.0.0.1");
          socket.once("connect", () => resolve(socket));
          socket.once("error", reject);
        });
      },
    });
    currentStage = "create-relay";
    relay = await createRelay(proxy);
    currentStage = "detect-backend";
    const backend = new LinuxIsolationBackend({
      runtimeDirectory,
      browserDirectory,
      socketDirectory,
      rootDirectory: preparedRoot,
      nodeExecutable,
    });
    const detected = await backend.detect();
    if (!detected.available) throw new Error(`Linux isolation unavailable: ${detected.reason}`);
    const input = {
      hostSentinelPath: "/home/crossexam-host-sentinel",
      repositorySentinelPath: filesystemFixtures.repository,
      homeSentinelPath: filesystemFixtures.home,
      worldSentinelPath: filesystemFixtures.world,
      unrelatedSocketPath: filesystemFixtures.socket,
      unrelatedPid: filesystemFixtures.pid,
      tcpPort: 41231,
      udpPort: 41232,
      proxyOrigin: origin,
    };
    const modes = ["network", "filesystem", "pids", "browser", "collector", "tls"] as const;
    const results: Record<string, LinuxIsolationResult> = {};
    for (const mode of modes) {
      currentStage = `probe-${mode}`;
      const diagnosticSince = `@${Math.floor(Date.now() / 1_000)}`;
      let observer: ReturnType<typeof startChromiumSandboxObserver> | undefined;
      let sandboxEvidence: unknown;
      let sandboxError: unknown;
      let result: LinuxIsolationResult;
      try {
        result = await backend.run(
          mode,
          input,
          mode === "browser" || mode === "collector"
            ? (active) => {
                observer = startChromiumSandboxObserver(active.controlGroup, active.mainPID);
              }
            : undefined,
        );
      } finally {
        if (observer) {
          try {
            sandboxEvidence = await observer.stop();
          } catch (error) {
            sandboxError = error;
          }
          console.log(
            JSON.stringify({
              phase: "chromium-internal-sandbox",
              evidence: sandboxEvidence ?? null,
              error: sandboxError instanceof Error ? sandboxError.message : null,
              partialEvidence:
                sandboxError instanceof ChromiumSandboxEvidenceError
                  ? sandboxError.partialEvidence
                  : undefined,
            }),
          );
        }
      }
      recordCompletedProbe(mode, result);
      if (mode === "browser") {
        console.log(JSON.stringify({ phase: "sandbox-diagnostic", stderr: result.stderr ?? "" }));
        // Diagnostic-only, bounded kernel audit facts for our executables. No
        // host-wide log dump, policy changes, or retries of the browser launch.
        const audit = spawnSync(
          "/usr/bin/journalctl",
          [
            "--dmesg",
            "--since",
            diagnosticSince,
            "--no-pager",
            "--output=json",
            "--grep",
            "apparmor=.*(userns|namespace|capable)",
            "--lines=30",
          ],
          { encoding: "utf8", timeout: 3_000, maxBuffer: 64 * 1024 },
        );
        const facts: string[] = [];
        for (const line of (audit.stdout ?? "").split("\n")) {
          if (!line.startsWith("{")) continue;
          try {
            const message: unknown = JSON.parse(line).MESSAGE;
            if (
              typeof message !== "string" ||
              !/comm="(?:chrome[^" ]*|crossexam-sand[^" ]*)"/.test(message)
            )
              continue;
            const fields = message.match(
              /\b(?:apparmor|operation|class|info|error|profile|pid|comm|capability|capname|requested_mask|denied_mask)=(?:"[^"\r\n]{0,200}"|[a-zA-Z0-9_-]{1,64})/g,
            );
            facts.push((fields ?? []).join(" ").slice(0, 800));
          } catch {
            facts.push("unparseable-audit-record");
          }
        }
        console.log(
          JSON.stringify({
            phase: "sandbox-policy-audit",
            status: audit.status,
            error: audit.error?.message ?? null,
            facts: facts.slice(0, 12),
          }),
        );
      }
      if (result.exitCode !== 0 || !result.cleaned)
        throw new Error(
          `${mode} probe failed or was not cleaned: ${result.stdout} ${result.stderr ?? ""} ${JSON.stringify(result.properties)}`,
        );
      if ((mode === "browser" || mode === "collector") && (sandboxError || !sandboxEvidence))
        throw sandboxError ?? new Error("Chromium internal sandbox evidence missing");
      if (mode === "collector") {
        const record = JSON.parse(result.stdout);
        const evidence = BrowserEvidenceCollectionSchema.parse(record.browserEvidence);
        if (
          evidence.outcome !== "completed" ||
          evidence.dom?.title !== "Rendered fixture" ||
          JSON.stringify(evidence).includes("DISPOSABLE_NOT_A_SECRET")
        )
          throw new Error("Collector evidence acceptance failed");
        const performance = BrowserPerformanceEvidenceSchema.parse(evidence.performance);
        console.log(
          JSON.stringify({
            phase: "browser-collector",
            schema: 1,
            provenance: evidence.provenance,
            source: evidence.source,
            scope: evidence.scope,
            valid: true,
            sensitiveMarkerAbsent: true,
            bytes: Buffer.byteLength(JSON.stringify(evidence)),
            checks: record.checks,
            performance: {
              schema: performance.schemaVersion,
              kind: performance.measurementKind,
              window: performance.observationWindow,
              navigation: performance.navigation !== null,
              fcp: performance.metrics.fcp,
              lcp: performance.metrics.lcp,
              cls: performance.metrics.cls,
              longTasks: performance.observed.longTasks,
              maximumLongTask: performance.deliveredTotals.maximumLongTaskDuration,
              resources: performance.observed.resources,
              retainedResources: performance.resources.length,
              truncation: performance.truncation,
              bytes: Buffer.byteLength(JSON.stringify(performance)),
            },
          }),
        );
      }
      results[mode] = result;
      if (mode === "network") {
        // Record the exact second-detect reason before the next probe can mask it.
        const postNetworkDetect = await backend.detect();
        console.log(
          JSON.stringify({
            phase: "post-network-detect",
            available: postNetworkDetect.available,
            reason: postNetworkDetect.reason,
          }),
        );
        if (
          !postNetworkDetect.available &&
          postNetworkDetect.reason === "prepared-root-unavailable"
        ) {
          try {
            const diff = await diffPreparedRoot(preparedRoot);
            console.log(JSON.stringify({ phase: "prepared-root-diff", ...diff }));
          } catch (error) {
            console.log(
              JSON.stringify({
                phase: "prepared-root-diff",
                error: error instanceof Error ? error.message : "unknown",
              }),
            );
          }
        }
      }
    }
    currentStage = "probe-memory";
    const memory = await backend.run("memory", input);
    recordCompletedProbe("memory", memory);
    if (!memory.cleaned || memory.properties.Result !== "oom-kill")
      throw new Error("memory probe was not cgroup OOM-killed.");
    results.memory = memory;
    currentStage = "probe-timeout";
    const timeout = await backend.run("timeout", input);
    recordCompletedProbe("timeout", timeout);
    if (!timeout.cleaned || !timeout.timedOut)
      throw new Error("timeout probe was not killed by RuntimeMaxSec.");
    results.timeout = timeout;
    currentStage = "probe-proxy-down";
    await relay.close();
    relay = undefined;
    const proxyDownRelay = await createRelay(proxy);
    await proxy.close();
    proxy = undefined;
    const down = await backend.run("proxy-down", input);
    recordCompletedProbe("proxy-down", down);
    if (down.exitCode !== 0 || !down.cleaned)
      throw new Error("proxy-down probe failed or was not cleaned.");
    await proxyDownRelay.close();
    results["proxy-down"] = down;
    await assertAppArmorEnvironmentAndProfile();
    console.log(
      JSON.stringify({
        phase: "apparmor-final",
        enabled: true,
        usernsRestriction: 1,
        profileLoaded: true,
      }),
    );
    const sentinelCounts = sentinels.counts();
    if (sentinelCounts.tcpHits || sentinelCounts.udpHits || filesystemFixtures.socketHits())
      throw new Error("Owned sentinel observed network escape");
    console.log(
      JSON.stringify(
        {
          detected,
          sentinelCounts,
          unrelatedSocketHits: filesystemFixtures.socketHits(),
          modes: Object.fromEntries(
            Object.entries(results).map(([mode, result]) => [
              mode,
              { ...result, stdout: JSON.parse(result.stdout) },
            ]),
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await relay?.close();
    await proxy?.close();
    tlsServer.closeAllConnections();
    await new Promise<void>((resolve) => tlsServer.close(() => resolve()));
    await sentinels.close();
    await filesystemFixtures.close();
  }
}

void run().catch((error) => {
  const message = error instanceof Error ? error.message : "Linux isolation harness failed";
  console.error(`::error title=Linux isolation harness::stage=${currentStage} message=${message}`);
  process.exitCode = 1;
});
