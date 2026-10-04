import {
  BROWSER_EVIDENCE_LIMITS,
  BROWSER_PERFORMANCE_LIMITS,
  NAVIGATION_TIMING_FIELDS,
  PERFORMANCE_TYPES,
  type RawBrowserPerformance,
  RESOURCE_INITIATORS,
} from "@crossexam/contracts";
import type { Page } from "@playwright/test";

type Config = {
  limits: typeof BROWSER_PERFORMANCE_LIMITS;
  navigationFields: readonly string[];
  types: readonly string[];
  initiators: readonly string[];
  postLoadMs: number;
};

/** Serialized by Playwright: all runtime helpers must live inside this function. */
export function performanceObserverInit(config: Config) {
  if (window !== window.top) return;
  const perf = window.performance;
  const now = perf.now.bind(perf);
  const getEntries = perf.getEntriesByType.bind(perf);
  const startTime = now();
  const numeric = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const supported: Record<string, boolean> = Object.fromEntries(
    config.types.map((key) => [key, false]),
  );
  const state: RawBrowserPerformance = {
    observationWindow: {
      startTime: 0,
      observerInstalledAt: startTime,
      endTime: startTime,
      timeOrigin: perf.timeOrigin,
      plannedPostLoadMs: 300,
      scope: "top-level-document",
      finite: true,
      visibility: "visible",
    },
    supported,
    navigation: null,
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
      resourceTypeCounts: Object.fromEntries(config.initiators.map((key) => [key, 0])),
      longTaskDuration: null,
      maximumLongTaskDuration: null,
    },
    resourceBufferFull: false,
  };
  const consume = (type: string, entries: PerformanceEntry[]) => {
    for (const entry of entries) {
      const e = entry as unknown as Record<string, unknown>;
      const start = numeric(e.startTime);
      if (start === null) continue;
      if (type === "paint") {
        if (e.name !== "first-paint" && e.name !== "first-contentful-paint") continue;
        state.observed.paints++;
        if (state.paints.length < config.limits.paints)
          state.paints.push({ name: e.name, startTime: start });
      } else if (type === "largest-contentful-paint") {
        state.observed.lcp++;
        if (state.lcp.length === config.limits.lcp) state.lcp.splice(config.limits.lcp - 1, 1);
        // Numeric candidate metadata only. Never read element, id, url, text, or values.
        state.lcp.push({
          startTime: start,
          renderTime: numeric(e.renderTime),
          loadTime: numeric(e.loadTime),
          size: numeric(e.size),
        });
      } else if (type === "layout-shift") {
        const value = numeric(e.value);
        if (value === null || typeof e.hadRecentInput !== "boolean") continue;
        state.observed.layoutShifts++;
        if (state.layoutShifts.length < config.limits.layoutShifts)
          state.layoutShifts.push({ startTime: start, value, hadRecentInput: e.hadRecentInput });
      } else if (type === "longtask") {
        const duration = numeric(e.duration);
        if (duration === null) continue;
        state.observed.longTasks++;
        state.deliveredTotals.longTaskDuration =
          (state.deliveredTotals.longTaskDuration ?? 0) + duration;
        state.deliveredTotals.maximumLongTaskDuration = Math.max(
          state.deliveredTotals.maximumLongTaskDuration ?? 0,
          duration,
        );
        if (state.longTasks.length < config.limits.longTasks)
          state.longTasks.push({ startTime: start, duration });
      } else if (type === "resource") {
        const duration = numeric(e.duration);
        if (duration === null) continue;
        state.observed.resources++;
        const initiatorType = config.initiators.includes(String(e.initiatorType))
          ? String(e.initiatorType)
          : "other";
        state.deliveredTotals.resourceTypeCounts[initiatorType] =
          (state.deliveredTotals.resourceTypeCounts[initiatorType] ?? 0) + 1;
        const transferSize = numeric(e.transferSize);
        const decodedBodySize = numeric(e.decodedBodySize);
        if (transferSize === null) state.deliveredTotals.unavailableTransferSizes++;
        else {
          state.deliveredTotals.transferBytes =
            (state.deliveredTotals.transferBytes ?? 0) + transferSize;
          if (transferSize === 0) state.deliveredTotals.zeroTransferSizes++;
        }
        if (decodedBodySize === null) state.deliveredTotals.unavailableDecodedSizes++;
        else
          state.deliveredTotals.decodedBytes =
            (state.deliveredTotals.decodedBytes ?? 0) + decodedBodySize;
        if (state.resources.length < config.limits.resources)
          state.resources.push({
            // Host-side existing sanitation runs before validation/persistence. IPC input bounded.
            url: typeof e.name === "string" ? e.name.slice(0, 4097) : null,
            initiatorType:
              initiatorType as RawBrowserPerformance["resources"][number]["initiatorType"],
            startTime: start,
            duration,
            responseStart: numeric(e.responseStart),
            responseEnd: numeric(e.responseEnd),
            transferSize,
            encodedBodySize: numeric(e.encodedBodySize),
            decodedBodySize,
            protocol:
              typeof e.nextHopProtocol !== "string" || !e.nextHopProtocol
                ? null
                : ["http/1.0", "http/1.1", "h2", "h3"].includes(e.nextHopProtocol)
                  ? (e.nextHopProtocol as "h2")
                  : "other",
          });
      }
    }
  };
  const observers: { type: string; observer: PerformanceObserver }[] = [];
  const advertised =
    typeof PerformanceObserver === "function" ? PerformanceObserver.supportedEntryTypes : [];
  for (const type of config.types) {
    if (type === "navigation") {
      supported.navigation = advertised.includes(type);
      continue;
    }
    if (!advertised.includes(type)) continue;
    try {
      const observer = new PerformanceObserver((list) => consume(type, list.getEntries()));
      observer.observe({ type, buffered: true });
      supported[type] = true;
      observers.push({ type, observer });
    } catch {
      supported[type] = false;
    }
  }
  const bufferFull = () => {
    state.resourceBufferFull = true;
  };
  perf.setResourceTimingBufferSize(config.limits.resourceBuffer);
  perf.addEventListener("resourcetimingbufferfull", bufferFull);
  Object.defineProperty(window, "__crossExamLabRead", {
    configurable: false,
    value: () => {
      for (const { type, observer } of observers) {
        consume(type, observer.takeRecords());
        observer.disconnect();
      }
      perf.removeEventListener("resourcetimingbufferfull", bufferFull);
      if (supported.longtask && state.deliveredTotals.longTaskDuration === null)
        state.deliveredTotals.longTaskDuration = 0;
      const nav = getEntries("navigation")[0] as unknown as Record<string, unknown> | undefined;
      if (nav) {
        supported.navigation = true;
        state.navigation = Object.fromEntries(
          config.navigationFields.map((key) => [key, numeric(nav[key])]),
        );
      }
      state.observationWindow.endTime = now();
      state.observationWindow.visibility =
        document.visibilityState === "hidden" ? "hidden" : "visible";
      state.observationWindow.plannedPostLoadMs = config.postLoadMs as 300;
      return state;
    },
  });
}

export async function installPerformanceObservers(page: Page) {
  await page.addInitScript(performanceObserverInit, {
    limits: BROWSER_PERFORMANCE_LIMITS,
    navigationFields: NAVIGATION_TIMING_FIELDS,
    types: PERFORMANCE_TYPES,
    initiators: RESOURCE_INITIATORS,
    postLoadMs: BROWSER_EVIDENCE_LIMITS.settleMs,
  });
}
export async function readPerformanceObservers(page: Page): Promise<RawBrowserPerformance | null> {
  return page.evaluate(() => {
    const read = (window as unknown as { __crossExamLabRead?: () => RawBrowserPerformance })
      .__crossExamLabRead;
    return typeof read === "function" ? read() : null;
  });
}
