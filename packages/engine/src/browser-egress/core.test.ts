import { readFile } from "node:fs/promises";
import net, { type Socket } from "node:net";
import path from "node:path";
import { Duplex, type TransformCallback } from "node:stream";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EgressError, type HopResponse } from "../security/types";
import { proxyLimits, startProxy } from "./core";
import type { ProxyDependencies } from "./types";

const public4 = {
  ok: true,
  address: "93.184.216.34",
  family: 4,
  classification: "public",
} as const;

class EchoSocket extends Duplex {
  _read() {}
  _write(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback) {
    this.push(Buffer.from(chunk));
    done();
  }
}

function response(
  statusCode = 200,
  headers: Record<string, string> = { "content-type": "text/plain" },
  body: Uint8Array = Buffer.from("OK"),
): HopResponse {
  return { statusCode, headers, body };
}

function dependencies(): ProxyDependencies & {
  resolve: ReturnType<typeof vi.fn<ProxyDependencies["resolve"]>>;
  request: ReturnType<typeof vi.fn<ProxyDependencies["request"]>>;
  connect: ReturnType<typeof vi.fn<ProxyDependencies["connect"]>>;
} {
  return {
    resolve: vi.fn(async () => [public4]),
    request: vi.fn(async () => response()),
    connect: vi.fn(async () => new EchoSocket() as unknown as Socket),
  };
}

function proxyPort(url: string): number {
  return Number(new URL(url).port);
}

async function rawExchange(port: number, request: string, halfClose = true): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(3_000);
    socket.once("connect", () => {
      if (halfClose) socket.end(request);
      else socket.write(request);
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.once("timeout", () => socket.destroy(new Error("fixture timeout")));
    socket.once("error", reject);
    socket.once("close", (hadError) => {
      if (!hadError) resolve(Buffer.concat(chunks).toString("latin1"));
    });
  });
}

async function openTunnel(port: number, authority = "example.com:443"): Promise<Socket> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let received = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      const boundary = received.indexOf("\r\n\r\n");
      if (boundary < 0) return;
      socket.off("data", onData);
      const header = received.subarray(0, boundary + 4).toString("latin1");
      if (!header.startsWith("HTTP/1.1 200")) {
        socket.destroy();
        reject(new Error(header));
        return;
      }
      const remainder = received.subarray(boundary + 4);
      if (remainder.length) socket.unshift(remainder);
      resolve(socket);
    };
    socket.setTimeout(3_000, () => socket.destroy(new Error("fixture timeout")));
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
      socket.on("data", onData);
    });
  });
}

const openProxies: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(openProxies.splice(0).map((proxy) => proxy.close()));
  vi.restoreAllMocks();
});

describe("non-MITM browser egress proxy", () => {
  it("binds an ephemeral loopback URL and closes idempotently", async () => {
    const proxy = await startProxy(dependencies());
    openProxies.push(proxy);
    expect(proxy.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(Object.isFrozen(proxy.decisions)).toBe(true);
    await expect(Promise.all([proxy.close(), proxy.close()])).resolves.toHaveLength(2);
  });

  it.each(["GET", "HEAD"])("forwards an absolute-form %s through a checked pin", async (method) => {
    const deps = dependencies();
    deps.request.mockResolvedValue(
      response(200, {
        "content-type": "text/plain",
        "set-cookie": "session=secret",
        connection: "keep-alive, x-private-hop",
        "x-private-hop": "drop",
        "x-safe": "kept",
      }),
    );
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const wire = await rawExchange(
      proxyPort(proxy.url),
      `${method} http://example.com/path?q=secret HTTP/1.1\r\nHost: example.com\r\nCookie: private-cookie\r\nAuthorization: Bearer private-token\r\nConnection: close\r\n\r\n`,
    );
    expect(wire).toContain("HTTP/1.1 200 OK");
    expect(wire).toContain("x-safe: kept");
    expect(wire).not.toMatch(/set-cookie|x-private-hop|private-cookie|private-token/i);
    if (method === "GET") expect(wire).toMatch(/\r\n\r\n(?:2\r\n)?OK/);
    else expect(wire).not.toMatch(/\r\n\r\n(?:2\r\n)?OK/);
    expect(deps.resolve).toHaveBeenCalledWith("example.com", expect.any(AbortSignal));
    expect(deps.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://example.com/path?q=secret" }),
      public4,
      expect.objectContaining({ method }),
    );
    expect(JSON.stringify(proxy.decisions)).not.toMatch(/secret|private-token|private-cookie/);
    expect(proxy.decisions).toEqual([
      { decision: "allowed", requestType: "http", reason: "ALLOWED", classification: "public" },
    ]);
  });

  it.each([
    [
      "POST http://example.com/ HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n",
      "METHOD_NOT_ALLOWED",
    ],
    [
      "GET /relative HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n",
      "ABSOLUTE_FORM_REQUIRED",
    ],
    [
      "GET http://127.0.0.1/ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
      "IP_LITERAL_NOT_ALLOWED",
    ],
    [
      "GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
      "REQUEST_BODY_NOT_ALLOWED",
    ],
  ])("blocks invalid HTTP policy without upstream I/O %#", async (wireRequest, reason) => {
    const deps = dependencies();
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const wire = await rawExchange(proxyPort(proxy.url), wireRequest);
    expect(wire).toMatch(/HTTP\/1\.1 (400|403|405)/);
    expect(proxy.decisions.at(-1)).toMatchObject({
      decision: "blocked",
      requestType: "http",
      reason,
    });
    expect(deps.resolve).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("rejects mixed DNS answers and same-host rebinding before transport", async () => {
    const deps = dependencies();
    deps.resolve
      .mockResolvedValueOnce([public4, { address: "10.0.0.1", family: 4 }])
      .mockResolvedValueOnce([public4])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const port = proxyPort(proxy.url);
    const request =
      "GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n";
    expect(await rawExchange(port, request)).toContain("502 Bad Gateway");
    expect(await rawExchange(port, request)).toContain("200 OK");
    expect(await rawExchange(port, request)).toContain("502 Bad Gateway");
    expect(deps.request).toHaveBeenCalledOnce();
    expect(proxy.decisions.filter((item) => item.decision === "blocked")).toEqual([
      expect.objectContaining({ reason: "UNSAFE_DNS_RESULT", classification: "private" }),
      expect.objectContaining({ reason: "UNSAFE_DNS_RESULT", classification: "loopback" }),
    ]);
  });

  it("returns only redirects whose destination URL and all DNS answers pass policy", async () => {
    const deps = dependencies();
    deps.request
      .mockResolvedValueOnce(
        response(
          302,
          {
            location: "https://other.com/next",
            "set-cookie": "drop=1",
            "content-length": "9999",
            "content-encoding": "gzip",
          },
          new Uint8Array(),
        ),
      )
      .mockResolvedValueOnce(
        response(302, { location: "http://localhost/private" }, new Uint8Array()),
      )
      .mockResolvedValueOnce(
        response(302, { location: "https://other.com/rebound" }, new Uint8Array()),
      );
    deps.resolve
      .mockResolvedValueOnce([public4])
      .mockResolvedValueOnce([public4])
      .mockResolvedValueOnce([public4])
      .mockResolvedValueOnce([public4])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const port = proxyPort(proxy.url);
    const request =
      "GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n";
    const allowed = await rawExchange(port, request);
    expect(allowed).toContain("302 Found");
    expect(allowed).toContain("location: https://other.com/next");
    expect(allowed).not.toContain("set-cookie");
    expect(allowed).not.toMatch(/content-(?:length|encoding):/i);
    expect(await rawExchange(port, request)).toContain("502 Bad Gateway");
    expect(await rawExchange(port, request)).toContain("502 Bad Gateway");
    expect(deps.request).toHaveBeenCalledTimes(3);
    expect(deps.resolve).toHaveBeenCalledTimes(5);
    expect(proxy.decisions.slice(1)).toEqual([
      expect.objectContaining({ decision: "blocked", reason: "UNSAFE_REDIRECT" }),
      expect.objectContaining({
        decision: "blocked",
        reason: "UNSAFE_REDIRECT",
        classification: "private",
      }),
    ]);
  });

  it.each([
    "example.com",
    "example.com:80",
    "example.com:0443",
    "user@example.com:443",
    "127.0.0.1:443",
    "[2606:4700:4700::1111]:443",
    "example.com:443/path",
    "localhost:443",
    "example.com.:443",
  ])("rejects malformed or unsupported CONNECT authority %s", async (authority) => {
    const deps = dependencies();
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const wire = await rawExchange(
      proxyPort(proxy.url),
      `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\nConnection: close\r\n\r\n`,
    );
    expect(wire).toContain("403 Forbidden");
    expect(proxy.decisions.at(-1)).toMatchObject({
      decision: "blocked",
      requestType: "connect",
      reason: "INVALID_CONNECT_AUTHORITY",
    });
    expect(deps.resolve).not.toHaveBeenCalled();
    expect(deps.connect).not.toHaveBeenCalled();
  });

  it("checks every CONNECT answer and contains peer failures", async () => {
    const mixed = dependencies();
    mixed.resolve.mockResolvedValue([public4, { address: "169.254.169.254", family: 4 }]);
    const first = await startProxy(mixed);
    openProxies.push(first);
    expect(
      await rawExchange(
        proxyPort(first.url),
        "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nConnection: close\r\n\r\n",
      ),
    ).toContain("502 Bad Gateway");
    expect(mixed.connect).not.toHaveBeenCalled();

    const peerFailure = dependencies();
    peerFailure.connect.mockRejectedValue(new EgressError("PEER_MISMATCH", "connection"));
    const second = await startProxy(peerFailure);
    openProxies.push(second);
    expect(
      await rawExchange(
        proxyPort(second.url),
        "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nConnection: close\r\n\r\n",
      ),
    ).toContain("502 Bad Gateway");
    expect(second.decisions).toEqual([
      {
        decision: "blocked",
        requestType: "connect",
        reason: "PEER_MISMATCH",
        classification: "transport",
      },
    ]);
  });

  it("rejects CONNECT request framing headers before DNS", async () => {
    const deps = dependencies();
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const wire = await rawExchange(
      proxyPort(proxy.url),
      "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    expect(wire).toContain("400 Bad Request");
    expect(proxy.decisions).toEqual([
      expect.objectContaining({
        decision: "blocked",
        requestType: "connect",
        reason: "REQUEST_BODY_NOT_ALLOWED",
      }),
    ]);
    expect(deps.resolve).not.toHaveBeenCalled();
  });

  it("carries an opaque stream only after CONNECT admission", async () => {
    const deps = dependencies();
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const tunnel = await openTunnel(proxyPort(proxy.url));
    tunnel.write("fixture bytes");
    const echoed = await new Promise<Buffer>((resolve, reject) => {
      tunnel.once("data", resolve);
      tunnel.once("error", reject);
    });
    expect(echoed.toString()).toBe("fixture bytes");
    expect(deps.connect).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "example.com", port: 443 }),
      public4,
      expect.any(AbortSignal),
    );
    expect(proxy.decisions).toEqual([
      { decision: "allowed", requestType: "connect", reason: "ALLOWED", classification: "public" },
    ]);
    tunnel.destroy();
  });

  it("leaves controlled end-to-end TLS identity verification to the client", async () => {
    const fixtureDirectory = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../security/fixtures",
    );
    const [cert, key] = await Promise.all([
      readFile(path.join(fixtureDirectory, "test-cert.pem")),
      readFile(path.join(fixtureDirectory, "test-key.pem")),
    ]);
    const tlsServer = tls.createServer({ cert, key }, (socket) => {
      socket.once("data", () => socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK"));
    });
    await new Promise<void>((resolve, reject) => {
      tlsServer.once("error", reject);
      tlsServer.listen(0, "127.0.0.1", resolve);
    });
    const address = tlsServer.address();
    if (!address || typeof address === "string") throw new Error("fixture TLS server did not bind");
    const deps = dependencies();
    deps.connect.mockImplementation(
      async () =>
        await new Promise<Socket>((resolve, reject) => {
          const socket = net.createConnection({ host: "127.0.0.1", port: address.port });
          socket.once("connect", () => resolve(socket));
          socket.once("error", reject);
        }),
    );
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const rawTunnel = await openTunnel(proxyPort(proxy.url));
    const secure = tls.connect({
      socket: rawTunnel,
      servername: "example.com",
      ca: cert,
      rejectUnauthorized: true,
    });
    const wire = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      secure.once("secureConnect", () => {
        expect(secure.authorized).toBe(true);
        secure.write("GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n");
      });
      secure.on("data", (chunk) => chunks.push(chunk));
      secure.once("error", reject);
      secure.once("close", () => resolve(Buffer.concat(chunks).toString("latin1")));
    });
    expect(wire).toContain("HTTP/1.1 200 OK");
    expect(wire).toContain("\r\n\r\nOK");
    await new Promise<void>((resolve) => tlsServer.close(() => resolve()));
  });

  it("rejects HTTP upgrades before DNS and transport", async () => {
    const deps = dependencies();
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const wire = await rawExchange(
      proxyPort(proxy.url),
      "GET http://example.com/socket HTTP/1.1\r\nHost: example.com\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
    );
    expect(wire).toContain("403 Forbidden");
    expect(proxy.decisions).toEqual([
      {
        decision: "blocked",
        requestType: "upgrade",
        reason: "UPGRADE_NOT_ALLOWED",
        classification: "request-policy",
      },
    ]);
    expect(deps.resolve).not.toHaveBeenCalled();
  });

  it.each([
    response(101, { upgrade: "websocket" }, new Uint8Array()),
    response(200, {}, Buffer.alloc(proxyLimits.maxBodyBytes + 1)),
  ])("fails closed for invalid fixture transport responses %#", async (upstream) => {
    const deps = dependencies();
    deps.request.mockResolvedValue(upstream);
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const wire = await rawExchange(
      proxyPort(proxy.url),
      "GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n",
    );
    expect(wire).toContain("502 Bad Gateway");
    expect(proxy.decisions).toEqual([
      expect.objectContaining({ decision: "blocked", requestType: "http" }),
    ]);
  });

  it("caps concurrently accepted client sockets", async () => {
    const proxy = await startProxy(dependencies());
    openProxies.push(proxy);
    const clients: Socket[] = [];
    for (let index = 0; index < proxyLimits.maxActiveSockets; index++) {
      clients.push(
        await new Promise<Socket>((resolve, reject) => {
          const socket = net.createConnection({ host: "127.0.0.1", port: proxyPort(proxy.url) });
          socket.once("connect", () => resolve(socket));
          socket.once("error", reject);
        }),
      );
    }
    const excess = net.createConnection({ host: "127.0.0.1", port: proxyPort(proxy.url) });
    await new Promise<void>((resolve, reject) => {
      excess.once("close", () => resolve());
      excess.once("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "ECONNRESET") resolve();
        else reject(error);
      });
    });
    expect(excess.destroyed).toBe(true);
    for (const client of clients) client.destroy();
  });

  it("applies an operation deadline and aborts stalled upstream work", async () => {
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) =>
      realSetTimeout(
        callback,
        delay === proxyLimits.operationMs ? 10 : delay,
        ...args,
      )) as typeof setTimeout);
    const deps = dependencies();
    deps.request.mockImplementation(
      async (_target, _pin, options) =>
        await new Promise<never>((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
        }),
    );
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const wire = await rawExchange(
      proxyPort(proxy.url),
      "GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n",
      false,
    );
    expect(wire === "" || wire.includes("502 Bad Gateway")).toBe(true);
    expect(proxy.decisions).toEqual([
      expect.objectContaining({
        decision: "blocked",
        reason: "REQUEST_TIMEOUT",
        classification: "transport",
      }),
    ]);
  });

  it("enforces cumulative byte and request caps while keeping audit records bounded and private", async () => {
    const deps = dependencies();
    deps.request.mockResolvedValue(response(200, {}, Buffer.alloc(proxyLimits.maxBodyBytes)));
    const proxy = await startProxy(deps);
    openProxies.push(proxy);
    const port = proxyPort(proxy.url);
    const request =
      "GET http://example.com/path?token=do-not-audit HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n";
    for (
      let index = 0;
      index < proxyLimits.maxTransferredBytes / proxyLimits.maxBodyBytes;
      index++
    ) {
      expect(await rawExchange(port, request)).toContain("200 OK");
    }
    expect(await rawExchange(port, request)).toContain("429 Too Many Requests");
    for (let index = requestCount(proxy); index <= proxyLimits.maxRequests; index++) {
      await rawExchange(
        port,
        "GET /not-absolute HTTP/1.1\r\nHost: proxy\r\nConnection: close\r\n\r\n",
      );
    }
    expect(proxy.decisions.at(-1)).toMatchObject({
      reason: "REQUEST_LIMIT",
      classification: "resource-limit",
    });
    expect(proxy.decisions.length).toBeLessThanOrEqual(proxyLimits.maxAuditRecords);
    expect(JSON.stringify(proxy.decisions)).not.toContain("do-not-audit");
    expect(proxyLimits).toMatchObject({
      lifetimeMs: expect.any(Number),
      maxActiveSockets: expect.any(Number),
      maxTotalSockets: expect.any(Number),
      maxAuditRecords: expect.any(Number),
    });
  }, 20_000);
});

function requestCount(proxy: { decisions: readonly unknown[] }): number {
  return proxy.decisions.length;
}
