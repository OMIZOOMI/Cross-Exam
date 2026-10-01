import { afterEach, describe, expect, it, vi } from "vitest";
import { executeRequest } from "./request-core";
import {
  type DnsAnswer,
  EgressError,
  type HopResponse,
  type PinnedTransport,
  type RequestOptions,
  type ResolveHost,
} from "./types";

const public4: DnsAnswer = { address: "93.184.216.34", family: 4 };
const public6: DnsAnswer = { address: "2606:4700:4700::1111", family: 6 };
const response = (statusCode = 200, location?: string): HopResponse => ({
  statusCode,
  headers: location ? { location } : {},
  body: new Uint8Array([79, 75]),
});
function harness() {
  return {
    resolve: vi.fn<ResolveHost>(async () => [public4, public6]),
    transport: vi.fn<PinnedTransport>(async () => response()),
  };
}
afterEach(() => vi.useRealTimers());

describe("complete request/redirect boundary", () => {
  it("applies caller redirect restrictions before DNS or transport for the next hop", async () => {
    const deps = harness();
    deps.transport.mockResolvedValueOnce(response(302, "https://other.com/path"));
    const allowRedirect = vi.fn((url: string) => new URL(url).origin === "https://example.com");
    expect(await executeRequest("https://example.com", { allowRedirect }, deps)).toMatchObject({
      ok: false,
      reason: "REDIRECT_POLICY",
    });
    expect(allowRedirect).toHaveBeenCalledWith("https://other.com/path");
    expect(deps.resolve).toHaveBeenCalledOnce();
    expect(deps.transport).toHaveBeenCalledOnce();
  });
  it.each([
    () => false,
    () => {
      throw new Error("private detail");
    },
    (() => Promise.resolve(true)) as unknown as (url: string) => boolean,
  ])(
    "fails closed for a denying, throwing, or asynchronous restriction %#",
    async (allowRedirect) => {
      const deps = harness();
      deps.transport.mockResolvedValueOnce(response(302, "/next"));
      expect(await executeRequest("https://example.com", { allowRedirect }, deps)).toMatchObject({
        ok: false,
        reason: "REDIRECT_POLICY",
      });
      expect(deps.transport).toHaveBeenCalledOnce();
    },
  );
  it("a permissive hook cannot bypass unsafe redirected DNS", async () => {
    const deps = harness();
    deps.transport.mockResolvedValueOnce(response(302, "/next"));
    deps.resolve
      .mockResolvedValueOnce([public4])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    expect(
      await executeRequest("https://example.com", { allowRedirect: () => true }, deps),
    ).toMatchObject({ ok: false, reason: "UNSAFE_REDIRECT", cause: "UNSAFE_DNS_RESULT" });
    expect(deps.transport).toHaveBeenCalledOnce();
  });
  it("a permissive hook cannot bypass the URL policy or HTTPS downgrade rule", async () => {
    for (const location of ["https://localhost", "http://example.com/next"]) {
      const deps = harness();
      deps.transport.mockResolvedValueOnce(response(302, location));
      const allowRedirect = vi.fn(() => true);
      expect((await executeRequest("https://example.com", { allowRedirect }, deps)).ok).toBe(false);
      expect(allowRedirect).not.toHaveBeenCalled();
      expect(deps.transport).toHaveBeenCalledOnce();
    }
  });
  it("still fully revalidates allowed redirects", async () => {
    const deps = harness();
    deps.transport.mockResolvedValueOnce(response(302, "/next"));
    expect(
      await executeRequest("https://example.com", { allowRedirect: () => true }, deps),
    ).toMatchObject({ ok: true });
    expect(deps.resolve).toHaveBeenCalledTimes(2);
    expect(deps.transport).toHaveBeenCalledTimes(2);
  });
  it.each(["http://example.com", "https://example.com"])(
    "passes a checked pin into transport for %s",
    async (url) => {
      const deps = harness();
      const result = await executeRequest(url, {}, deps);
      expect(result).toMatchObject({
        ok: true,
        statusCode: 200,
        history: [{ address: public4.address }],
      });
      expect(deps.resolve).toHaveBeenCalledOnce();
      expect(deps.transport).toHaveBeenCalledWith(
        expect.objectContaining({ hostname: "example.com" }),
        { ...public4, ok: true, classification: "public" },
        expect.objectContaining({ method: "GET", maxBodyBytes: 1048576 }),
      );
    },
  );
  it("supports IPv6-only DNS", async () => {
    const deps = harness();
    deps.resolve.mockResolvedValue([public6]);
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: true,
      history: [{ family: 6 }],
    });
  });
  it.each(["http://localhost", "http://10.0.0.1", "file:///etc/passwd", "http://example.com:8080"])(
    "does not resolve denied input %s",
    async (url) => {
      const deps = harness();
      expect((await executeRequest(url, {}, deps)).ok).toBe(false);
      expect(deps.resolve).not.toHaveBeenCalled();
      expect(deps.transport).not.toHaveBeenCalled();
    },
  );
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "100.100.100.200",
    "192.0.2.1",
    "168.63.129.16",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:8.8.8.8",
    "2001:db8::1",
  ])("rejects public-looking hostname resolving to %s", async (address) => {
    const deps = harness();
    deps.resolve.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
    expect(await executeRequest("https://public-looking.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "UNSAFE_DNS_RESULT",
    });
    expect(deps.transport).not.toHaveBeenCalled();
  });
  it.each([
    [public4, { address: "10.0.0.1", family: 4 }],
    [public4, { address: "::1", family: 6 }],
    [{ address: "fd00::1", family: 6 }, public4],
    [public6, { address: "127.0.0.1", family: 4 }],
    [{ address: public4.address, family: 6 }],
  ] as DnsAnswer[][])("rejects mixed/mismatched answers %#", async (...answers) => {
    const deps = harness();
    deps.resolve.mockResolvedValue(answers);
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "UNSAFE_DNS_RESULT",
    });
    expect(deps.transport).not.toHaveBeenCalled();
  });
  it.each([[], Array.from({ length: 33 }, () => public4)])(
    "denies empty/excessive answers %#",
    async (...answers) => {
      const deps = harness();
      deps.resolve.mockResolvedValue(answers);
      expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
        ok: false,
        reason: "DNS_RESOLUTION_FAILED",
      });
      expect(deps.transport).not.toHaveBeenCalled();
    },
  );
  it("contains DNS failure details", async () => {
    const deps = harness();
    deps.resolve.mockRejectedValue(new Error("internal-resolver.secret"));
    const result = await executeRequest("https://example.com", {}, deps);
    expect(result).toMatchObject({ ok: false, reason: "DNS_RESOLUTION_FAILED" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(deps.transport).not.toHaveBeenCalled();
  });
  it.each([301, 302, 303, 307, 308])("fully revalidates a %s redirect", async (status) => {
    const deps = harness();
    deps.transport.mockResolvedValueOnce(response(status, "https://other.com/a"));
    const result = await executeRequest("https://example.com", {}, deps);
    expect(result).toMatchObject({ ok: true, url: "https://other.com/a" });
    expect(deps.resolve.mock.calls.map((call) => call[0])).toEqual(["example.com", "other.com"]);
    expect(deps.transport).toHaveBeenCalledTimes(2);
  });
  it("re-resolves same host redirects and blocks rebinding", async () => {
    const deps = harness();
    deps.transport.mockResolvedValueOnce(response(302, "/second"));
    deps.resolve
      .mockResolvedValueOnce([public4])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "UNSAFE_REDIRECT",
      cause: "UNSAFE_DNS_RESULT",
      hop: 1,
    });
    expect(deps.transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    "http://10.0.0.1",
    "https://[::1]",
    "http://localhost.",
    "ftp://other.com",
    "file:///etc/passwd",
    "https://other.com:8080",
    "https://@other.com",
    "//user:pass@other.com",
    "https://%6fther.com",
  ])("blocks unsafe redirect %s", async (location) => {
    const deps = harness();
    deps.transport.mockResolvedValueOnce(response(302, location));
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "UNSAFE_REDIRECT",
    });
    expect(deps.transport).toHaveBeenCalledOnce();
    expect(deps.resolve).toHaveBeenCalledOnce();
  });
  it("blocks hostname redirect with one private answer", async () => {
    const deps = harness();
    deps.transport.mockResolvedValueOnce(response(302, "https://other.com"));
    deps.resolve
      .mockResolvedValueOnce([public4])
      .mockResolvedValueOnce([public4, { address: "192.168.1.1", family: 4 }]);
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "UNSAFE_REDIRECT",
      cause: "UNSAFE_DNS_RESULT",
    });
    expect(deps.transport).toHaveBeenCalledOnce();
  });
  it("blocks HTTPS downgrade", async () => {
    const deps = harness();
    deps.transport.mockResolvedValueOnce(response(302, "http://other.com"));
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "HTTPS_DOWNGRADE",
    });
    expect(deps.transport).toHaveBeenCalledOnce();
  });
  it.each([undefined, "", " /next", "/a\n", "/a%0d", "\\localhost", "http://[", "/".repeat(2049)])(
    "rejects invalid redirect %#",
    async (location) => {
      const deps = harness();
      deps.transport.mockResolvedValueOnce(response(302, location));
      expect((await executeRequest("https://example.com", {}, deps)).ok).toBe(false);
      expect(deps.transport).toHaveBeenCalledOnce();
    },
  );
  it("stops a normalized fragment loop", async () => {
    const deps = harness();
    deps.transport.mockResolvedValue(response(302, "#again"));
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "REDIRECT_LOOP",
    });
    expect(deps.transport).toHaveBeenCalledOnce();
  });
  it("stops a two-host loop", async () => {
    const deps = harness();
    deps.transport
      .mockResolvedValueOnce(response(302, "https://other.com"))
      .mockResolvedValueOnce(response(302, "https://example.com"));
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "REDIRECT_LOOP",
    });
    expect(deps.transport).toHaveBeenCalledTimes(2);
  });
  it("enforces five redirects and never opens a seventh connection", async () => {
    const deps = harness();
    let count = 0;
    deps.transport.mockImplementation(async () => response(302, `/hop${++count}`));
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "REDIRECT_LIMIT",
    });
    expect(deps.transport).toHaveBeenCalledTimes(6);
  });
  it("can disable redirect following", async () => {
    const deps = harness();
    deps.transport.mockResolvedValue(response(302, "/next"));
    expect(await executeRequest("https://example.com", { maxRedirects: 0 }, deps)).toMatchObject({
      ok: false,
      reason: "REDIRECT_LIMIT",
    });
    expect(deps.transport).toHaveBeenCalledOnce();
  });
  it.each([
    { maxRedirects: 6 },
    { timeoutMs: 30001 },
    { timeoutMs: 0 },
    { maxBodyBytes: 1048577 },
    { method: "POST" },
    { agent: {} },
    { headers: { Host: "localhost" } },
    { lookup: () => {} },
    { maxRedirects: NaN },
    { maxBodyBytes: -1 },
  ])("rejects unsafe options %#", async (options) => {
    const deps = harness();
    expect(
      await executeRequest("https://example.com", options as RequestOptions, deps),
    ).toMatchObject({ ok: false, reason: "INVALID_OPTIONS" });
    expect(deps.resolve).not.toHaveBeenCalled();
  });
  it("does no work when already aborted", async () => {
    const deps = harness();
    expect(
      await executeRequest("https://example.com", { signal: AbortSignal.abort() }, deps),
    ).toMatchObject({ ok: false, reason: "ABORTED" });
    expect(deps.resolve).not.toHaveBeenCalled();
  });
  it("bounds DNS waiting and never connects after a late answer", async () => {
    vi.useFakeTimers();
    const deps = harness();
    let finish: (answers: DnsAnswer[]) => void = () => {};
    deps.resolve.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const result = executeRequest("https://example.com", { timeoutMs: 10 }, deps);
    await vi.advanceTimersByTimeAsync(11);
    expect(await result).toMatchObject({ ok: false, reason: "REQUEST_TIMEOUT" });
    finish([public4]);
    await Promise.resolve();
    expect(deps.transport).not.toHaveBeenCalled();
  });
  it("cancels an in-flight operation", async () => {
    const deps = harness();
    const controller = new AbortController();
    deps.transport.mockImplementation(async () => {
      controller.abort();
      throw new Error("cancelled");
    });
    expect(
      await executeRequest("https://example.com", { signal: controller.signal }, deps),
    ).toMatchObject({ ok: false, reason: "ABORTED" });
  });
  it("returns typed transport failures without internal error messages", async () => {
    const deps = harness();
    deps.transport.mockRejectedValue(new EgressError("PEER_MISMATCH", "connection"));
    expect(await executeRequest("https://example.com", {}, deps)).toMatchObject({
      ok: false,
      reason: "PEER_MISMATCH",
    });
  });
});
