import { z } from "zod";

/** Retention only; existing worker/proxy traffic and time limits remain authoritative. */
export const BROWSER_PERFORMANCE_LIMITS = Object.freeze({
  resources: 16,
  longTasks: 16,
  lcp: 8,
  layoutShifts: 16,
  paints: 2,
  payloadBytes: 8 * 1024,
  resourceBuffer: 64,
});
export const NAVIGATION_TIMING_FIELDS = [
  "startTime",
  "fetchStart",
  "domainLookupStart",
  "domainLookupEnd",
  "connectStart",
  "connectEnd",
  "secureConnectionStart",
  "requestStart",
  "responseStart",
  "responseEnd",
  "domInteractive",
  "domContentLoadedEventStart",
  "domContentLoadedEventEnd",
  "domComplete",
  "loadEventStart",
  "loadEventEnd",
  "transferSize",
  "encodedBodySize",
  "decodedBodySize",
  "redirectCount",
] as const;
export const RESOURCE_INITIATORS = [
  "script",
  "css",
  "img",
  "fetch",
  "xmlhttprequest",
  "link",
  "iframe",
  "other",
] as const;
export const PERFORMANCE_TYPES = [
  "navigation",
  "paint",
  "largest-contentful-paint",
  "layout-shift",
  "resource",
  "longtask",
] as const;
const L = BROWSER_PERFORMANCE_LIMITS;
const number = z.number().finite().nonnegative();
const count = number.int().max(Number.MAX_SAFE_INTEGER);
const nullable = number.nullable();
const url = z
  .string()
  .max(1024)
  .refine((value) => {
    try {
      const p = new URL(value);
      return (
        ["http:", "https:"].includes(p.protocol) &&
        !p.username &&
        !p.password &&
        !p.search &&
        !p.hash
      );
    } catch {
      return false;
    }
  })
  .nullable();
export const NavigationTimingSchema = z
  .object(Object.fromEntries(NAVIGATION_TIMING_FIELDS.map((key) => [key, nullable])))
  .strict();
export type NavigationTiming = z.infer<typeof NavigationTimingSchema>;
const timed = z.object({ startTime: number, duration: number }).strict();
const resource = z
  .object({
    url,
    initiatorType: z.enum(RESOURCE_INITIATORS),
    startTime: number,
    duration: number,
    responseStart: nullable,
    responseEnd: nullable,
    transferSize: nullable,
    encodedBodySize: nullable,
    decodedBodySize: nullable,
    protocol: z.enum(["http/1.0", "http/1.1", "h2", "h3", "other"]).nullable(),
  })
  .strict();
export const RawBrowserPerformanceSchema = z
  .object({
    observationWindow: z
      .object({
        startTime: number,
        observerInstalledAt: number,
        endTime: number,
        timeOrigin: number,
        plannedPostLoadMs: z.literal(300),
        scope: z.literal("top-level-document"),
        finite: z.literal(true),
        visibility: z.enum(["visible", "hidden"]),
      })
      .strict(),
    supported: z
      .object(Object.fromEntries(PERFORMANCE_TYPES.map((key) => [key, z.boolean()])))
      .strict(),
    navigation: NavigationTimingSchema.nullable(),
    paints: z
      .array(
        z
          .object({ name: z.enum(["first-paint", "first-contentful-paint"]), startTime: number })
          .strict(),
      )
      .max(L.paints),
    lcp: z
      .array(
        z
          .object({ startTime: number, renderTime: nullable, loadTime: nullable, size: nullable })
          .strict(),
      )
      .max(L.lcp),
    layoutShifts: z
      .array(z.object({ startTime: number, value: number, hadRecentInput: z.boolean() }).strict())
      .max(L.layoutShifts),
    resources: z.array(resource).max(L.resources),
    longTasks: z.array(timed).max(L.longTasks),
    observed: z
      .object({
        paints: count,
        lcp: count,
        layoutShifts: count,
        resources: count,
        longTasks: count,
      })
      .strict(),
    // Constant-memory arithmetic over all delivered entries, including evicted entries.
    deliveredTotals: z
      .object({
        provenance: z.literal("DERIVED"),
        transferBytes: nullable,
        decodedBytes: nullable,
        unavailableTransferSizes: count,
        unavailableDecodedSizes: count,
        zeroTransferSizes: count,
        resourceTypeCounts: z
          .object(Object.fromEntries(RESOURCE_INITIATORS.map((key) => [key, count])))
          .strict(),
        longTaskDuration: nullable,
        maximumLongTaskDuration: nullable,
      })
      .strict(),
    resourceBufferFull: z.boolean(),
  })
  .strict();
export type RawBrowserPerformance = z.infer<typeof RawBrowserPerformanceSchema>;
const metric = z
  .object({
    value: nullable,
    status: z.enum([
      "available",
      "not-observed",
      "unsupported",
      "insufficient-data",
      "invalid-source",
      "not-applicable",
    ]),
  })
  .strict();
const duration = z
  .object({
    valueMs: nullable,
    status: z.enum(["available", "unavailable", "invalid-source", "not-applicable"]),
    sources: z.tuple([z.enum(NAVIGATION_TIMING_FIELDS), z.enum(NAVIGATION_TIMING_FIELDS)]),
  })
  .strict();
export const NAVIGATION_DERIVATIONS = {
  dns: ["domainLookupStart", "domainLookupEnd"],
  connection: ["connectStart", "connectEnd"],
  tls: ["secureConnectionStart", "connectEnd"],
  requestWait: ["requestStart", "responseStart"],
  download: ["responseStart", "responseEnd"],
  domInteractive: ["startTime", "domInteractive"],
  domContentLoaded: ["startTime", "domContentLoadedEventEnd"],
  load: ["startTime", "loadEventEnd"],
} as const;
export const BrowserPerformanceEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    collector: z.literal("chromium-lab-v1"),
    measurementKind: z.literal("LAB"),
    provenance: z.literal("OBSERVED"),
    ...RawBrowserPerformanceSchema.shape,
    derivedNavigation: z
      .object({
        provenance: z.literal("DERIVED"),
        ...(Object.fromEntries(
          Object.keys(NAVIGATION_DERIVATIONS).map((key) => [key, duration]),
        ) as { [K in keyof typeof NAVIGATION_DERIVATIONS]: typeof duration }),
      })
      .strict(),
    metrics: z
      .object({
        fcp: metric,
        lcp: metric,
        cls: metric
          .extend({
            provenance: z.literal("DERIVED"),
            method: z.literal("maximum-session-window-1s-gap-5s-span-v1"),
            excludedRecentInput: count,
          })
          .strict(),
        inp: z
          .object({
            status: z.literal("not-measured"),
            reason: z.literal("no-interaction-protocol"),
          })
          .strict(),
        finalized: z.literal(false),
      })
      .strict(),
    aggregates: z
      .object({
        provenance: z.literal("DERIVED"),
        retainedTransferBytes: nullable,
        retainedDecodedBytes: nullable,
        slowestRetained: z.array(count).max(3),
        largestRetained: z.array(count).max(3),
        deliveredEntryTotalsOnly: z.literal(true),
      })
      .strict(),
    truncation: z
      .object({
        dropped: z
          .object({
            paints: count,
            lcp: count,
            layoutShifts: count,
            resources: count,
            longTasks: count,
          })
          .strict(),
        resultSize: z.boolean(),
        omittedUrls: count,
      })
      .strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new TextEncoder().encode(JSON.stringify(v)).byteLength > L.payloadBytes)
      issue("Performance payload exceeds byte ceiling");
    if (
      v.observationWindow.endTime < v.observationWindow.startTime ||
      v.observationWindow.observerInstalledAt > v.observationWindow.endTime
    )
      issue("Invalid observation window");
    for (const key of ["paints", "lcp", "layoutShifts", "resources", "longTasks"] as const) {
      if (v.observed[key] !== v[key].length + v.truncation.dropped[key])
        issue("Inconsistent retained entry count");
      if (v[key].some((e) => e.startTime > v.observationWindow.endTime))
        issue("Entry outside observation window");
    }
    for (const key of ["fcp", "lcp", "cls"] as const) {
      const m = v.metrics[key];
      if ((m.status === "available") !== (m.value !== null))
        issue("Unavailable metric must remain null");
    }
    for (const [key, sources] of Object.entries(NAVIGATION_DERIVATIONS)) {
      const d = v.derivedNavigation[key as keyof typeof NAVIGATION_DERIVATIONS];
      if (!d || d.sources.join() !== sources.join()) issue("Unexpected derivation sources");
      if (d && (d.status === "available") !== (d.valueMs !== null))
        issue("Unavailable duration must remain null");
    }
    if (
      [...v.aggregates.slowestRetained, ...v.aggregates.largestRetained].some(
        (i) => i >= v.resources.length,
      )
    )
      issue("Invalid retained resource reference");
  });
export type BrowserPerformanceEvidence = z.infer<typeof BrowserPerformanceEvidenceSchema>;
