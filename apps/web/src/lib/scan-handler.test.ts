import { safeRequest } from "@crossexam/engine/security";
import { beforeEach, expect, it, vi } from "vitest";
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
  const admission = Reflect.get(globalThis, Symbol.for("crossexam.scan-admission"));
  admission.active = true;
  expect((await handleScan(request())).status).toBe(429);
  admission.active = false;
  admission.starts = Array.from({ length: 6 }, () => Date.now());
  expect((await handleScan(request())).status).toBe(429);
  expect(safeRequest).not.toHaveBeenCalled();
});
