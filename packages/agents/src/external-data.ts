import { type EvidenceDigest, ProviderRequestSchema } from "@crossexam/contracts";
import { labels } from "./evidence-digest";
import type { ProviderRequest } from "./provider";

export const EXPORT_POLICY = "external-numeric-presence-v1";
export const EXTERNAL_LIMITATIONS = Object.freeze([
  "Only supplied collected evidence is authorized.",
  "Numeric projection omits website content, URLs, headers and DOM details.",
  "Absence of a fact is not proof of absence or safety.",
  "Collection is bounded; LAB windows and automated accessibility checks are incomplete.",
  "No independent reproduction or causal conclusion is supplied.",
]);
// Explicit code-specific export policy. New internal digest facts do not expand export.
const facts: Record<EvidenceDigest["code"], readonly (keyof EvidenceDigest["facts"])[]> = {
  HTTP_STATUS: ["statusCode", "responseBytes", "durationMs", "redirectCount"],
  DOCUMENT_METADATA: ["titlePresent", "descriptionPresent", "languagePresent"],
  DOCUMENT_STRUCTURE: [
    "images",
    "imagesWithoutAlt",
    "scripts",
    "stylesheets",
    "forms",
    "internalLinkCount",
    "externalLinkCount",
  ],
  RESPONSE_HEADERS: ["contentSecurityPolicyPresent", "hstsPresent", "nosniffPresent"],
  RESOURCE_REFERENCES: ["mixedContentCount"],
  ROBOTS_TXT: ["exists", "statusCode", "responseBytes", "truncated"],
  SITEMAP_XML: ["exists", "statusCode", "responseBytes", "truncated"],
  FETCH_FAILURE: [],
  BROWSER_NAVIGATION: ["statusCode", "durationMs", "redirectCount"],
  BROWSER_CONSOLE: ["events", "errors", "warnings"],
  BROWSER_PAGE_ERRORS: ["observed"],
  BROWSER_REQUESTS: ["observed", "failed"],
  BROWSER_RESPONSES: ["observed"],
  BROWSER_RENDERED_DOM: [
    "titlePresent",
    "descriptionPresent",
    "forms",
    "internalLinkCount",
    "resources",
  ],
  BROWSER_PERFORMANCE: ["fcpMs", "lcpMs", "cls", "resources", "longTasks"],
  BROWSER_RUNTIME_ANALYSIS: ["cls"],
  BROWSER_ACCESSIBILITY_OBSERVATION: ["languagePresent", "titlePresent"],
  BROWSER_ACCESSIBILITY_RULES: [
    "violationRules",
    "violationNodes",
    "incompleteRules",
    "incompleteNodes",
    "passes",
    "inapplicable",
  ],
};

export const externalExportDescriptor = Object.freeze({
  policy: EXPORT_POLICY,
  evidenceKeys: [
    "id",
    "kind",
    "code",
    "provenance",
    "collector",
    "location",
    "title",
    "detail",
    "facts",
    "completeness",
  ],
  claimKeys: ["id", "statement", "scope", "falsifier", "evidenceIds", "provenance"],
  factsByCode: facts,
});

/** Provider-safe persistence is not provider export authority. Never spread a digest/view. */
export function externalData(input: ProviderRequest) {
  const r = ProviderRequestSchema.parse(input);
  return {
    schemaVersion: 1,
    exportPolicy: EXPORT_POLICY,
    role: r.role,
    layers: r.view.layers.map((v) => v),
    limitations: EXTERNAL_LIMITATIONS.map((v) => v),
    dataTrust: "untrusted-data; no-instruction-or-tool-authority",
    evidence: r.view.evidence.map((e) => {
      const selected: EvidenceDigest["facts"] = {};
      for (const k of facts[e.code]) if (Object.hasOwn(e.facts, k)) selected[k] = e.facts[k];
      return {
        id: e.id,
        kind: e.kind,
        code: e.code,
        provenance: e.provenance,
        collector: e.collector,
        location: { document: e.location.document, protocol: e.location.protocol },
        title: labels[e.code],
        detail:
          "Allowlisted numeric and presence facts only; website and network identifiers omitted.",
        facts: selected,
        completeness: {
          projection: "numeric-presence-only-v1",
          fullContentExported: false,
          fieldsOmitted: e.completeness.fieldsOmitted,
          collectionTruncated: e.completeness.collectionTruncated,
        },
      };
    }),
    claims:
      r.role === "Breaker"
        ? r.view.claims.map((c) => ({
            id: c.id,
            statement: c.statement,
            scope: {
              observation: c.scope.observation,
              conditions: c.scope.conditions.map((v) => v),
              limitations: c.scope.limitations.map((v) => v),
            },
            falsifier: c.falsifier,
            evidenceIds: c.evidenceIds.map((v) => v),
            provenance: "INFERRED",
          }))
        : [],
    omittedEvidence: r.view.omittedEvidence,
  };
}
