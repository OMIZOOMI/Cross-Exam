import {
  type BrowserEvidenceCollection,
  type BrowserPerformanceEvidence,
  BrowserPerformanceEvidenceSchema,
  BROWSER_PERFORMANCE_LIMITS as L,
  NAVIGATION_DERIVATIONS,
  type NavigationTiming,
  type RawBrowserPerformance,
  RawBrowserPerformanceSchema,
} from "@crossexam/contracts";
import { safeObservedUrl } from "./safety";

/** Missing, unfinished and reversed phases never become invented zero durations. */
export function deriveNavigation(
  n: NavigationTiming | null,
): BrowserPerformanceEvidence["derivedNavigation"] {
  const result = { provenance: "DERIVED" } as BrowserPerformanceEvidence["derivedNavigation"];
  for (const [key, sources] of Object.entries(NAVIGATION_DERIVATIONS)) {
    const a = n?.[sources[0]] ?? null;
    const b = n?.[sources[1]] ?? null;
    let status: "available" | "unavailable" | "invalid-source" | "not-applicable" = "available";
    if (a === null || b === null) status = "unavailable";
    else if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < a)
      status = "invalid-source";
    else if (key === "tls" && a === 0) status = "not-applicable";
    else if (["domInteractive", "domContentLoaded", "load"].includes(key) && b === 0)
      status = "unavailable";
    result[key as keyof typeof NAVIGATION_DERIVATIONS] = {
      sources: [...sources],
      status,
      valueMs: status === "available" && a !== null && b !== null ? b - a : null,
    };
  }
  return result;
}

/** Modern CLS maximum session window: consecutive gaps <1s, window span <5s. */
export function deriveCLS(
  entries: RawBrowserPerformance["layoutShifts"],
  supported: boolean,
  dropped: number,
): BrowserPerformanceEvidence["metrics"]["cls"] {
  let maximum = 0;
  let sum = 0;
  let first = 0;
  let previous = -Infinity;
  let excluded = 0;
  for (const entry of [...entries].sort((a, b) => a.startTime - b.startTime)) {
    if (entry.hadRecentInput) {
      excluded++;
      continue;
    }
    if (entry.startTime - previous < 1000 && entry.startTime - first < 5000) sum += entry.value;
    else {
      first = entry.startTime;
      sum = entry.value;
    }
    previous = entry.startTime;
    maximum = Math.max(maximum, sum);
  }
  return {
    provenance: "DERIVED",
    method: "maximum-session-window-1s-gap-5s-span-v1",
    excludedRecentInput: excluded,
    status: !supported ? "unsupported" : dropped ? "insufficient-data" : "available",
    value: !supported || dropped ? null : maximum,
  };
}

function sumKnown(
  entries: RawBrowserPerformance["resources"],
  key: "transferSize" | "decodedBodySize",
): number | null {
  const values = entries
    .map((entry) => entry[key])
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}
function updateDerived(p: BrowserPerformanceEvidence) {
  p.metrics.cls = deriveCLS(
    p.layoutShifts,
    !!p.supported["layout-shift"],
    p.truncation.dropped.layoutShifts,
  );
  const fcp = p.paints.find((entry) => entry.name === "first-contentful-paint");
  p.metrics.fcp = {
    value: fcp?.startTime ?? null,
    status: !p.supported.paint ? "unsupported" : fcp ? "available" : "not-observed",
  };
  const lcp = p.lcp.at(-1);
  p.metrics.lcp = {
    value: lcp?.startTime ?? null,
    status: !p.supported["largest-contentful-paint"]
      ? "unsupported"
      : lcp
        ? "available"
        : "not-observed",
  };
  p.aggregates = {
    provenance: "DERIVED",
    deliveredEntryTotalsOnly: true,
    retainedTransferBytes: sumKnown(p.resources, "transferSize"),
    retainedDecodedBytes: sumKnown(p.resources, "decodedBodySize"),
    slowestRetained: p.resources
      .map((_, i) => i)
      .sort((a, b) => (p.resources[b]?.duration ?? 0) - (p.resources[a]?.duration ?? 0) || a - b)
      .slice(0, 3),
    largestRetained: p.resources
      .map((_, i) => i)
      .filter((i) => p.resources[i]?.decodedBodySize != null)
      .sort(
        (a, b) =>
          (p.resources[b]?.decodedBodySize ?? 0) - (p.resources[a]?.decodedBodySize ?? 0) || a - b,
      )
      .slice(0, 3),
  };
}

/** Apply existing URL privacy policy before validation/IPC persistence, then bound bytes. */
export function finalizePerformance(
  rawInput: RawBrowserPerformance,
  retention: BrowserEvidenceCollection["truncation"],
): BrowserPerformanceEvidence {
  const before = retention.omittedUrls;
  const sanitized = {
    ...rawInput,
    resources: rawInput.resources.map((entry) => ({
      ...entry,
      url: entry.url === null ? null : safeObservedUrl(entry.url, retention),
    })),
  };
  const raw = RawBrowserPerformanceSchema.parse(sanitized);
  const p: BrowserPerformanceEvidence = {
    ...raw,
    schemaVersion: 1,
    collector: "chromium-lab-v1",
    measurementKind: "LAB",
    provenance: "OBSERVED",
    derivedNavigation: deriveNavigation(raw.navigation),
    metrics: {
      fcp: { value: null, status: "not-observed" },
      lcp: { value: null, status: "not-observed" },
      cls: deriveCLS(
        raw.layoutShifts,
        !!raw.supported["layout-shift"],
        raw.observed.layoutShifts - raw.layoutShifts.length,
      ),
      inp: { status: "not-measured", reason: "no-interaction-protocol" },
      finalized: false,
    },
    aggregates: {
      provenance: "DERIVED",
      retainedTransferBytes: null,
      retainedDecodedBytes: null,
      slowestRetained: [],
      largestRetained: [],
      deliveredEntryTotalsOnly: true,
    },
    truncation: {
      dropped: {
        paints: raw.observed.paints - raw.paints.length,
        lcp: raw.observed.lcp - raw.lcp.length,
        layoutShifts: raw.observed.layoutShifts - raw.layoutShifts.length,
        resources: raw.observed.resources - raw.resources.length,
        longTasks: raw.observed.longTasks - raw.longTasks.length,
      },
      resultSize: false,
      omittedUrls: retention.omittedUrls - before,
    },
  };
  updateDerived(p);
  for (const key of ["resources", "longTasks", "layoutShifts", "lcp", "paints"] as const) {
    while (
      new TextEncoder().encode(JSON.stringify(p)).byteLength > L.payloadBytes &&
      p[key].length
    ) {
      // Preserve the most recent LCP candidate; other dimensions evict deterministic tails.
      if (key === "lcp") p.lcp.shift();
      else p[key].pop();
      p.truncation.dropped[key]++;
      p.truncation.resultSize = true;
      updateDerived(p);
    }
  }
  return BrowserPerformanceEvidenceSchema.parse(p);
}

/** Facts about this retained finite window; counts are lower bounds if Stage 11 evicted events. */
export function browserRuntimeAnalysis(c: BrowserEvidenceCollection) {
  return {
    version: 1,
    provenance: "DERIVED" as const,
    measurementKind: "LAB" as const,
    consoleErrorsRetained: c.console.filter((entry) => entry.level === "error").length,
    pageErrorsRetained: c.pageErrors.length,
    failedRequestsRetained: c.requests.filter((entry) => entry.outcome === "failed").length,
    eventCountsMayBeIncomplete:
      (c.truncation.dropped.console ?? 0) > 0 ||
      (c.truncation.dropped.pageErrors ?? 0) > 0 ||
      (c.truncation.dropped.requests ?? 0) > 0,
    longTasksDelivered: c.performance?.supported.longtask ? c.performance.observed.longTasks : null,
    performanceAvailable: c.performance != null,
  };
}
