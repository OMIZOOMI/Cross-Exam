import { ScanInputSchema } from "@crossexam/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnavailableScanRunner } from "./runner";

afterEach(() => vi.unstubAllGlobals());

describe("disabled scanner boundary", () => {
  it("returns unavailable without calling fetch or inventing a report", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("Network must not run in the skeleton");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await new UnavailableScanRunner().run(
      ScanInputSchema.parse({ targetUrl: "https://example.com" }),
    );
    expect(result.status).toBe("unavailable");
    expect(result).not.toHaveProperty("report");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("honors an already aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new UnavailableScanRunner().run(
        ScanInputSchema.parse({ targetUrl: "https://example.com" }),
        controller.signal,
      ),
    ).rejects.toThrow();
  });
  it("revalidates typed input at runtime", async () => {
    await expect(
      new UnavailableScanRunner().run({
        targetUrl: "file:///etc/passwd",
        maxPages: 8,
        timeoutMs: 30000,
      }),
    ).rejects.toThrow();
  });
});

it.each([
  "http://localhost",
  "http://127.0.0.1",
  "https://example.com:8080",
  " https://example.com ",
])("disabled scanner rejects unsafe original target %s without network work", async (targetUrl) => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  expect(
    await new UnavailableScanRunner().run({ targetUrl, maxPages: 8, timeoutMs: 30000 }),
  ).toEqual({
    status: "rejected",
    code: "TARGET_NOT_ALLOWED",
    message: "This destination cannot be scanned.",
  });
  expect(fetchSpy).not.toHaveBeenCalled();
});
