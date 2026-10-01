import dgram from "node:dgram";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net, { type AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import {
  type FixtureWorker,
  launchFixtureWorker,
} from "../../apps/browser-worker/src/fixture-worker";
import { launchBrowserWorker } from "../../apps/browser-worker/src/index";
import { startProxy } from "../../packages/engine/src/browser-egress/core";
import type { EgressProxy } from "../../packages/engine/src/browser-egress/types";
import { EgressError } from "../../packages/engine/src/security/types";

const origin = "http://entry.crossexam-fixture.com";
let proxy: EgressProxy;
let worker: FixtureWorker | undefined;
let privateHits = 0;
let sentinel: http.Server;
let sentinelUrl: string;
let tlsFixture: https.Server;
const fixtures = new Map<
  string,
  { status?: number; type?: string; body?: string; location?: string }
>();
let upstreamPaths: string[];

test.beforeEach(async () => {
  privateHits = 0;
  upstreamPaths = [];
  fixtures.clear();
  fixtures.set("/", {
    body: "<!doctype html><title>Controlled fixture</title><body>fixture</body>",
  });
  sentinel = http.createServer((_req, res) => {
    privateHits++;
    res.end("sentinel");
  });
  await new Promise<void>((resolve) => sentinel.listen(0, "127.0.0.1", resolve));
  sentinelUrl = `http://127.0.0.1:${(sentinel.address() as AddressInfo).port}`;
  // Previously reviewed public disposable key, trusted nowhere in Chromium.
  tlsFixture = https.createServer(
    {
      key: readFileSync("packages/engine/src/security/fixtures/test-key.pem"),
      cert: readFileSync("packages/engine/src/security/fixtures/test-cert.pem"),
    },
    (_req, res) => res.end("TLS fixture"),
  );
  await new Promise<void>((resolve) => tlsFixture.listen(0, "127.0.0.1", resolve));
  proxy = await startProxy({
    resolve: async (hostname) => {
      // No real DNS: unknown names fail closed, including browser background requests.
      if (hostname === "private.crossexam-fixture.com") return [{ address: "10.0.0.1", family: 4 }];
      if (hostname === "mixed.crossexam-fixture.com")
        return [
          { address: "93.184.216.34", family: 4 },
          { address: "::1", family: 6 },
        ];
      if (hostname !== "entry.crossexam-fixture.com" && hostname !== "example.com")
        throw new EgressError("DNS_RESOLUTION_FAILED", "dns");
      return [{ address: "93.184.216.34", family: 4 }];
    },
    request: async (target, pin) => {
      expect(pin.address).toBe("93.184.216.34");
      expect(target.hostname).toBe("entry.crossexam-fixture.com");
      const pathname = new URL(target.url).pathname;
      upstreamPaths.push(pathname);
      const fixture = fixtures.get(pathname) ?? { status: 404, body: "missing" };
      return {
        statusCode: fixture.status ?? 200,
        headers: {
          "content-type": fixture.type ?? "text/html",
          "access-control-allow-origin": "*",
          ...(fixture.location ? { location: fixture.location } : {}),
        },
        body: Buffer.from(fixture.body ?? ""),
      };
    },
    // Only a controlled TLS server, never an attacker-selected address or port.
    connect: async (target) => {
      if (target.hostname !== "example.com") throw new EgressError("REQUEST_FAILED", "connection");
      return await new Promise((resolve, reject) => {
        const socket = net.connect({
          host: "127.0.0.1",
          port: (tlsFixture.address() as AddressInfo).port,
        });
        socket.once("connect", () => resolve(socket));
        socket.once("error", reject);
      });
    },
  });
});
test.afterEach(async () => {
  await worker?.close();
  worker = undefined;
  await proxy?.close();
  sentinel?.closeAllConnections();
  tlsFixture?.closeAllConnections();
  await Promise.all(
    [sentinel, tlsFixture].map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  expect(privateHits).toBe(0);
});
async function launch() {
  worker = await launchFixtureWorker({ proxyServer: proxy.url, timeoutMs: 25_000 });
  return worker;
}

test("public entry remains fail-closed without external isolation", async () => {
  await expect(launchBrowserWorker()).rejects.toMatchObject({ code: "ISOLATION_UNAVAILABLE" });
});

test("real Chromium resources, XHR, frames and dynamic scripts traverse the proxy", async () => {
  fixtures.set("/script", { type: "text/javascript", body: "window.scriptLoaded=true" });
  fixtures.set("/data", { type: "text/plain", body: "allowed" });
  fixtures.set("/frame", { body: "<title>Child fixture</title>" });
  const { page } = await launch();
  const response = await page.goto(origin);
  expect(response?.status()).toBe(200);
  expect(await page.title()).toBe("Controlled fixture");
  const result = await page.evaluate(async () => {
    const script = document.createElement("script");
    script.src = "/script";
    const loaded = new Promise<void>((resolve) => {
      script.onload = () => resolve();
    });
    document.body.append(script);
    const iframe = document.createElement("iframe");
    iframe.src = "/frame";
    const framed = new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
    });
    document.body.append(iframe);
    const xhr = new Promise<string>((resolve) => {
      const x = new XMLHttpRequest();
      x.open("GET", "/data");
      x.onload = () => resolve(x.responseText);
      x.send();
    });
    const fetched = await fetch("/data").then((r) => r.text());
    await Promise.all([loaded, framed]);
    return { fetched, xhr: await xhr, script: Reflect.get(window, "scriptLoaded") };
  });
  expect(result).toEqual({ fetched: "allowed", xhr: "allowed", script: true });
  expect(upstreamPaths).toEqual(expect.arrayContaining(["/", "/script", "/data", "/frame"]));
  expect(proxy.decisions.filter((d) => d.decision === "allowed").length).toBeGreaterThanOrEqual(5);
  console.log(`Controlled browser: ${worker?.browser.version()}`);
});

test("loopback bypass subtraction sends local HTTP navigation to proxy, never the sentinel", async () => {
  const { page } = await launch();
  for (const target of [
    sentinelUrl,
    sentinelUrl.replace("127.0.0.1", "localhost"),
    sentinelUrl.replace("127.0.0.1", "127.1"),
  ]) {
    const before = proxy.decisions.length;
    const response = await page.goto(target);
    expect(response?.status()).toBe(403);
    expect(proxy.decisions.slice(before)).toContainEqual(
      expect.objectContaining({ decision: "blocked", requestType: "http" }),
    );
  }
  expect(upstreamPaths).toEqual([]);
});

test("proxy outage never falls back to a direct loopback connection", async () => {
  const { page } = await launch();
  await proxy.close();
  await expect(page.goto(sentinelUrl)).rejects.toThrow(/ERR_PROXY_CONNECTION_FAILED/);
});

test("private DNS and mixed answers block malicious image script fetch XHR and iframe requests", async () => {
  const { page } = await launch();
  await page.goto(origin);
  await page.evaluate(async () => {
    const target = "http://private.crossexam-fixture.com/blocked";
    const events: Promise<void>[] = [];
    for (const tag of ["img", "script", "iframe"] as const) {
      const el = document.createElement(tag);
      el.src = target;
      events.push(
        new Promise((resolve) => {
          el.onload = () => resolve();
          el.onerror = () => resolve();
        }),
      );
      document.body.append(el);
    }
    events.push(
      fetch(target).then(
        () => {},
        () => {},
      ),
    );
    events.push(
      new Promise((resolve) => {
        const x = new XMLHttpRequest();
        x.open("GET", target);
        x.onloadend = () => resolve();
        x.send();
      }),
    );
    await Promise.all(events);
  });
  await expect
    .poll(() => proxy.decisions.filter((d) => d.reason === "UNSAFE_DNS_RESULT").length)
    .toBeGreaterThanOrEqual(5);
  expect((await page.goto("http://mixed.crossexam-fixture.com/"))?.status()).toBe(502);
  expect(proxy.decisions).toContainEqual(
    expect.objectContaining({ decision: "blocked", classification: "loopback" }),
  );
  expect(upstreamPaths.every((p) => p === "/")).toBe(true);
});

test("redirect and window.location cannot escape the proxy", async () => {
  fixtures.set("/redirect", {
    status: 302,
    location: "http://private.crossexam-fixture.com/secret?token=not-a-secret",
  });
  const { page } = await launch();
  expect((await page.goto(`${origin}/redirect`))?.status()).toBe(502);
  expect(proxy.decisions).toContainEqual(
    expect.objectContaining({ reason: "UNSAFE_REDIRECT", decision: "blocked" }),
  );
  await page.goto(origin);
  const navigated = page.waitForURL("http://private.crossexam-fixture.com/location");
  await page.evaluate(() => {
    window.location.href = "http://private.crossexam-fixture.com/location";
  });
  await navigated;
  await expect.poll(() => proxy.decisions.some((d) => d.reason === "UNSAFE_DNS_RESULT")).toBe(true);
  expect(JSON.stringify(proxy.decisions)).not.toMatch(/secret|token|crossexam-fixture/);
});

test("WebSockets and unsafe methods are denied before outbound traffic", async () => {
  const { page } = await launch();
  await page.goto(origin);
  await page.evaluate(async () => {
    await Promise.all(
      [
        "ws://private.crossexam-fixture.com/socket",
        "wss://private.crossexam-fixture.com/socket",
      ].map(
        (url) =>
          new Promise<void>((resolve) => {
            const ws = new WebSocket(url);
            ws.onclose = () => resolve();
            ws.onerror = () => resolve();
          }),
      ),
    );
    await fetch("/write", { method: "POST", body: "fixture" }).catch(() => {});
  });
  expect(worker?.decisions.filter((d) => d.reason === "WEBSOCKET_DENIED")).toHaveLength(2);
  expect(worker?.decisions).toContainEqual(expect.objectContaining({ reason: "UNSAFE_METHOD" }));
  expect(upstreamPaths).not.toContain("/write");
  expect(proxy.decisions.some((d) => d.requestType === "connect")).toBe(false);
});

test("TLS is end-to-end: Chromium rejects the untrusted fixture through CONNECT", async () => {
  const { page } = await launch();
  await expect(page.goto("https://example.com/")).rejects.toThrow(/ERR_CERT_AUTHORITY_INVALID/);
  expect(proxy.decisions).toContainEqual({
    decision: "allowed",
    requestType: "connect",
    reason: "ALLOWED",
    classification: "public",
  });
});

test("IPv6 and mapped-loopback bypass attempts never hit the controlled sentinel", async () => {
  const ipv6 = http.createServer((_request, response) => {
    privateHits++;
    response.end("IPv6 sentinel");
  });
  await new Promise<void>((resolve, reject) => {
    ipv6.once("error", reject);
    ipv6.listen(0, "::1", resolve);
  });
  try {
    const { page } = await launch();
    for (const url of [
      `http://[::1]:${(ipv6.address() as AddressInfo).port}/`,
      sentinelUrl.replace("127.0.0.1", "[::ffff:127.0.0.1]"),
    ]) {
      const before = proxy.decisions.length;
      expect((await page.goto(url))?.status()).toBe(403);
      expect(proxy.decisions.slice(before)).toContainEqual(
        expect.objectContaining({ decision: "blocked", requestType: "http" }),
      );
    }
  } finally {
    ipv6.closeAllConnections();
    await new Promise<void>((resolve) => ipv6.close(() => resolve()));
  }
});

test("WebRTC data-channel gathering sends no packets to a controlled local UDP sentinel", async () => {
  const udp = dgram.createSocket("udp4");
  let packets = 0;
  udp.on("message", () => packets++);
  await new Promise<void>((resolve) => udp.bind(0, "127.0.0.1", resolve));
  try {
    const { page } = await launch();
    await page.goto(origin);
    await page.evaluate(async (port) => {
      const peer = new RTCPeerConnection({ iceServers: [{ urls: `stun:127.0.0.1:${port}` }] });
      peer.createDataChannel("controlled");
      await peer.setLocalDescription(await peer.createOffer());
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000);
        peer.onicegatheringstatechange = () => {
          if (peer.iceGatheringState === "complete") {
            clearTimeout(timer);
            resolve();
          }
        };
      });
      peer.close();
    }, udp.address().port);
    expect(packets).toBe(0);
  } finally {
    udp.close();
  }
});

test("fresh contexts, popup limits, permissions and deadlines remain bounded", async () => {
  const { page, context } = await launch();
  await page.goto(origin);
  expect(await context.cookies()).toEqual([]);
  expect(
    await page.evaluate(() =>
      navigator.permissions.query({ name: "geolocation" }).then((p) => p.state),
    ),
  ).not.toBe("granted");
  await page.evaluate(() => {
    window.open("about:blank");
  });
  await expect.poll(() => worker?.decisions.some((d) => d.reason === "POPUP_LIMIT")).toBe(true);
  await expect.poll(() => context.pages().length).toBe(1);
  expect(context.serviceWorkers()).toEqual([]);
  await worker?.close();
  worker = await launchFixtureWorker({ proxyServer: proxy.url, timeoutMs: 1500 });
  await expect.poll(() => worker?.browser.isConnected(), { timeout: 3000 }).toBe(false);
});

// These literals never reach host networking: send them only as proxy request data.
// Browser private-DNS tests above use a closed in-memory resolver and no external sockets.
for (const authority of [
  "127.0.0.1",
  "localhost",
  "0.0.0.0",
  "10.0.0.1",
  "172.16.0.1",
  "192.168.1.1",
  "169.254.1.1",
  "169.254.169.254",
  "[::1]",
  "[fc00::1]",
  "[fe80::1]",
  "[::ffff:127.0.0.1]",
  "metadata.google.internal",
  "entry.crossexam-fixture.com:8080",
]) {
  test(`proxy blocks HTTP and CONNECT target ${authority} before any dial`, async () => {
    for (const method of ["GET", "CONNECT"]) {
      const result = await new Promise<number>((resolve, reject) => {
        const req = http.request(proxy.url, {
          method,
          path: method === "CONNECT" ? `${authority}:443` : `http://${authority}/`,
        });
        req.once("response", (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.once("connect", (res, socket) => {
          socket.destroy();
          resolve(res.statusCode ?? 0);
        });
        req.once("error", reject);
        req.end();
      });
      expect(result).toBe(403);
    }
    expect(upstreamPaths).toEqual([]);
  });
}
