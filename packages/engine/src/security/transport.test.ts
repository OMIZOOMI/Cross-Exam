import net, { type Socket } from "node:net";
import { Duplex, type TransformCallback } from "node:stream";
import tls from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyAddress, type PublicAddress } from "./ip-policy";
import { requestPinned } from "./transport";
import { type ParsedTarget, validateTargetUrl } from "./url-policy";

// In-memory sockets exercise Node's real HTTP parser and Agent, without network access.
class WireSocket extends Duplex {
  remoteAddress = "93.184.216.34";
  remotePort = 443;
  authorized = true;
  written = "";
  reply: string | null = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK";
  private replied = false;
  _read() {}
  _write(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback) {
    this.written += chunk.toString();
    done();
    if (this.written.includes("\r\n\r\n") && !this.replied && this.reply !== null) {
      this.replied = true;
      queueMicrotask(() => {
        this.push(this.reply);
        this.push(null);
      });
    }
  }
  setTimeout() {
    return this;
  }
  setNoDelay() {
    return this;
  }
  setKeepAlive() {
    return this;
  }
  ref() {
    return this;
  }
  unref() {
    return this;
  }
}
let socket: WireSocket;
let connectionEvent = true;
const target = (url = "https://example.com/path?q=1") => validateTargetUrl(url) as ParsedTarget;
const pin = (ip = "93.184.216.34") => classifyAddress(ip) as PublicAddress;
const options = () => ({
  method: "GET" as const,
  maxBodyBytes: 1024,
  signal: new AbortController().signal,
});
beforeEach(() => {
  socket = new WireSocket();
  connectionEvent = true;
  vi.spyOn(net, "createConnection").mockImplementation((..._args: unknown[]) => {
    if (connectionEvent) queueMicrotask(() => socket.emit("connect"));
    return socket as unknown as Socket;
  });
  vi.spyOn(tls, "connect").mockImplementation((..._args: unknown[]) => {
    if (connectionEvent) queueMicrotask(() => socket.emit("secureConnect"));
    return socket as unknown as tls.TLSSocket;
  });
});
afterEach(() => {
  socket.destroy();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("pinned Node transport", () => {
  it("connects to the approved IPv4 while preserving Host, path, SNI, and TLS verification", async () => {
    const result = await requestPinned(target(), pin(), options());
    expect(Buffer.from(result.body).toString()).toBe("OK");
    expect(tls.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "93.184.216.34",
        port: 443,
        family: 4,
        autoSelectFamily: false,
        servername: "example.com",
        rejectUnauthorized: true,
        ALPNProtocols: ["http/1.1"],
      }),
    );
    expect(socket.written).toContain("GET /path?q=1 HTTP/1.1\r\n");
    expect(socket.written).toContain("Host: example.com\r\n");
    expect(socket.written).not.toMatch(/Cookie:|Authorization:|Proxy-Authorization:/i);
    expect(socket.destroyed).toBe(true);
    const tlsOptions = vi.mocked(tls.connect).mock.calls[0]?.[0] as tls.ConnectionOptions;
    const identity = vi.spyOn(tls, "checkServerIdentity").mockReturnValue(undefined);
    const certificate = {} as tls.PeerCertificate;
    tlsOptions.checkServerIdentity?.("incorrect-runtime-host", certificate);
    expect(identity).toHaveBeenCalledWith("example.com", certificate);
  });
  it("connects to a pinned IPv6 address and honors a non-default allowed port", async () => {
    socket.remoteAddress = "2606:4700:4700::1111";
    socket.remotePort = 80;
    await requestPinned(target("https://example.com:80/"), pin(socket.remoteAddress), options());
    expect(tls.connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: socket.remoteAddress, family: 6, port: 80 }),
    );
    expect(socket.written).toContain("Host: example.com:80");
  });
  it("ignores environment proxy settings and uses direct pinned TCP for HTTP", async () => {
    vi.stubEnv("HTTP_PROXY", "http://127.0.0.1:9999");
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:9999");
    vi.stubEnv("NODE_USE_ENV_PROXY", "1");
    socket.remotePort = 80;
    await requestPinned(target("http://example.com/"), pin(), options());
    expect(net.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ host: pin().address, port: 80 }),
    );
    expect(tls.connect).not.toHaveBeenCalled();
  });
  it("does not send an HTTP byte until the connected peer is verified", async () => {
    connectionEvent = false;
    const pending = requestPinned(target(), pin(), options());
    expect(socket.written).toBe("");
    socket.remoteAddress = "127.0.0.1";
    socket.emit("secureConnect");
    await expect(pending).rejects.toMatchObject({ reason: "PEER_MISMATCH" });
    expect(socket.written).toBe("");
    expect(socket.destroyed).toBe(true);
  });
  it.each(["private-peer", "different-public-peer", "wrong-port", "unauthorized-tls"])(
    "rejects %s before HTTP",
    async (fault) => {
      if (fault === "private-peer") socket.remoteAddress = "10.0.0.1";
      if (fault === "different-public-peer") socket.remoteAddress = "1.1.1.1";
      if (fault === "wrong-port") socket.remotePort = 22;
      if (fault === "unauthorized-tls") socket.authorized = false;
      await expect(requestPinned(target(), pin(), options())).rejects.toMatchObject({
        reason: "PEER_MISMATCH",
      });
      expect(socket.written).toBe("");
    },
  );
  it("rejects a forged private pin before creating a socket", async () => {
    await expect(
      requestPinned(target(), { ...pin(), address: "127.0.0.1" }, options()),
    ).rejects.toMatchObject({ reason: "PEER_MISMATCH" });
    expect(tls.connect).not.toHaveBeenCalled();
  });
  it("rejects mismatched target metadata", async () => {
    await expect(
      requestPinned({ ...target(), hostname: "localhost" }, pin(), options()),
    ).rejects.toMatchObject({ reason: "PEER_MISMATCH" });
    expect(tls.connect).not.toHaveBeenCalled();
  });
  it("does not follow redirects or buffer their bodies", async () => {
    socket.reply =
      "HTTP/1.1 302 Found\r\nLocation: http://localhost/\r\nContent-Length: 99999999\r\n\r\n";
    const result = await requestPinned(target(), pin(), options());
    expect(result.statusCode).toBe(302);
    expect(result.body).toHaveLength(0);
    expect(tls.connect).toHaveBeenCalledOnce();
    expect(socket.destroyed).toBe(true);
  });
  it.each([
    ["HTTP/1.1 200 OK\r\nContent-Length: 2048\r\n\r\n", "RESPONSE_TOO_LARGE"],
    [
      `HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n800\r\n${"a".repeat(2048)}\r\n0\r\n\r\n`,
      "RESPONSE_TOO_LARGE",
    ],
    ["HTTP/1.1 302 Found\r\nLocation: /one\r\nLocation: /two\r\n\r\n", "INVALID_RESPONSE"],
    [
      "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: 2\r\n\r\nOK",
      "INVALID_RESPONSE",
    ],
    [
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
      "INVALID_RESPONSE",
    ],
  ])("rejects unsafe/oversized responses %#", async (reply, reason) => {
    socket.reply = reply;
    await expect(requestPinned(target(), pin(), options())).rejects.toMatchObject({ reason });
    expect(socket.destroyed).toBe(true);
  });
  it("enforces the header byte cap through Node's parser", async () => {
    socket.reply = `HTTP/1.1 200 OK\r\nX-Large: ${"a".repeat(17000)}\r\n\r\n`;
    await expect(requestPinned(target(), pin(), options())).rejects.toMatchObject({
      code: "HPE_HEADER_OVERFLOW",
    });
    expect(socket.destroyed).toBe(true);
  });
  it("rejects truncated bodies", async () => {
    socket.reply = "HTTP/1.1 200 OK\r\nContent-Length: 20\r\n\r\nshort";
    await expect(requestPinned(target(), pin(), options())).rejects.toThrow();
  });
  it("destroys an in-flight response when cancelled", async () => {
    socket.reply = null;
    const controller = new AbortController();
    const pending = requestPinned(target(), pin(), { ...options(), signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(socket.destroyed).toBe(true);
  });
  it("HEAD does not treat entity Content-Length as downloaded bytes", async () => {
    socket.reply = "HTTP/1.1 200 OK\r\nContent-Length: 999999\r\n\r\n";
    expect(await requestPinned(target(), pin(), { ...options(), method: "HEAD" })).toMatchObject({
      statusCode: 200,
    });
    expect(socket.written).toContain("HEAD /path?q=1 HTTP/1.1");
  });
});
