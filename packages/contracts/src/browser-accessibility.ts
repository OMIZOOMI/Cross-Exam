import { z } from "zod";

export const ACCESSIBILITY_ENGINE_VERSION = "4.12.1";
export const BROWSER_ACCESSIBILITY_LIMITS = Object.freeze({
  violationRules: 12,
  incompleteRules: 8,
  nodesPerRule: 3,
  summaryRules: 128,
  tags: 16,
  tagBuckets: 32,
  locatorDepth: 10,
  locatorLength: 256,
  elements: 10000,
  analysisMs: 2500,
  payloadBytes: 8 * 1024,
});
// Only built-in names: custom-element names, IDs and classes are page data.
export const ACCESSIBILITY_LOCATOR_TAGS = [
  "html",
  "head",
  "body",
  "title",
  "meta",
  "link",
  "style",
  "script",
  "main",
  "header",
  "footer",
  "nav",
  "section",
  "article",
  "aside",
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "optgroup",
  "form",
  "label",
  "fieldset",
  "legend",
  "img",
  "picture",
  "source",
  "svg",
  "path",
  "g",
  "circle",
  "rect",
  "text",
  "canvas",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "col",
  "colgroup",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "br",
  "hr",
  "strong",
  "em",
  "b",
  "i",
  "small",
  "pre",
  "code",
  "blockquote",
  "figure",
  "figcaption",
  "details",
  "summary",
  "dialog",
  "iframe",
  "video",
  "audio",
  "track",
  "progress",
  "meter",
  "output",
  "object",
  "embed",
  "noscript",
  "template",
  "slot",
] as const;
export const ACCESSIBILITY_IMPACTS = [
  "minor",
  "moderate",
  "serious",
  "critical",
  "unknown",
] as const;
const L = BROWSER_ACCESSIBILITY_LIMITS;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9.-]*$/);
const locatorPattern = new RegExp(
  `^(?:${ACCESSIBILITY_LOCATOR_TAGS.join("|")}):nth-of-type\\([1-9][0-9]{0,4}\\)(?:>(?:(?:shadow>)?(?:${ACCESSIBILITY_LOCATOR_TAGS.join("|")}):nth-of-type\\([1-9][0-9]{0,4}\\)))*$`,
);
export const AccessibilityNodeLocatorSchema = z
  .object({
    index: count.max(L.elements).nullable(),
    tag: z.enum(ACCESSIBILITY_LOCATOR_TAGS).nullable(),
    path: z.string().max(L.locatorLength).regex(locatorPattern).nullable(),
    truncated: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.path && value.path.split(">").filter((s) => s !== "shadow").length > L.locatorDepth)
      ctx.addIssue({ code: "custom", message: "Locator depth exceeded" });
  });
export type AccessibilityNodeLocator = z.infer<typeof AccessibilityNodeLocatorSchema>;
const rule = z
  .object({
    id: identifier,
    impact: z.enum(ACCESSIBILITY_IMPACTS),
    tags: z.array(identifier).max(L.tags),
    affectedNodes: count,
    nodes: z.array(AccessibilityNodeLocatorSchema).max(L.nodesPerRule),
    droppedNodes: count,
  })
  .strict();
const summary = z
  .object({
    count,
    ruleIds: z.array(identifier).max(L.summaryRules),
    droppedRuleIds: count,
  })
  .strict();
export const BrowserAccessibilityEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    collector: z.literal("rendered-axe-v1"),
    engine: z.literal("axe-core"),
    engineVersion: z.literal(ACCESSIBILITY_ENGINE_VERSION),
    analysisMode: z.literal("axe-default-rules-v1"),
    scope: z.literal("top-document-and-open-shadow-roots"),
    standardContext: z.literal("engine-provided-rule-tags; no-conformance-verdict"),
    status: z.enum([
      "completed",
      "unsupported",
      "execution-failed",
      "timeout",
      "cancelled",
      "dom-limit",
    ]),
    collectedAt: z.string().datetime(),
    durationMs: z.number().finite().nonnegative(),
    observation: z
      .object({
        provenance: z.literal("OBSERVED"),
        snapshotTimeMs: z.number().finite().nonnegative(),
        elements: count.max(L.elements),
        openShadowRoots: count,
        excludedFrames: count,
        languagePresent: z.boolean(),
        titlePresent: z.boolean(),
      })
      .strict()
      .nullable(),
    ruleResults: z
      .object({
        provenance: z.literal("DERIVED"),
        violations: z.array(rule).max(L.violationRules),
        incomplete: z.array(rule).max(L.incompleteRules),
        passes: summary,
        inapplicable: summary,
        aggregates: z
          .object({
            violationRules: count,
            violationNodes: count,
            incompleteRules: count,
            incompleteNodes: count,
            violationImpactCounts: z
              .object(Object.fromEntries(ACCESSIBILITY_IMPACTS.map((k) => [k, count])))
              .strict(),
            violationTagCounts: z
              .array(z.object({ tag: identifier, rules: count }).strict())
              .max(L.tagBuckets),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    truncation: z
      .object({
        violationRules: count,
        incompleteRules: count,
        violationNodes: count,
        incompleteNodes: count,
        tags: count,
        tagBuckets: count,
        locators: count,
        payload: z.boolean(),
      })
      .strict(),
    limitations: z.tuple([
      z.literal("automated-rules-are-not-a-human-accessibility-verdict"),
      z.literal("finite-rendered-snapshot; page-can-change-during-analysis"),
      z.literal("iframes-and-closed-shadow-roots-excluded"),
      z.literal("structural-locators-are-snapshot-local-and-may-be-partial"),
      z.literal("controlled-main-world; hostile-page-tampering-not-addressed"),
    ]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > L.payloadBytes)
      issue("Accessibility payload exceeded");
    if (
      (value.status === "completed") !==
      (value.observation !== null && value.ruleResults !== null)
    )
      issue("Completed results required; failures must not masquerade as zero violations");
    if (value.status !== "completed" && (value.observation || value.ruleResults))
      issue("Failed analysis has no rule verdict");
    if (value.ruleResults) {
      const r = value.ruleResults;
      for (const [rules, total, dropped] of [
        [r.violations, r.aggregates.violationRules, value.truncation.violationRules],
        [r.incomplete, r.aggregates.incompleteRules, value.truncation.incompleteRules],
      ] as const) {
        if (rules.length + dropped !== total) issue("Rule retention accounting mismatch");
        for (const entry of rules)
          if (entry.nodes.length + entry.droppedNodes !== entry.affectedNodes)
            issue("Node retention accounting mismatch");
      }
      for (const s of [r.passes, r.inapplicable])
        if (s.ruleIds.length + s.droppedRuleIds !== s.count) issue("Summary accounting mismatch");
      if (
        r.violations.reduce((sum, entry) => sum + entry.nodes.length, 0) +
          value.truncation.violationNodes !==
        r.aggregates.violationNodes
      )
        issue("Violation node accounting mismatch");
      if (
        r.incomplete.reduce((sum, entry) => sum + entry.nodes.length, 0) +
          value.truncation.incompleteNodes !==
        r.aggregates.incompleteNodes
      )
        issue("Incomplete node accounting mismatch");
    }
  });
export type BrowserAccessibilityEvidence = z.infer<typeof BrowserAccessibilityEvidenceSchema>;
