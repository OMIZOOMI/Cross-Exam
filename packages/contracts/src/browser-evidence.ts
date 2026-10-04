import { z } from "zod";
import { BrowserPerformanceEvidenceSchema } from "./browser-performance";

/** Retention bounds, not permission to send traffic. The worker/proxy enforce traffic limits. */
export const BROWSER_EVIDENCE_LIMITS = Object.freeze({
  requests: 64,
  responses: 32,
  console: 32,
  pageErrors: 16,
  redirects: 5,
  headings: 20,
  links: 40,
  forms: 10,
  resources: 40,
  inputTypes: 20,
  domElements: 10_000,
  text: 256,
  url: 1024,
  headerValue: 256,
  resultBytes: 32 * 1024,
  settleMs: 300,
});

export const BROWSER_SAFE_HEADERS = [
  "content-type",
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "x-frame-options",
  "cache-control",
  "server",
] as const;

const L = BROWSER_EVIDENCE_LIMITS;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().max(L.text);
// Observations only: this is privacy/schema validation, NEVER destination authorization.
const url = z
  .string()
  .max(L.url)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password &&
        !parsed.search &&
        !parsed.hash
      );
    } catch {
      return false;
    }
  });
const headers = z
  .object(
    Object.fromEntries(
      BROWSER_SAFE_HEADERS.map((name) => [name, z.string().max(L.headerValue).optional()]),
    ),
  )
  .strict();
const location = z.object({ url: url.nullable(), line: count, column: count }).strict();
const request = z
  .object({
    id: count,
    url: url.nullable(),
    method: z.enum(["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "OTHER"]),
    resourceType: text,
    outcome: z.enum(["observed", "finished", "failed"]),
    failure: text.nullable(),
    redirectedFrom: count.nullable(),
  })
  .strict();
const response = z
  .object({
    requestId: count,
    url: url.nullable(),
    status: z.number().int().min(100).max(599),
    resourceType: text,
    headers,
    contentType: text.nullable(),
  })
  .strict();
const dimensions = [
  "requests",
  "responses",
  "console",
  "pageErrors",
  "redirects",
  "headings",
  "links",
  "forms",
  "resources",
] as const;
export const BROWSER_TRUNCATION_DIMENSIONS = dimensions;
const dropped = z.object(Object.fromEntries(dimensions.map((name) => [name, count]))).strict();

export const BrowserEvidenceCollectionSchema = z
  .object({
    version: z.literal(1),
    collector: z.literal("chromium-runtime-v1"),
    source: z.literal("fixture"),
    scope: z.literal("controlled-fixture"),
    provenance: z.literal("OBSERVED"),
    startedAt: z.string().datetime(),
    collectedAt: z.string().datetime(),
    durationMs: count,
    target: url,
    outcome: z.enum([
      "completed",
      "navigation-failed",
      "timeout",
      "cancelled",
      "browser-closed",
      "launch-failed",
    ]),
    navigation: z
      .object({
        requestedUrl: url,
        finalUrl: url.nullable(),
        status: z.number().int().min(100).max(599).nullable(),
        headers,
        contentType: text.nullable(),
        outcome: z.enum(["not-started", "succeeded", "failed"]),
        failure: text.nullable(),
        wallClockDurationMs: count.nullable(),
        chain: z
          .array(z.object({ requestId: count, url: url.nullable() }).strict())
          .max(L.redirects + 1),
      })
      .strict(),
    console: z
      .array(z.object({ level: z.enum(["error", "warning"]), text, location }).strict())
      .max(L.console),
    pageErrors: z.array(z.object({ name: text, message: text }).strict()).max(L.pageErrors),
    requests: z.array(request).max(L.requests),
    responses: z.array(response).max(L.responses),
    dom: z
      .object({
        url: url.nullable(),
        title: text,
        description: text.nullable(),
        canonical: url.nullable(),
        headings: z
          .array(z.object({ level: z.number().int().min(1).max(6), text }).strict())
          .max(L.headings),
        forms: z
          .array(
            z
              .object({
                method: z.enum(["get", "post", "dialog", "other"]),
                action: url.nullable(),
                inputCount: count,
                inputTypes: z.array(z.object({ type: text, count }).strict()).max(L.inputTypes),
              })
              .strict(),
          )
          .max(L.forms),
        links: z.array(url.nullable()).max(L.links),
        resources: z
          .array(
            z
              .object({
                type: z.enum(["script", "stylesheet", "image", "font", "frame"]),
                url: url.nullable(),
              })
              .strict(),
          )
          .max(L.resources),
        counts: z
          .object({
            headings: count,
            forms: count,
            links: count,
            resources: count,
            inspectedElements: count.max(L.domElements),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    performance: BrowserPerformanceEvidenceSchema.nullable().optional(),
    truncation: z
      .object({
        dropped,
        shortenedStrings: count,
        redactedFields: count,
        omittedUrls: count,
        omittedHeaders: count,
        domInspectionLimit: z.boolean(),
        inputTypes: count,
        resultSize: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > L.resultBytes)
      ctx.addIssue({ code: "custom", message: "Browser evidence exceeds serialized byte limit" });
    const ids = new Set(value.requests.map((entry) => entry.id));
    if (ids.size !== value.requests.length)
      ctx.addIssue({ code: "custom", message: "Duplicate request identity" });
    // References may point to requests explicitly discarded by retention limits.
    if (
      !value.truncation.dropped.requests &&
      value.responses.some((entry) => !ids.has(entry.requestId))
    )
      ctx.addIssue({ code: "custom", message: "Response references an unobserved request" });
  });

export type BrowserEvidenceCollection = z.infer<typeof BrowserEvidenceCollectionSchema>;
