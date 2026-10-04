import {
  type Claim,
  type Evidence,
  type EvidenceDigest,
  EvidenceDigestSchema,
  type RoleView,
  RoleViewSchema,
  type ScanReport,
  TRIBUNAL_LIMITS,
} from "@crossexam/contracts";
import { immutable } from "./provider";

const labels: Record<NonNullable<Evidence["code"]>, string> = {
  HTTP_STATUS: "HTTP response measurements",
  DOCUMENT_METADATA: "Document metadata presence",
  DOCUMENT_STRUCTURE: "Returned document structure counts",
  RESPONSE_HEADERS: "Selected response header presence",
  RESOURCE_REFERENCES: "Declared resource counts",
  ROBOTS_TXT: "Robots document collection",
  SITEMAP_XML: "Sitemap document collection",
  FETCH_FAILURE: "Document not collected",
  BROWSER_NAVIGATION: "Chromium navigation observation",
  BROWSER_CONSOLE: "Chromium console event counts",
  BROWSER_PAGE_ERRORS: "Chromium runtime error count",
  BROWSER_REQUESTS: "Chromium request counts",
  BROWSER_RESPONSES: "Chromium response counts",
  BROWSER_RENDERED_DOM: "Rendered document counts",
  BROWSER_PERFORMANCE: "Finite-window browser LAB measurements",
  BROWSER_RUNTIME_ANALYSIS: "Derived browser LAB summary",
  BROWSER_ACCESSIBILITY_OBSERVATION: "Rendered accessibility facts",
  BROWSER_ACCESSIBILITY_RULES: "Automated accessibility rule counts",
};
type Facts = EvidenceDigest["facts"];
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const numeric = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? v : null;
const present = (v: unknown) => typeof v === "string" && v.trim().length > 0;
function observation(data: Evidence["data"]) {
  const raw = data?.observation;
  if (typeof raw !== "string" || Buffer.byteLength(raw) > 32 * 1024) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
function collectionTruncated(e: Evidence): boolean | null {
  if (typeof e.data?.truncated === "boolean") return e.data.truncated;
  let t = record(record(observation(e.data)).truncation);
  const raw = e.data?.truncation;
  if (typeof raw === "string" && Buffer.byteLength(raw) <= 4096) {
    try {
      t = record(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (!Object.keys(t).length) return null;
  return (
    t.resultSize === true ||
    t.domInspectionLimit === true ||
    Object.values(record(t.dropped)).some((n) => (numeric(n) ?? 0) > 0) ||
    [
      t.shortenedStrings,
      t.omittedUrls,
      t.omittedHeaders,
      t.violationRules,
      t.violationNodes,
      t.incompleteRules,
      t.incompleteNodes,
    ].some((n) => (numeric(n) ?? 0) > 0)
  );
}
function factsFor(e: Evidence): Facts {
  const d = e.data ?? {};
  const o = observation(d);
  const b = record(o);
  const f: Facts = {};
  const copy = (keys: (keyof Facts)[], from: Record<string, unknown> = d) => {
    for (const key of keys) f[key] = numeric(from[key]);
  };
  switch (e.code) {
    case "HTTP_STATUS":
      copy(["statusCode", "responseBytes", "durationMs", "redirectCount"]);
      break;
    case "DOCUMENT_METADATA":
      f.titlePresent = present(d.title);
      f.descriptionPresent = present(d.description);
      f.languagePresent = present(d.lang);
      break;
    case "DOCUMENT_STRUCTURE":
      copy([
        "images",
        "imagesWithoutAlt",
        "scripts",
        "stylesheets",
        "forms",
        "internalLinkCount",
        "externalLinkCount",
      ]);
      break;
    case "RESPONSE_HEADERS":
      f.contentSecurityPolicyPresent = present(d["content-security-policy"]);
      f.hstsPresent = present(d["strict-transport-security"]);
      f.nosniffPresent = present(d["x-content-type-options"]);
      break;
    case "RESOURCE_REFERENCES":
      copy(["mixedContentCount"]);
      break;
    case "ROBOTS_TXT":
    case "SITEMAP_XML":
      f.exists = typeof d.exists === "boolean" ? d.exists : null;
      copy(["statusCode", "responseBytes"]);
      f.truncated = typeof d.truncated === "boolean" ? d.truncated : null;
      break;
    case "BROWSER_NAVIGATION":
      f.statusCode = numeric(b.status);
      f.redirectCount = Array.isArray(b.chain) ? Math.max(0, b.chain.length - 1) : null;
      break;
    case "BROWSER_CONSOLE":
      f.events = Array.isArray(o) ? o.length : null;
      f.errors = Array.isArray(o) ? o.filter((v) => record(v).level === "error").length : null;
      f.warnings = Array.isArray(o) ? o.filter((v) => record(v).level === "warning").length : null;
      break;
    case "BROWSER_PAGE_ERRORS":
    case "BROWSER_RESPONSES":
      f.observed = Array.isArray(o) ? o.length : null;
      break;
    case "BROWSER_REQUESTS":
      f.observed = Array.isArray(o) ? o.length : null;
      f.failed = Array.isArray(o) ? o.filter((v) => record(v).outcome === "failed").length : null;
      break;
    case "BROWSER_RENDERED_DOM":
      f.titlePresent = present(b.title);
      f.descriptionPresent = present(b.description);
      copy(["forms", "resources"], record(b.counts));
      break;
    case "BROWSER_PERFORMANCE":
      f.fcpMs = numeric(record(record(b.metrics).fcp).value);
      f.lcpMs = numeric(record(record(b.metrics).lcp).value);
      f.resources = Array.isArray(b.resources) ? b.resources.length : null;
      f.longTasks = Array.isArray(b.longTasks) ? b.longTasks.length : null;
      break;
    case "BROWSER_RUNTIME_ANALYSIS":
      f.cls = numeric(record(b.cls).value);
      break;
    case "BROWSER_ACCESSIBILITY_OBSERVATION": {
      const a = record(b.observation);
      f.languagePresent = typeof a.languagePresent === "boolean" ? a.languagePresent : null;
      f.titlePresent = typeof a.titlePresent === "boolean" ? a.titlePresent : null;
      break;
    }
    case "BROWSER_ACCESSIBILITY_RULES": {
      const a = record(b.ruleResults);
      copy(
        ["violationRules", "violationNodes", "incompleteRules", "incompleteNodes"],
        record(a.aggregates),
      );
      f.passes = numeric(record(a.passes).count);
      f.inapplicable = numeric(record(a.inapplicable).count);
      break;
    }
  }
  return f;
}
const collectorFor = (code: NonNullable<Evidence["code"]>): EvidenceDigest["collector"] =>
  code.startsWith("BROWSER_ACCESSIBILITY_")
    ? "rendered-axe-v1"
    : ["BROWSER_PERFORMANCE", "BROWSER_RUNTIME_ANALYSIS"].includes(code)
      ? "chromium-lab-v1"
      : code.startsWith("BROWSER_")
        ? "chromium-runtime-v1"
        : "http-document-v1";

/** Deliberately excludes website text and every URL component except protocol/opaque equality. */
export function evidenceCatalog(report: ScanReport): {
  evidence: EvidenceDigest[];
  omittedEvidence: number;
} {
  const evidence: EvidenceDigest[] = [];
  const locations = new Map<string, number>();
  let bytes = 0;
  for (const e of report.evidence.slice(0, TRIBUNAL_LIMITS.inspectedEvidence)) {
    if (
      !e.code ||
      !["OBSERVED", "DERIVED"].includes(e.provenance) ||
      e.collector !== collectorFor(e.code)
    )
      continue;
    const u = new URL(e.url);
    const key = `${u.origin}${u.pathname}`;
    if (!locations.has(key)) locations.set(key, locations.size + 1);
    const parsed = EvidenceDigestSchema.safeParse({
      schemaVersion: 1,
      id: e.id,
      kind: e.kind,
      code: e.code,
      provenance: e.provenance,
      source: e.source,
      collector: e.collector,
      location: { document: locations.get(key), protocol: u.protocol },
      capturedAt: e.capturedAt,
      title: labels[e.code],
      detail:
        "Allowlisted numeric and presence facts only. Website content and network identifiers are omitted.",
      facts: factsFor(e),
      completeness: {
        projection: "numeric-presence-only-v1",
        fullContentExported: false,
        fieldsOmitted: Object.keys(e.data ?? {}).length,
        collectionTruncated: collectionTruncated(e),
      },
    });
    if (!parsed.success) continue;
    const size = Buffer.byteLength(JSON.stringify(parsed.data));
    // Reserve 32 KiB for Breaker claims and envelope; never expand the role budget.
    if (evidence.length >= TRIBUNAL_LIMITS.evidence || bytes + size > 96 * 1024) continue;
    evidence.push(parsed.data);
    bytes += size;
  }
  return immutable({ evidence, omittedEvidence: report.evidence.length - evidence.length });
}
export function roleView(
  report: ScanReport,
  role: RoleView["role"],
  catalog: ReturnType<typeof evidenceCatalog>,
  claims: Claim[] = [],
): RoleView {
  const layers: RoleView["layers"] = [];
  for (const e of catalog.evidence) {
    const layer =
      e.collector === "http-document-v1"
        ? "http"
        : e.collector === "chromium-runtime-v1"
          ? "browser-runtime"
          : e.collector === "chromium-lab-v1"
            ? "browser-lab"
            : "rendered-accessibility";
    if (!layers.includes(layer)) layers.push(layer);
  }
  return immutable(
    RoleViewSchema.parse({
      schemaVersion: 1,
      role,
      scan: { id: report.summary.id, source: report.summary.source },
      layers,
      limitations: [
        "Only supplied collected evidence is authorized.",
        "Numeric projection omits website content, URLs, headers and DOM details.",
        "Absence of a fact is not proof of absence or safety.",
        "Collection is bounded; browser LAB windows and automated accessibility checks are incomplete.",
        "No independent reproduction or causal conclusion is supplied.",
      ],
      dataTrust: "untrusted-data; no-instruction-or-tool-authority",
      evidence: catalog.evidence,
      claims: role === "Breaker" ? claims : [],
      omittedEvidence: catalog.omittedEvidence,
    }),
  );
}
