import {
  BrowserEvidenceCollectionSchema,
  BrowserPerformanceEvidenceSchema,
  BROWSER_PERFORMANCE_LIMITS as L,
  NAVIGATION_TIMING_FIELDS,
  PERFORMANCE_TYPES,
  type RawBrowserPerformance,
  RESOURCE_INITIATORS,
} from "@crossexam/contracts";
import {
  browserEvidenceRecords,
  browserRuntimeAnalysis,
  deriveCLS,
  deriveNavigation,
  finalizePerformance,
} from "@crossexam/engine/browser-evidence";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBrowserCollection, finalizeBrowserCollection } from "./browser-collector";
import { performanceObserverInit } from "./performance-observer";

function raw(): RawBrowserPerformance {
  return {
    observationWindow: {
      startTime: 0,
      observerInstalledAt: 1,
      endTime: 1000,
      timeOrigin: 10000,
      plannedPostLoadMs: 300,
      scope: "top-level-document",
      finite: true,
      visibility: "visible",
    },
    supported: Object.fromEntries(PERFORMANCE_TYPES.map((key) => [key, true])),
    navigation: Object.fromEntries(NAVIGATION_TIMING_FIELDS.map((key) => [key, null])),
    paints: [],
    lcp: [],
    layoutShifts: [],
    resources: [],
    longTasks: [],
    observed: { paints: 0, lcp: 0, layoutShifts: 0, resources: 0, longTasks: 0 },
    deliveredTotals: {
      provenance: "DERIVED",
      transferBytes: null,
      decodedBytes: null,
      unavailableTransferSizes: 0,
      unavailableDecodedSizes: 0,
      zeroTransferSizes: 0,
      resourceTypeCounts: Object.fromEntries(RESOURCE_INITIATORS.map((key) => [key, 0])),
      longTaskDuration: 0,
      maximumLongTaskDuration: null,
    },
    resourceBufferFull: false,
  };
}
const finalize = (r = raw()) => finalizePerformance(r, emptyBrowserCollection("rich").truncation);
const resource = (url = "http://entry.crossexam-fixture.com/owned") => ({
  url,
  initiatorType: "fetch" as const,
  startTime: 1,
  duration: 90,
  responseStart: 40,
  responseEnd: 91,
  transferSize: 100,
  encodedBodySize: 80,
  decodedBodySize: 160,
  protocol: "http/1.1" as const,
});

describe("LAB performance contract and derivation", () => {
  it("composes versioned raw OBSERVED evidence with DERIVED math and no inference", () => {
    const p = finalize();
    expect(BrowserPerformanceEvidenceSchema.parse(p).measurementKind).toBe("LAB");
    expect(p.provenance).toBe("OBSERVED");
    expect(p.derivedNavigation.provenance).toBe("DERIVED");
    expect(p.deliveredTotals.provenance).toBe("DERIVED");
    for (const change of [
      { schemaVersion: 2 },
      { provenance: "INFERRED" },
      { measurementKind: "RUM" },
      { score: 100 },
      { traces: [] },
    ])
      expect(BrowserPerformanceEvidenceSchema.safeParse({ ...p, ...change }).success).toBe(false);
  });
  it("keeps unsupported and absent paint/LCP metrics null, and INP unmeasured", () => {
    const r = raw();
    r.supported.paint = false;
    const p = finalize(r);
    expect(p.metrics.fcp).toEqual({ value: null, status: "unsupported" });
    expect(p.metrics.lcp).toEqual({ value: null, status: "not-observed" });
    expect(p.metrics.inp.status).toBe("not-measured");
    expect(p.derivedNavigation.load.valueMs).toBeNull();
    expect(p.deliveredTotals.transferBytes).toBeNull();
  });
  it("derives durations only from declared captured browser fields", () => {
    const n = {
      ...raw().navigation,
      startTime: 0,
      domainLookupStart: 10,
      domainLookupEnd: 20,
      connectStart: 20,
      secureConnectionStart: 30,
      connectEnd: 50,
      requestStart: 60,
      responseStart: 100,
      responseEnd: 150,
      domInteractive: 160,
      domContentLoadedEventEnd: 180,
      loadEventEnd: 200,
    };
    const d = deriveNavigation(n);
    expect(d.dns.valueMs).toBe(10);
    expect(d.connection.valueMs).toBe(30);
    expect(d.tls.valueMs).toBe(20);
    expect(d.requestWait.valueMs).toBe(40);
    expect(d.download.sources).toEqual(["responseStart", "responseEnd"]);
    expect(d.domContentLoaded.valueMs).toBe(180);
    expect(d.load.valueMs).toBe(200);
  });
  it.each([
    [-1, 5],
    [20, 10],
    [Number.NaN, 10],
    [2, Infinity],
  ])("does not invent a duration from invalid phase %s/%s", (a, b) => {
    expect(
      deriveNavigation({ ...raw().navigation, responseStart: a, responseEnd: b }).download,
    ).toMatchObject({ valueMs: null, status: "invalid-source" });
  });
  it("handles missing fields, absent TLS, and unfinished load explicitly", () => {
    const d = deriveNavigation({
      ...raw().navigation,
      startTime: 0,
      loadEventEnd: 0,
      secureConnectionStart: 0,
      connectEnd: 30,
    });
    expect(d.tls.status).toBe("not-applicable");
    expect(d.load.status).toBe("unavailable");
    expect(deriveNavigation(null).dns.valueMs).toBeNull();
  });
  it("rejects negative raw timestamps, unrelated fields, contradictory counts and windows", () => {
    const p = finalize();
    for (const change of [
      { observationWindow: { ...p.observationWindow, startTime: 1001 } },
      { observed: { ...p.observed, resources: 1 } },
      { navigation: { ...p.navigation, responseStart: -1 } },
      { storage: {} },
      { metrics: { ...p.metrics, lcp: { value: 0, status: "unsupported" } } },
    ])
      expect(BrowserPerformanceEvidenceSchema.safeParse({ ...p, ...change }).success).toBe(false);
  });
  it("retains only numeric LCP/FCP metadata and identifies finite unfinalized metrics", () => {
    const r = raw();
    r.paints = [{ name: "first-contentful-paint", startTime: 30 }];
    r.observed.paints = 1;
    r.lcp = [{ startTime: 40, renderTime: 40, loadTime: 0, size: 200 }];
    r.observed.lcp = 1;
    const p = finalize(r);
    expect(p.metrics.fcp.value).toBe(30);
    expect(p.metrics.lcp.value).toBe(40);
    expect(p.metrics.finalized).toBe(false);
    expect(p.observationWindow).toMatchObject({
      finite: true,
      plannedPostLoadMs: 300,
      scope: "top-level-document",
    });
    expect(
      BrowserPerformanceEvidenceSchema.safeParse({
        ...p,
        lcp: [{ ...p.lcp[0], element: "private" }],
      }).success,
    ).toBe(false);
  });
  it("uses CLS maximum session windows and excludes recent user input", () => {
    const entries = [
      { startTime: 0, value: 0.1, hadRecentInput: false },
      { startTime: 500, value: 3, hadRecentInput: true },
      { startTime: 900, value: 0.2, hadRecentInput: false },
      { startTime: 1900, value: 0.4, hadRecentInput: false },
    ];
    expect(deriveCLS(entries, true, 0)).toMatchObject({
      value: 0.4,
      excludedRecentInput: 1,
      provenance: "DERIVED",
    });
    const continuous = Array.from({ length: 7 }, (_, i) => ({
      startTime: i * 900,
      value: 0.1,
      hadRecentInput: false,
    }));
    expect(deriveCLS(continuous, true, 0).value).toBeCloseTo(0.6);
    expect(deriveCLS([], true, 0).value).toBe(0); // Supported window with no shifts, not missing data.
    expect(deriveCLS(entries, true, 1)).toMatchObject({ value: null, status: "insufficient-data" });
    expect(deriveCLS([], false, 0).value).toBeNull();
  });
  it("sanitizes resource credentials/query/fragment/path secrets before persistence", () => {
    const r = raw();
    r.resources = [
      resource(
        "http://user:DISPOSABLE_NOT_A_SECRET@entry.crossexam-fixture.com/token/DISPOSABLE_NOT_A_SECRET?key=DISPOSABLE_NOT_A_SECRET#secret",
      ),
      resource("data:private"),
    ];
    r.observed.resources = 2;
    const p = finalize(r);
    expect(JSON.stringify(p)).not.toContain("DISPOSABLE_NOT_A_SECRET");
    expect(p.resources[1]?.url).toBeNull();
    expect(p.truncation.omittedUrls).toBe(1);
    for (const extra of [
      { headers: { cookie: "private" } },
      { body: "private" },
      { attribution: "private" },
    ])
      expect(
        BrowserPerformanceEvidenceSchema.safeParse({
          ...p,
          resources: [{ ...p.resources[0], ...extra }],
        }).success,
      ).toBe(false);
  });
  it("distinguishes delivered totals and retained subsets, including zero and unavailable sizes", () => {
    const r = raw();
    r.resources = [resource(), { ...resource(), transferSize: 0, decodedBodySize: null }];
    r.observed.resources = 3;
    r.deliveredTotals.transferBytes = 500;
    r.deliveredTotals.decodedBytes = 1000;
    const p = finalize(r);
    expect(p.aggregates.retainedTransferBytes).toBe(100);
    expect(p.aggregates.retainedDecodedBytes).toBe(160);
    expect(p.deliveredTotals.transferBytes).toBe(500);
    expect(p.truncation.dropped.resources).toBe(1);
    expect(p.aggregates.slowestRetained).toEqual([0, 1]);
    expect(finalize().aggregates.retainedTransferBytes).toBeNull();
  });
  it("enforces 8KiB performance and unchanged 32KiB combined ceilings with deterministic loss", () => {
    const r = raw();
    r.resources = Array.from({ length: L.resources }, (_, i) =>
      resource(`http://entry.crossexam-fixture.com/${"a/".repeat(400)}${i}`),
    );
    r.observed.resources = L.resources;
    const p = finalize(r);
    expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(L.payloadBytes);
    expect(p.truncation.resultSize).toBe(true);
    expect(p.truncation.dropped.resources).toBeGreaterThan(0);
    expect(finalize(r)).toEqual(p);
    const c = emptyBrowserCollection("rich");
    c.performance = p;
    for (let id = 0; id < 64; id++)
      c.requests.push({
        id,
        url: `http://entry.crossexam-fixture.com/${"a/".repeat(400)}`,
        method: "GET",
        resourceType: "fetch",
        outcome: "finished",
        failure: null,
        redirectedFrom: null,
      });
    const finalized = finalizeBrowserCollection(c);
    expect(Buffer.byteLength(JSON.stringify(finalized))).toBeLessThanOrEqual(32768);
    expect(finalized.truncation.resultSize).toBe(true);
    expect(BrowserEvidenceCollectionSchema.safeParse(finalized).success).toBe(true);
  });
  it("keeps browser LAB raw and derived records separate from HTTP evidence", () => {
    const c = emptyBrowserCollection("rich");
    c.performance = finalize();
    const records = browserEvidenceRecords(c, "owned-scan", "owned-collection");
    expect(records.find((r) => r.code === "BROWSER_PERFORMANCE")?.provenance).toBe("OBSERVED");
    const derived = records.find((r) => r.code === "BROWSER_RUNTIME_ANALYSIS");
    expect(derived?.provenance).toBe("DERIVED");
    expect(records.every((r) => r.source === "fixture")).toBe(true);
    expect(browserRuntimeAnalysis(c).performanceAvailable).toBe(true);
    c.truncation.dropped.console = 1;
    expect(browserRuntimeAnalysis(c).eventCountsMayBeIncomplete).toBe(true);
  });
});

describe("bounded in-page PerformanceObservers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  function setup(supported = [...PERFORMANCE_TYPES] as string[]) {
    const callbacks = new Map<string, (entries: PerformanceEntry[]) => void>();
    const pending = new Map<string, PerformanceEntry[]>();
    const disconnect = vi.fn();
    class Observer {
      static supportedEntryTypes = supported;
      constructor(private callback: (list: { getEntries(): PerformanceEntry[] }) => void) {}
      type = "";
      observe({ type }: { type: string; buffered: boolean }) {
        this.type = type;
        callbacks.set(type, (entries) => this.callback({ getEntries: () => entries }));
      }
      takeRecords() {
        return pending.get(this.type) ?? [];
      }
      disconnect = disconnect;
    }
    const perf = {
      now: () => 1000,
      timeOrigin: 10000,
      getEntriesByType: () => [],
      setResourceTimingBufferSize: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const windowObject: Record<string, unknown> = { performance: perf };
    windowObject.top = windowObject;
    vi.stubGlobal("window", windowObject);
    vi.stubGlobal("PerformanceObserver", Observer);
    vi.stubGlobal("document", { visibilityState: "visible" });
    performanceObserverInit({
      limits: L,
      navigationFields: NAVIGATION_TIMING_FIELDS,
      types: PERFORMANCE_TYPES,
      initiators: RESOURCE_INITIATORS,
      postLoadMs: 300,
    });
    return {
      callbacks,
      pending,
      disconnect,
      perf,
      read: () => (windowObject.__crossExamLabRead as () => RawBrowserPerformance)(),
    };
  }
  it("registers buffered observers before page code and drains queued records before disconnect", () => {
    const s = setup();
    s.pending.set("paint", [{ name: "first-contentful-paint", startTime: 20 } as PerformanceEntry]);
    const r = s.read();
    expect(r.paints).toHaveLength(1);
    expect(s.disconnect).toHaveBeenCalledTimes(5);
    expect(s.perf.setResourceTimingBufferSize).toHaveBeenCalledWith(64);
  });
  it("bounds resources/tasks/paint/candidates/shifts and maintains delivered aggregates", () => {
    const s = setup();
    const forbidden = () => {
      throw new Error("Sensitive getter accessed");
    };
    const entries = Array.from({ length: 40 }, (_, i) => ({
      name: "http://entry.crossexam-fixture.com/?token=DISPOSABLE_NOT_A_SECRET",
      startTime: i,
      duration: 60,
      responseStart: 1,
      responseEnd: 2,
      transferSize: 100,
      decodedBodySize: 200,
      encodedBodySize: 100,
      initiatorType: "fetch",
      nextHopProtocol: "http/1.1",
      renderTime: i,
      loadTime: 0,
      size: 300,
      value: 0.01,
      hadRecentInput: false,
      get element() {
        return forbidden();
      },
      get attribution() {
        return forbidden();
      },
    }));
    for (const type of ["resource", "longtask", "largest-contentful-paint", "layout-shift"])
      s.callbacks.get(type)?.(entries as unknown as PerformanceEntry[]);
    const r = s.read();
    expect(r.resources).toHaveLength(16);
    expect(r.longTasks).toHaveLength(16);
    expect(r.layoutShifts).toHaveLength(16);
    expect(r.lcp).toHaveLength(8);
    expect(r.lcp.at(-1)?.startTime).toBe(39);
    expect(r.deliveredTotals).toMatchObject({
      transferBytes: 4000,
      decodedBytes: 8000,
      longTaskDuration: 2400,
      maximumLongTaskDuration: 60,
    });
    const p = finalize(r);
    expect(p.truncation.dropped.longTasks).toBe(24);
    expect(p.metrics.cls.status).toBe("insufficient-data");
    expect(JSON.stringify(p)).not.toContain("DISPOSABLE_NOT_A_SECRET");
  });
  it("does not turn unsupported long tasks into measured zero", () => {
    const p = finalize(setup([]).read());
    expect(p.deliveredTotals.longTaskDuration).toBeNull();
    expect(p.metrics.fcp.status).toBe("unsupported");
    expect(p.metrics.cls.value).toBeNull();
  });
});
