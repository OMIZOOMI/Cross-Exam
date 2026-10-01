import net, { type Socket } from "node:net";
import { Duplex } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyAddress, type PublicAddress } from "../security/ip-policy";
import { type ParsedTarget, validateTargetUrl } from "../security/url-policy";
import { connectPinned } from "./connect";

class FixtureSocket extends Duplex {
  remoteAddress = "93.184.216.34";
  remotePort = 443;
  _read() {}
  _write(_chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void) {
    done();
  }
}

const target = validateTargetUrl("https://example.com/") as ParsedTarget;
const pin = classifyAddress("93.184.216.34") as PublicAddress;
let socket: FixtureSocket;

beforeEach(() => {
  socket = new FixtureSocket();
  vi.spyOn(net, "createConnection").mockImplementation((..._args: unknown[]) => {
    queueMicrotask(() => socket.emit("connect"));
    return socket as unknown as Socket;
  });
});

afterEach(() => {
  socket.destroy();
  vi.restoreAllMocks();
});

describe("production CONNECT pinning", () => {
  it("dials only the validated literal and verifies its connected peer", async () => {
    await expect(connectPinned(target, pin, new AbortController().signal)).resolves.toBe(socket);
    expect(net.createConnection).toHaveBeenCalledWith({
      host: "93.184.216.34",
      port: 443,
      family: 4,
      autoSelectFamily: false,
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    ["10.0.0.1", 443],
    ["1.1.1.1", 443],
    ["93.184.216.34", 80],
  ])("rejects peer substitution %s:%s before returning the socket", async (address, port) => {
    socket.remoteAddress = address;
    socket.remotePort = port;
    await expect(connectPinned(target, pin, new AbortController().signal)).rejects.toMatchObject({
      reason: "PEER_MISMATCH",
    });
    expect(socket.destroyed).toBe(true);
  });

  it("rejects forged pins and mismatched target metadata before opening a socket", async () => {
    await expect(
      connectPinned(target, { ...pin, address: "127.0.0.1" }, new AbortController().signal),
    ).rejects.toMatchObject({ reason: "PEER_MISMATCH" });
    await expect(
      connectPinned({ ...target, hostname: "other.com" }, pin, new AbortController().signal),
    ).rejects.toMatchObject({ reason: "PEER_MISMATCH" });
    expect(net.createConnection).not.toHaveBeenCalled();
  });

  it("does no network work after cancellation", async () => {
    await expect(connectPinned(target, pin, AbortSignal.abort())).rejects.toThrow();
    expect(net.createConnection).not.toHaveBeenCalled();
  });
});
