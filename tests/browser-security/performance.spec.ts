import { expect, test } from "@playwright/test";
import { collectFixtureBrowserEvidence } from "../../apps/browser-worker/src/browser-collector";
import {
  BrowserEvidenceCollectionSchema,
  BrowserPerformanceEvidenceSchema,
  BROWSER_PERFORMANCE_LIMITS as L,
} from "../../packages/contracts/src/index";
import type { EgressProxy } from "../../packages/engine/src/browser-egress/types";
import { startOwnedCollectorProxy } from "./collector-proxy";

let proxy: EgressProxy;
let paths: string[];
test.beforeEach(async () => {
  paths = [];
  proxy = await startOwnedCollectorProxy(paths);
});
test.afterEach(async () => {
  await proxy.close();
});
const collect = (
  fixture: Parameters<typeof collectFixtureBrowserEvidence>[0]["fixture"],
  options = {},
) =>
  collectFixtureBrowserEvidence({ fixture, proxyServer: proxy.url, timeoutMs: 10000, ...options });

test("observes real LAB navigation, buffered paints/LCP/CLS, resources and long tasks in a finite window", async () => {
  const c = await collect("rich");
  expect(c.outcome).toBe("completed");
  expect(BrowserEvidenceCollectionSchema.safeParse(c).success).toBe(true);
  const p = BrowserPerformanceEvidenceSchema.parse(c.performance);
  expect(p.measurementKind).toBe("LAB");
  expect(p.navigation?.responseStart).toBeGreaterThanOrEqual(
    p.navigation?.requestStart ?? Infinity,
  );
  expect(p.navigation?.loadEventEnd).toBeGreaterThanOrEqual(
    p.navigation?.domContentLoadedEventEnd ?? Infinity,
  );
  expect(p.derivedNavigation.requestWait.valueMs).toBeGreaterThan(60);
  expect(p.derivedNavigation.requestWait.valueMs).toBeLessThan(5000);
  expect(p.metrics.fcp.status).toBe("available");
  expect(p.metrics.fcp.value).toBeGreaterThan(0);
  expect(p.metrics.lcp.status).toBe("available");
  expect(p.metrics.lcp.value).toBeGreaterThanOrEqual(p.metrics.fcp.value ?? Infinity);
  expect(p.lcp.length).toBeGreaterThanOrEqual(2);
  expect(p.metrics.cls.status).toBe("available");
  expect(p.metrics.cls.value).toBeGreaterThan(0);
  expect(p.metrics.cls.value).toBeLessThan(1);
  expect(p.observed.longTasks).toBeGreaterThan(0);
  expect(p.deliveredTotals.maximumLongTaskDuration).toBeGreaterThanOrEqual(80);
  expect(p.deliveredTotals.maximumLongTaskDuration).toBeLessThan(5000);
  expect(p.metrics.finalized).toBe(false);
  expect(p.metrics.inp.status).toBe("not-measured");
  expect(p.observationWindow.endTime).toBeGreaterThan(p.observationWindow.startTime);
  expect(p.observationWindow.plannedPostLoadMs).toBe(300);
  const css = p.resources.find((r) => r.url?.endsWith("/collector/style.css"));
  expect(css?.duration).toBeGreaterThan(25);
  expect(
    p.resources.some((r) => r.url?.endsWith("/collector/xhr") && (r.decodedBodySize ?? 0) > 100000),
  ).toBe(true);
  expect(p.deliveredTotals.decodedBytes).toBeGreaterThan(100000);
  expect(p.aggregates.largestRetained.length).toBeGreaterThan(0);
  expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(L.payloadBytes);
});

test("bounds real resource volume and keeps delivered totals separate from the retained subset", async () => {
  const c = await collect("bounds");
  const p = BrowserPerformanceEvidenceSchema.parse(c.performance);
  expect(p.observed.resources).toBeGreaterThan(L.resources);
  expect(p.resources.length).toBeLessThanOrEqual(L.resources);
  expect(p.truncation.dropped.resources).toBe(p.observed.resources - p.resources.length);
  expect(p.deliveredTotals.decodedBytes).toBeGreaterThan(
    p.aggregates.retainedDecodedBytes ?? Infinity,
  );
  expect(Buffer.byteLength(JSON.stringify(c))).toBeLessThanOrEqual(32768);
  expect(c.truncation.resultSize).toBe(true);
});

test("represents an empty rendered document without invented paints or INP", async () => {
  const c = await collect("empty");
  const p = BrowserPerformanceEvidenceSchema.parse(c.performance);
  expect(p.navigation).not.toBeNull();
  expect(p.metrics.fcp).toEqual({ value: null, status: "not-observed" });
  expect(p.metrics.lcp).toEqual({ value: null, status: "not-observed" });
  expect(p.metrics.cls.value).toBe(0);
  expect(p.metrics.inp.status).toBe("not-measured");
  expect(p.resources).toEqual([]);
  expect(p.deliveredTotals.transferBytes).toBeNull();
});

test("performance collection preserves redaction and private/mixed-DNS/POST/websocket enforcement", async () => {
  const c = await collect("rich");
  expect(JSON.stringify(c)).not.toContain("DISPOSABLE_NOT_A_SECRET");
  expect(
    c.requests.some((r) => r.url?.includes("private.crossexam-fixture") && r.outcome === "failed"),
  ).toBe(true);
  expect(
    c.requests.some((r) => r.url?.includes("mixed.crossexam-fixture") && r.outcome === "failed"),
  ).toBe(true);
  expect(c.requests.some((r) => r.method === "POST" && r.outcome === "failed")).toBe(true);
  expect(paths).not.toContain("/collector/action");
  expect(paths).not.toContain("/collector/socket");
  for (const r of c.performance?.resources ?? []) {
    if (r.url) {
      expect(new URL(r.url).search).toBe("");
      expect(new URL(r.url).hash).toBe("");
    }
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(["body", "headers", "attribution"]));
  }
});

test("deadline and cancellation close existing workers without partial metrics masquerading as complete", async () => {
  const timed = await collect("slow", { timeoutMs: 1200 });
  expect(timed.outcome).toBe("timeout");
  expect(timed.performance).toBeNull();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 700);
  let cancelled: Awaited<ReturnType<typeof collect>>;
  try {
    cancelled = await collect("slow", { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  expect(cancelled.outcome).toBe("cancelled");
  expect(cancelled.performance).toBeNull();
  expect(paths).not.toContain("/collector/late");
});

test("proxy outage still fails without a direct fallback or invented metrics", async () => {
  await proxy.close();
  const c = await collect("rich", { timeoutMs: 1500 });
  expect(c.outcome).not.toBe("completed");
  expect(c.performance).toBeNull();
  expect(paths).toEqual([]);
});
