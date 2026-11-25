import { safeRequest } from "@crossexam/engine/security";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { saveReport } from "./report-store";
import { handleScan } from "./scan-handler";

vi.mock("@crossexam/engine/security", () => ({ safeRequest: vi.fn() }));
vi.mock("./report-store", () => ({ saveReport: vi.fn(async (report) => report.summary.id) }));
const request = (
  body: unknown = { targetUrl: "https://example.com" },
  headers: Record<string, string> = {},
) =>
  new Request("http://127.0.0.1:3000/api/scans", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("VEYRA_PUBLIC_ORIGIN", undefined);
  const admission = Reflect.get(globalThis, Symbol.for("crossexam.scan-admission"));
  admission.active = false;
  admission.starts = [];
  vi.mocked(saveReport).mockClear();
  vi.mocked(safeRequest)
    .mockReset()
    .mockImplementation(async (input) => {
      const url = String(input);
      return {
        ok: true,
        url,
        statusCode: url.endsWith(".txt") || url.endsWith(".xml") ? 404 : 200,
        headers: { "content-type": "text/html" },
        body: Buffer.from('<html lang="en"><title>Real parser test</title><h1>Hello</h1></html>'),
        history: [{ url, address: "93.184.216.34", family: 4, statusCode: 200 }],
      };
    });
});
afterEach(() => vi.unstubAllEnvs());
it("runs the collector and saves its validated report, exposing only a report ID", async () => {
  const response = await handleScan(request());
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["id"]);
  expect(saveReport).toHaveBeenCalledOnce();
  const report = vi.mocked(saveReport).mock.calls[0]?.[0];
  expect(report?.pages[0]?.title).toBe("Real parser test");
  expect(report?.summary.source).toBe("live");
  expect(report?.agentRuns).toEqual([]);
});
it.each([
  [403, { origin: "https://attacker.com" }, { targetUrl: "https://example.com" }],
  [403, { "sec-fetch-site": "cross-site" }, { targetUrl: "https://example.com" }],
  [
    403,
    { host: "attacker.com", origin: "http://attacker.com" },
    { targetUrl: "https://example.com" },
  ],
  [
    403,
    { host: "localhost:3001", origin: "http://localhost:3001" },
    { targetUrl: "https://example.com" },
  ],
  [
    403,
    { host: "user@localhost:3000", origin: "http://localhost:3000" },
    { targetUrl: "https://example.com" },
  ],
  [403, { host: "localhost:3000" }, { targetUrl: "https://example.com" }],
  [415, { "content-type": "text/plain" }, { targetUrl: "https://example.com" }],
  [400, {}, { targetUrl: "http://localhost" }],
  [400, {}, { targetUrl: "https://example.com", allowPrivate: true }],
  [413, {}, { targetUrl: "x".repeat(5000) }],
] as const)("denies invalid or cross-site input %#", async (status, headers, body) => {
  expect((await handleScan(request(body, headers))).status).toBe(status);
  expect(safeRequest).not.toHaveBeenCalled();
  expect(saveReport).not.toHaveBeenCalled();
});
it("accepts the original exact local origin when Next normalizes the internal request URL", async () => {
  const incoming = request();
  const normalized = new Request("http://localhost:3000/api/scans", incoming);
  expect((await handleScan(normalized)).status).toBe(201);
});
it.each(["localhost", "[::1]"])("accepts %s in loopback mode", async (hostname) => {
  const host = `${hostname}:3000`;
  const local = request(undefined, { host, origin: `http://${host}` });
  expect((await handleScan(new Request(`http://${host}/api/scans`, local))).status).toBe(201);
});

const publicOrigin = "https://veyra.onrender.com";
const publicHost = "veyra.onrender.com";
const publicRequest = (headers: Record<string, string> = {}, body?: unknown) =>
  request(body, { host: publicHost, origin: publicOrigin, ...headers });

it.each<Record<string, string>>([
  {},
  { "x-forwarded-host": publicHost },
  { host: "127.0.0.1:3000", "x-forwarded-host": publicHost },
])("accepts the exact configured public origin with headers %j", async (headers) => {
  vi.stubEnv("VEYRA_PUBLIC_ORIGIN", publicOrigin);
  expect((await handleScan(publicRequest(headers))).status).toBe(201);
});

it.each<Record<string, string>>([
  { origin: "https://other.example" },
  { origin: `${publicOrigin}/` },
  { "sec-fetch-site": "cross-site" },
  { host: "other.example" },
  { host: "other.example", "x-forwarded-host": publicHost },
  { "x-forwarded-host": "other.example" },
  { "x-forwarded-host": `${publicHost}, other.example` },
  { host: "127.0.0.1:3000" },
])("rejects mismatched public admission headers %j", async (headers) => {
  vi.stubEnv("VEYRA_PUBLIC_ORIGIN", publicOrigin);
  expect((await handleScan(publicRequest(headers))).status).toBe(403);
  expect(safeRequest).not.toHaveBeenCalled();
  expect(saveReport).not.toHaveBeenCalled();
});

it.each(["", "http://veyra.onrender.com", `${publicOrigin}/`, `${publicOrigin}/login`])(
  "fails closed for an invalid configured origin %j",
  async (setting) => {
    vi.stubEnv("VEYRA_PUBLIC_ORIGIN", setting);
    expect((await handleScan(publicRequest())).status).toBe(403);
    expect((await handleScan(request())).status).toBe(403);
    expect(safeRequest).not.toHaveBeenCalled();
  },
);

it("does not use forwarded hosts to admit scans in loopback mode", async () => {
  expect(
    (await handleScan(publicRequest({ host: "127.0.0.1:3000", "x-forwarded-host": publicHost })))
      .status,
  ).toBe(403);
  expect(safeRequest).not.toHaveBeenCalled();
});

it("rejects invalid or large public bodies before starting a scan", async () => {
  vi.stubEnv("VEYRA_PUBLIC_ORIGIN", publicOrigin);
  expect((await handleScan(new Request(publicRequest(), { body: '{"targetUrl":' }))).status).toBe(
    403,
  );
  expect((await handleScan(publicRequest({}, { targetUrl: "x".repeat(5000) }))).status).toBe(403);
  expect(safeRequest).not.toHaveBeenCalled();
  expect(saveReport).not.toHaveBeenCalled();
});

it("uses the same destination policy and scan limits on the public host", async () => {
  vi.stubEnv("VEYRA_PUBLIC_ORIGIN", publicOrigin);
  expect((await handleScan(publicRequest({}, { targetUrl: "http://127.0.0.1" }))).status).toBe(400);
  expect(safeRequest).not.toHaveBeenCalled();
  const admission = Reflect.get(globalThis, Symbol.for("crossexam.scan-admission"));
  admission.active = true;
  expect((await handleScan(publicRequest())).status).toBe(429);
  admission.active = false;
  admission.starts = Array.from({ length: 6 }, () => Date.now());
  expect((await handleScan(publicRequest())).status).toBe(429);
  expect(safeRequest).not.toHaveBeenCalled();
});
it("redacts DNS failures and releases the active-scan slot", async () => {
  vi.mocked(safeRequest).mockResolvedValue({
    ok: false,
    reason: "DNS_RESOLUTION_FAILED",
    stage: "dns",
    hop: 0,
    history: [],
  });
  const response = await handleScan(request());
  expect(response.status).toBe(422);
  expect(await response.text()).not.toContain("DNS");
  expect(Reflect.get(globalThis, Symbol.for("crossexam.scan-admission")).active).toBe(false);
});
it("enforces concurrency and per-process admission bounds", async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const admission = Reflect.get(globalThis, Symbol.for("crossexam.scan-admission"));
  try {
    admission.active = true;
    const busy = await handleScan(request());
    expect(busy.status).toBe(429);
    expect(await busy.json()).toEqual({
      message: "Another scan is running right now. Please wait a few seconds and try again.",
    });
    admission.active = false;
    admission.starts = [now - 45000, ...Array<number>(5).fill(now)];
    const limited = await handleScan(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("15");
    expect(await limited.json()).toEqual({
      message: "Too many scans in the last minute. Please wait about 15 seconds and try again.",
    });
    expect(safeRequest).not.toHaveBeenCalled();
    clock.mockReturnValue(now + 15000);
    expect((await handleScan(request())).status).toBe(201);
  } finally {
    clock.mockRestore();
  }
});

it.each(["cancel", "deadline"] as const)(
  "only saves the partial report after a scan %s when the caller is still waiting",
  async (event) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let notifyStarted = () => {};
    const slowStarted = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const collect = vi.mocked(safeRequest).getMockImplementation();
    if (!collect) throw new Error("Missing transport");
    vi.mocked(safeRequest).mockImplementation(async (input, options) => {
      if (new URL(String(input)).pathname === "/slow") {
        notifyStarted();
        await new Promise<void>((done) =>
          options?.signal?.addEventListener("abort", () => done(), { once: true }),
        );
        return { ok: false, reason: "ABORTED", stage: "connection", history: [], hop: 0 };
      }
      const result = await collect(input, options);
      return result.ok && new URL(String(input)).pathname === "/"
        ? { ...result, body: Buffer.from('<title>Homepage</title><a href="/slow">Slow</a>') }
        : result;
    });
    try {
      const pending = handleScan(new Request(request(), { signal: controller.signal }));
      await slowStarted;
      if (event === "cancel") {
        controller.abort();
        expect((await pending).status).toBe(422);
        expect(saveReport).not.toHaveBeenCalled();
      } else {
        await vi.advanceTimersByTimeAsync(45000);
        expect((await pending).status).toBe(201);
        expect(saveReport).toHaveBeenCalledWith(
          expect.objectContaining({
            summary: expect.objectContaining({ status: "partial" }),
          }),
        );
      }
      expect(Reflect.get(globalThis, Symbol.for("crossexam.scan-admission")).active).toBe(false);
      vi.mocked(safeRequest).mockImplementation(collect);
      expect((await handleScan(request())).status).toBe(201);
    } finally {
      vi.useRealTimers();
    }
  },
);
