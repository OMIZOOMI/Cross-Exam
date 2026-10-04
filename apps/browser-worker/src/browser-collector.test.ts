import { EventEmitter } from "node:events";
import {
  BrowserEvidenceCollectionSchema,
  BROWSER_EVIDENCE_LIMITS as L,
} from "@crossexam/contracts";
import {
  browserEvidenceRecords,
  safeFailure,
  safeHeaders,
  safeObservedUrl,
  safeText,
} from "@crossexam/engine/browser-evidence";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("./fixture-worker", () => ({ launchFixtureWorker: mocks.launch }));

import {
  collectFixtureBrowserEvidence,
  emptyBrowserCollection,
  finalizeBrowserCollection,
} from "./browser-collector";

describe("browser observation contract and retention", () => {
  it("validates version, controlled scope, observed provenance and strict fields", () => {
    const base = emptyBrowserCollection("rich");
    expect(BrowserEvidenceCollectionSchema.parse(base).provenance).toBe("OBSERVED");
    for (const changed of [
      { version: 2 },
      { provenance: "INFERRED" },
      { source: "live" },
      { screenshots: [] },
    ])
      expect(BrowserEvidenceCollectionSchema.safeParse({ ...base, ...changed }).success).toBe(
        false,
      );
  });
  it.each(["authorization", "cookie", "set-cookie", "proxy-authorization", "x-api-key"])(
    "rejects retained %s headers",
    (name) => {
      const base = emptyBrowserCollection("rich");
      base.navigation.headers[name] = "DISPOSABLE_NOT_A_SECRET";
      expect(BrowserEvidenceCollectionSchema.safeParse(base).success).toBe(false);
    },
  );
  it("requires sanitized bounded URLs and strings", () => {
    const base = emptyBrowserCollection("rich");
    for (const target of [
      "http://user:pass@fixture.test/",
      "https://fixture.test/?token=x",
      "file:///tmp/file",
      `https://fixture.test/${"x".repeat(L.url)}`,
    ])
      expect(BrowserEvidenceCollectionSchema.safeParse({ ...base, target }).success).toBe(false);
    base.console.push({
      level: "error",
      text: "x".repeat(L.text + 1),
      location: { url: null, line: 0, column: 0 },
    });
    expect(BrowserEvidenceCollectionSchema.safeParse(base).success).toBe(false);
  });
  it("rejects arbitrary request payloads and error stacks", () => {
    const base = emptyBrowserCollection("rich");
    const request = {
      id: 1,
      url: null,
      method: "POST",
      resourceType: "fetch",
      outcome: "failed",
      failure: "ERR_FAILED",
      redirectedFrom: null,
    };
    for (const extra of [{ body: "private" }, { headers: {} }, { cookies: [] }])
      expect(
        BrowserEvidenceCollectionSchema.safeParse({ ...base, requests: [{ ...request, ...extra }] })
          .success,
      ).toBe(false);
    expect(
      BrowserEvidenceCollectionSchema.safeParse({
        ...base,
        pageErrors: [{ name: "Error", message: "observed", stack: "private" }],
      }).success,
    ).toBe(false);
  });
  it("rejects form values, input names, storage, and excessive arrays", () => {
    const base = emptyBrowserCollection("rich");
    expect(BrowserEvidenceCollectionSchema.safeParse({ ...base, storage: {} }).success).toBe(false);
    base.console = Array.from({ length: L.console + 1 }, () => ({
      level: "error",
      text: "x",
      location: { url: null, line: 0, column: 0 },
    }));
    expect(BrowserEvidenceCollectionSchema.safeParse(base).success).toBe(false);
    const dom = {
      url: null,
      title: "",
      description: null,
      canonical: null,
      headings: [],
      forms: [
        {
          method: "post",
          action: null,
          inputCount: 1,
          inputTypes: [{ type: "password", count: 1, value: "private" }],
        },
      ],
      links: [],
      resources: [],
      counts: { headings: 0, forms: 1, links: 0, resources: 0, inspectedElements: 2 },
    };
    expect(
      BrowserEvidenceCollectionSchema.safeParse({ ...emptyBrowserCollection("rich"), dom }).success,
    ).toBe(false);
  });
  it("rejects duplicate request identities and unobserved response references", () => {
    const base = emptyBrowserCollection("rich");
    base.responses.push({
      requestId: 1,
      url: null,
      status: 200,
      resourceType: "document",
      headers: {},
      contentType: null,
    });
    expect(BrowserEvidenceCollectionSchema.safeParse(base).success).toBe(false);
    base.truncation.dropped.requests = 1;
    expect(BrowserEvidenceCollectionSchema.safeParse(base).success).toBe(true);
  });
  it("evicts deterministic tails to the byte cap and reports exactly discarded entries", () => {
    const base = emptyBrowserCollection("rich");
    base.requests = Array.from({ length: L.requests }, (_, id) => ({
      id,
      url: `https://fixture.test/${"x".repeat(950)}`,
      method: "GET",
      resourceType: "fetch",
      outcome: "finished",
      failure: null,
      redirectedFrom: null,
    }));
    expect(BrowserEvidenceCollectionSchema.safeParse(base).success).toBe(false);
    const result = finalizeBrowserCollection(base);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(L.resultBytes);
    expect(result.truncation.resultSize).toBe(true);
    expect(result.truncation.dropped.requests).toBe(L.requests - result.requests.length);
    expect(result.requests.map((entry) => entry.id)).toEqual(
      Array.from({ length: result.requests.length }, (_, id) => id),
    );
  });
  it("appends browser-specific evidence without modifying an HTTP evidence list", () => {
    const collection = emptyBrowserCollection("rich");
    const records = browserEvidenceRecords(collection, "S-owned", "BC-1");
    expect(records).toHaveLength(5);
    expect(
      records.every(
        (record) =>
          record.provenance === "OBSERVED" &&
          record.source === "fixture" &&
          record.code?.startsWith("BROWSER_") &&
          record.collector === "chromium-runtime-v1",
      ),
    ).toBe(true);
    expect(new Set(records.map((entry) => entry.id)).size).toBe(records.length);
  });
});

describe("observation privacy", () => {
  it("uses stable allowlisted headers, removes secrets, nonce, query and cookie values", () => {
    const T = emptyBrowserCollection("rich").truncation;
    const result = safeHeaders(
      {
        "x-api-key": "DISPOSABLE_NOT_A_SECRET",
        "set-cookie": "private",
        authorization: "private",
        "content-type": "text/html",
        "content-security-policy":
          "script-src 'nonce-DISPOSABLE_NOT_A_SECRET'; report-uri https://fixture.test/report?token=DISPOSABLE_NOT_A_SECRET",
      },
      T,
    );
    expect(Object.keys(result)).toEqual(["content-type", "content-security-policy"]);
    expect(JSON.stringify(result)).not.toContain("DISPOSABLE_NOT_A_SECRET");
    expect(T.omittedHeaders).toBe(3);
    expect(T.redactedFields).toBeGreaterThan(0);
  });
  it.each([
    "password=DISPOSABLE_NOT_A_SECRET",
    "token: DISPOSABLE_NOT_A_SECRET",
    "api_key='DISPOSABLE_NOT_A_SECRET'",
    "Bearer DISPOSABLE_NOT_A_SECRET",
    "Cookie=DISPOSABLE_NOT_A_SECRET",
    "https://user:DISPOSABLE_NOT_A_SECRET@fixture.test/?key=DISPOSABLE_NOT_A_SECRET",
  ])("redacts console/page-error text %s", (input) => {
    const T = emptyBrowserCollection("rich").truncation;
    expect(safeText(input, T)).not.toContain("DISPOSABLE_NOT_A_SECRET");
    expect(T.redactedFields).toBeGreaterThan(0);
  });
  it("bounds oversized/control strings and malformed URLs", () => {
    const T = emptyBrowserCollection("rich").truncation;
    expect(safeText(`a\u0000${"x".repeat(9000)}`, T)).toHaveLength(L.text);
    for (const input of ["not a URL", "data:private", `http://fixture.test/${"x".repeat(5000)}`])
      expect(safeObservedUrl(input, T)).toBeNull();
    expect(T.omittedUrls).toBe(3);
    expect(T.shortenedStrings).toBe(1);
    expect(
      safeObservedUrl("https://fixture.test/token/DISPOSABLE_NOT_A_SECRET?key=private#private", T),
    ).not.toContain("DISPOSABLE_NOT_A_SECRET");
  });
  it("keeps only stable network failure codes", () => {
    expect(safeFailure("net::ERR_PROXY_CONNECTION_FAILED at private details")).toBe(
      "ERR_PROXY_CONNECTION_FAILED",
    );
    expect(safeFailure("token=private\nstack")).toBe("REQUEST_FAILED");
  });
});

describe("collector lifecycle under existing worker ownership", () => {
  beforeEach(() => {
    mocks.launch.mockReset();
  });
  function fakeWorker() {
    const context = new EventEmitter();
    const page = new EventEmitter();
    const mainFrame = {};
    Object.assign(page, {
      mainFrame: () => mainFrame,
      url: () => "about:blank",
      goto: vi.fn(async () => {
        throw new Error("net::ERR_FAILED");
      }),
      waitForTimeout: vi.fn(),
      evaluate: vi.fn(),
    });
    const close = vi.fn(async () => undefined);
    return { context, page, close, decisions: [], operationalDeadlineAt: Date.now() + 1000 };
  }
  it("rejects arbitrary targets/configuration before launching", async () => {
    await expect(
      collectFixtureBrowserEvidence({
        proxyServer: "ignored",
        fixture: "rich",
        target: "https://attacker.test",
      } as Parameters<typeof collectFixtureBrowserEvidence>[0]),
    ).rejects.toThrow();
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it("returns bounded launch failure without retaining exception data", async () => {
    mocks.launch.mockRejectedValue(new Error("password=private\nstack"));
    const result = await collectFixtureBrowserEvidence({ fixture: "rich", proxyServer: "ignored" });
    expect(result.outcome).toBe("launch-failed");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("cleans navigation failure and detaches all collection listeners", async () => {
    const worker = fakeWorker();
    mocks.launch.mockResolvedValue(worker);
    const result = await collectFixtureBrowserEvidence({
      fixture: "failure",
      proxyServer: "ignored",
    });
    expect(result.outcome).toBe("navigation-failed");
    expect(result.navigation.failure).toBe("ERR_FAILED");
    expect(worker.close).toHaveBeenCalledOnce();
    expect(worker.context.eventNames()).toEqual([]);
    expect(worker.page.eventNames()).toEqual([]);
  });
  it("cancels before launch without creating browser resources", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await collectFixtureBrowserEvidence({
      fixture: "rich",
      proxyServer: "ignored",
      signal: controller.signal,
    });
    expect(result.outcome).toBe("cancelled");
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it("closes a browser when cancellation arrives during launch", async () => {
    const controller = new AbortController();
    const worker = fakeWorker();
    mocks.launch.mockImplementation(async () => {
      controller.abort();
      return worker;
    });
    const result = await collectFixtureBrowserEvidence({
      fixture: "rich",
      proxyServer: "ignored",
      signal: controller.signal,
    });
    expect(result.outcome).toBe("cancelled");
    expect(worker.close).toHaveBeenCalledOnce();
  });
  it("classifies the existing worker operational deadline as timeout", async () => {
    const worker = fakeWorker();
    worker.operationalDeadlineAt = Date.now() - 1;
    mocks.launch.mockResolvedValue(worker);
    const result = await collectFixtureBrowserEvidence({ fixture: "slow", proxyServer: "ignored" });
    expect(result.outcome).toBe("timeout");
    expect(worker.close).toHaveBeenCalledOnce();
  });
  it("closes and detaches on browser crash", async () => {
    const worker = fakeWorker();
    Object.assign(worker.page, {
      goto: async () => {
        worker.page.emit("crash");
        throw new Error("Page closed");
      },
    });
    mocks.launch.mockResolvedValue(worker);
    const result = await collectFixtureBrowserEvidence({ fixture: "rich", proxyServer: "ignored" });
    expect(result.outcome).toBe("browser-closed");
    expect(worker.close).toHaveBeenCalled();
    expect(worker.page.eventNames()).toEqual([]);
  });
  it("records ordered request metadata without invoking any body/header/argument/stack access", async () => {
    const worker = fakeWorker();
    const forbidden = () => {
      throw new Error("Forbidden payload access");
    };
    const frame = (worker.page as unknown as { mainFrame(): unknown }).mainFrame();
    const first = {
      url: () =>
        "http://entry.crossexam-fixture.com/collector/redirect?token=DISPOSABLE_NOT_A_SECRET",
      method: () => "GET",
      resourceType: () => "document",
      redirectedFrom: () => null,
      isNavigationRequest: () => true,
      frame: () => frame,
      headers: forbidden,
      postData: forbidden,
    };
    const next = {
      ...first,
      method: () => "POST",
      redirectedFrom: () => first,
      url: () => "http://entry.crossexam-fixture.com/collector/rich",
      failure: () => ({ errorText: "net::ERR_FAILED password=private" }),
    };
    const error = new Error("token=DISPOSABLE_NOT_A_SECRET");
    Object.defineProperty(error, "stack", { get: forbidden });
    Object.assign(worker.page, {
      goto: async () => {
        worker.context.emit("request", first);
        worker.context.emit("request", next);
        worker.context.emit("response", {
          request: () => first,
          url: first.url,
          status: () => 302,
          headers: () => ({ "content-type": "text/html", "set-cookie": "DISPOSABLE_NOT_A_SECRET" }),
          body: forbidden,
        });
        worker.context.emit("requestfinished", first);
        worker.context.emit("requestfailed", next);
        worker.context.emit("console", {
          type: () => "warning",
          text: () => "token=DISPOSABLE_NOT_A_SECRET",
          args: forbidden,
          location: () => ({ url: first.url(), lineNumber: 1, columnNumber: 2 }),
        });
        worker.page.emit("pageerror", error);
        throw new Error("net::ERR_FAILED");
      },
    });
    mocks.launch.mockResolvedValue(worker);
    const result = await collectFixtureBrowserEvidence({ fixture: "rich", proxyServer: "ignored" });
    expect(result.requests.map((entry) => [entry.id, entry.outcome, entry.redirectedFrom])).toEqual(
      [
        [1, "finished", null],
        [2, "failed", 1],
      ],
    );
    expect(result.responses[0]?.requestId).toBe(1);
    expect(result.navigation.chain).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("DISPOSABLE_NOT_A_SECRET");
    expect(worker.close).toHaveBeenCalledOnce();
  });
});
