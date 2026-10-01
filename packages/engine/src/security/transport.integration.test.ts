import { readFileSync } from "node:fs";
import https from "node:https";
import type { AddressInfo } from "node:net";
import tls from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyAddress, type PublicAddress } from "./ip-policy";
import { requestPinned } from "./transport";
import { type ParsedTarget, validateTargetUrl } from "./url-policy";

const cert = readFileSync(new URL("./fixtures/test-cert.pem", import.meta.url));
const key = readFileSync(new URL("./fixtures/test-key.pem", import.meta.url));
const realConnect = tls.connect;
let server: https.Server;
let port: number;
let requests: string[];
let sockets: tls.TLSSocket[];
let optionsSeen: tls.ConnectionOptions[];
let trustFixture: boolean;
let reportPinnedPeer: boolean;

beforeEach(async () => {
  requests = [];
  sockets = [];
  optionsSeen = [];
  trustFixture = true;
  reportPinnedPeer = true;
  server = https.createServer({ cert, key }, (request, response) => {
    requests.push(request.headers.host ?? "");
    response.end("controlled TLS fixture");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  port = (server.address() as AddressInfo).port;
  // Test-only routing shim: every real socket goes ONLY to the fixture created above.
  // The production API has no dialer, CA, policy override, or private-network option.
  vi.spyOn(tls, "connect").mockImplementation((first: unknown) => {
    const options = first as tls.ConnectionOptions;
    optionsSeen.push(options);
    const socket = realConnect({
      ...options,
      host: "127.0.0.1",
      port,
      ...(trustFixture ? { ca: cert } : {}),
    });
    if (reportPinnedPeer) {
      Object.defineProperty(socket, "remoteAddress", { get: () => options.host });
      Object.defineProperty(socket, "remotePort", { get: () => options.port });
    }
    sockets.push(socket);
    return socket;
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of sockets) socket.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const request = (hostname = "example.com") =>
  requestPinned(
    validateTargetUrl(`https://${hostname}/`) as ParsedTarget,
    classifyAddress("93.184.216.34") as PublicAddress,
    { method: "GET", signal: AbortSignal.timeout(2000), maxBodyBytes: 1024 },
  );

describe("controlled local TLS integration (never public/private infrastructure)", () => {
  it("preserves SNI/Host and validates the certificate for the original hostname", async () => {
    const result = await request();
    expect(Buffer.from(result.body).toString()).toBe("controlled TLS fixture");
    expect(requests).toEqual(["example.com"]);
    expect(optionsSeen[0]).toMatchObject({
      host: "93.184.216.34",
      port: 443,
      servername: "example.com",
      rejectUnauthorized: true,
    });
    expect(sockets[0]?.authorized).toBe(true);
  });
  it("rejects a trusted certificate for a different hostname before HTTP", async () => {
    await expect(request("different.com")).rejects.toMatchObject({
      code: "ERR_TLS_CERT_ALTNAME_INVALID",
    });
    expect(requests).toEqual([]);
  });
  it("rejects an untrusted certificate before HTTP", async () => {
    trustFixture = false;
    await expect(request()).rejects.toThrow();
    expect(requests).toEqual([]);
  });
  it("rejects the actual loopback peer even after valid TLS", async () => {
    reportPinnedPeer = false;
    await expect(request()).rejects.toMatchObject({ reason: "PEER_MISMATCH" });
    expect(requests).toEqual([]);
  });
});
