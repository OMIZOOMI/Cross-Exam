import { chmod, readFile, rm } from "node:fs/promises";
import https from "node:https";
import net, { type AddressInfo, type Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LinuxIsolationBackend,
  type LinuxIsolationResult,
} from "../apps/browser-worker/src/linux-backend";
import { startProxy } from "../packages/engine/src/browser-egress/core";
import type { EgressProxy } from "../packages/engine/src/browser-egress/types";
import { EgressError } from "../packages/engine/src/security/types";
import { startSentinels } from "./linux-sentinels";

const root = "/var/lib/crossexam";
const runtimeDirectory = `${root}/runtime`;
const browserDirectory = `${root}/browser`;
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
let currentStage = "startup";

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
  const [cert, privateKey] = await Promise.all([readFile(certificate), readFile(key)]);
  const tlsServer = https.createServer({ cert, key: privateKey }, (_request, response) =>
    response.end("TLS fixture"),
  );
  await new Promise<void>((resolve) => tlsServer.listen(0, "127.0.0.1", resolve));
  const tlsPort = (tlsServer.address() as AddressInfo).port;
  let proxy: EgressProxy | undefined;
  let relay: Relay | undefined;
  try {
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
        return fixtureResponse(new URL(target.url).pathname);
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
      nodeExecutable,
    });
    const detected = await backend.detect();
    if (!detected.available) throw new Error(`Linux isolation unavailable: ${detected.reason}`);
    const input = {
      hostSentinelPath: "/host-crossexam-sentinel",
      tcpPort: 41231,
      udpPort: 41232,
      proxyOrigin: origin,
    };
    const modes = ["network", "filesystem", "pids", "browser", "tls"] as const;
    const results: Record<string, LinuxIsolationResult> = {};
    for (const mode of modes) {
      currentStage = `probe-${mode}`;
      const result = await backend.run(mode, input);
      if (result.exitCode !== 0 || !result.cleaned)
        throw new Error(
          `${mode} probe failed or was not cleaned: ${result.stdout} ${JSON.stringify(result.properties)}`,
        );
      results[mode] = result;
    }
    currentStage = "probe-memory";
    const memory = await backend.run("memory", input);
    if (!memory.cleaned || memory.properties.Result !== "oom-kill")
      throw new Error("memory probe was not cgroup OOM-killed.");
    results.memory = memory;
    currentStage = "probe-timeout";
    const timeout = await backend.run("timeout", input);
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
    if (down.exitCode !== 0 || !down.cleaned)
      throw new Error("proxy-down probe failed or was not cleaned.");
    await proxyDownRelay.close();
    results["proxy-down"] = down;
    const sentinelCounts = sentinels.counts();
    if (sentinelCounts.tcpHits || sentinelCounts.udpHits)
      throw new Error("Owned sentinel observed network escape");
    console.log(
      JSON.stringify(
        {
          detected,
          sentinelCounts,
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
  }
}

void run().catch((error) => {
  const message = error instanceof Error ? error.message : "Linux isolation harness failed";
  console.error(`::error title=Linux isolation harness::stage=${currentStage} message=${message}`);
  process.exitCode = 1;
});
