import { z } from "zod";
import { CanonicalChallengeSchema, CanonicalClaimSchema, TribunalRunSchema } from "./tribunal";

export * from "./browser-evidence";
export * from "./tribunal";

export const ProvenanceSchema = z.enum(["OBSERVED", "DERIVED", "INFERRED", "SIMULATED"]);
export const DataSourceSchema = z.enum(["fixture", "live"]);
export const SeveritySchema = z.enum(["high", "medium", "low", "info"]);
export const AgentRoleSchema = z.enum(["Explorer", "Breaker", "Skeptic", "Reproducer", "Judge"]);
const Id = z.string().min(1);
const References = z.array(Id).min(1);

// Syntax validation only. This is NOT an SSRF safety check or permission to fetch.
export const TargetUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an HTTP or HTTPS URL without embedded credentials.");

export const EvidenceSchema = z.object({
  id: Id,
  scanId: Id,
  source: DataSourceSchema,
  provenance: ProvenanceSchema,
  kind: z.enum(["navigation", "performance", "accessibility", "network", "metadata", "headers"]),
  url: TargetUrlSchema,
  capturedAt: z.string().datetime(),
  title: z.string().min(1),
  detail: z.string().min(1),
  collector: z.string().min(1),
  code: z
    .enum([
      "HTTP_STATUS",
      "DOCUMENT_METADATA",
      "DOCUMENT_STRUCTURE",
      "RESPONSE_HEADERS",
      "RESOURCE_REFERENCES",
      "ROBOTS_TXT",
      "SITEMAP_XML",
      "FETCH_FAILURE",
      "BROWSER_NAVIGATION",
      "BROWSER_CONSOLE",
      "BROWSER_PAGE_ERRORS",
      "BROWSER_REQUESTS",
      "BROWSER_RESPONSES",
      "BROWSER_RENDERED_DOM",
      "BROWSER_PERFORMANCE",
      "BROWSER_RUNTIME_ANALYSIS",
      "BROWSER_ACCESSIBILITY_OBSERVATION",
      "BROWSER_ACCESSIBILITY_RULES",
    ])
    .optional(),
  data: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
    )
    .optional(),
});

export const ClaimSchema = CanonicalClaimSchema;
export const ChallengeSchema = CanonicalChallengeSchema;

export const ExperimentSchema = z
  .object({
    id: Id,
    claimId: Id,
    challengeId: Id,
    method: z.string().min(1),
    safety: z.literal("non-destructive"),
    status: z.enum(["planned", "completed", "inconclusive", "blocked"]),
    evidenceIds: z.array(Id),
  })
  .refine((item) => item.status !== "completed" || item.evidenceIds.length > 0, {
    message: "A completed experiment must reference evidence.",
  });

export const VerdictSchema = z.object({
  id: Id,
  claimId: Id,
  status: z.enum(["confirmed", "contested", "insufficient-evidence", "rejected"]),
  rationale: z.string().min(1),
  evidenceIds: References,
  experimentIds: z.array(Id),
  decidedBy: z.enum(["Judge", "Deterministic rule"]),
});

export const FindingSchema = z.object({
  id: Id,
  claimId: Id,
  verdictId: Id,
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(["Performance", "Accessibility", "Navigation", "Metadata", "Headers"]),
  severity: SeveritySchema,
  provenance: ProvenanceSchema,
  evidenceIds: References,
  affectedPaths: z.array(z.string()).min(1),
  recommendation: z.string().min(1),
  verification: z.string().min(1),
});

export const PageSchema = z.object({
  id: Id,
  path: z.string().startsWith("/"),
  title: z.string().min(1),
  statusCode: z.number().int().min(100).max(599),
  durationMs: z.number().nonnegative(),
  linksTo: z.array(Id),
  requestedUrl: TargetUrlSchema.optional(),
  finalUrl: TargetUrlSchema.optional(),
  depth: z.number().int().min(0).max(2).optional(),
  redirectCount: z.number().int().nonnegative().optional(),
  contentType: z.string().optional(),
  responseBytes: z.number().int().nonnegative().optional(),
});

export const MetricSchema = z.object({
  id: Id,
  label: z.string().min(1),
  value: z.number().nonnegative(),
  unit: z.enum(["ms", "s", "count", "KB"]),
  provenance: ProvenanceSchema,
  evidenceIds: References,
});

export const AgentRunSchema = z.object({
  id: Id,
  role: AgentRoleSchema,
  elapsedMs: z.number().nonnegative(),
  status: z.enum(["completed", "blocked"]),
  summary: z.string().min(1),
  claimIds: z.array(Id),
});

export const ScanSummarySchema = z.object({
  id: Id,
  source: DataSourceSchema,
  targetUrl: TargetUrlSchema,
  status: z.enum(["queued", "running", "completed", "partial", "failed"]),
  startedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
});

export const ScanInputSchema = z.object({
  targetUrl: TargetUrlSchema,
  maxPages: z.number().int().min(1).max(20).default(8),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
});

export const ScanReportSchema = z
  .object({
    schemaVersion: z.literal(2),
    summary: ScanSummarySchema,
    pages: z.array(PageSchema),
    metrics: z.array(MetricSchema),
    evidence: z.array(EvidenceSchema),
    claims: z.array(ClaimSchema),
    challenges: z.array(ChallengeSchema),
    experiments: z.array(ExperimentSchema),
    verdicts: z.array(VerdictSchema),
    findings: z.array(FindingSchema),
    agentRuns: z.array(AgentRunSchema),
    tribunalRuns: z.array(TribunalRunSchema).max(1),
    investigation: z
      .object({
        mode: z.literal("deterministic-http"),
        version: z.literal(1),
        finalOrigin: z.string().url(),
        requestCount: z.number().int().min(0).max(10),
        receivedBytes: z.number().int().nonnegative(),
        limits: z.record(z.string(), z.number().nonnegative()),
        limitations: z.array(z.string()),
        notes: z.array(z.string()),
      })
      .optional(),
  })
  .superRefine((report, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (report.investigation) {
      if (report.summary.source !== "live") fail("HTTP investigations must have live source.");
      if (report.agentRuns.length || report.challenges.length || report.experiments.length)
        fail("Deterministic HTTP reports must not invent agent activity or experiments.");
      if (
        report.evidence.some(
          (item) => !item.code || !item.data || item.provenance !== "OBSERVED",
        ) ||
        report.claims.some((item) => item.proposedBy !== "Deterministic rule") ||
        report.verdicts.some((item) => item.decidedBy !== "Deterministic rule")
      )
        fail("Deterministic reports require measured evidence and explicit rule attribution.");
    }
    for (const run of report.tribunalRuns) {
      if (run.scanId !== report.summary.id) fail("Tribunal belongs to another scan");
      for (const id of run.authorizedEvidenceIds) {
        const e = report.evidence.find((item) => item.id === id);
        if (!e || !["OBSERVED", "DERIVED"].includes(e.provenance))
          fail("Tribunal evidence authorization mismatch");
      }
      const baseIds = new Set(
        [
          ...report.pages,
          ...report.metrics,
          ...report.evidence,
          ...report.claims,
          ...report.challenges,
          ...report.experiments,
          ...report.verdicts,
          ...report.findings,
          ...report.agentRuns,
        ].map((item) => item.id),
      );
      for (const item of [run, ...run.claims, ...run.challenges, ...run.agentRuns])
        if (baseIds.has(item.id)) fail("Tribunal ID collides with base state");
    }
    const collections = [
      report.pages,
      report.metrics,
      report.evidence,
      report.claims,
      report.challenges,
      report.experiments,
      report.verdicts,
      report.findings,
      report.agentRuns,
    ];
    for (const collection of collections) {
      if (new Set(collection.map((item) => item.id)).size !== collection.length)
        fail("Duplicate IDs in report collection.");
    }
    const evidenceIds = new Set(report.evidence.map((item) => item.id));
    const pageIds = new Set(report.pages.map((item) => item.id));
    const claims = new Map(report.claims.map((item) => [item.id, item]));
    const challenges = new Map(report.challenges.map((item) => [item.id, item]));
    const experiments = new Map(report.experiments.map((item) => [item.id, item]));
    const verdicts = new Map(report.verdicts.map((item) => [item.id, item]));
    for (const item of report.evidence) {
      if (item.source !== report.summary.source || item.scanId !== report.summary.id)
        fail(`Evidence ${item.id} has mixed source or scan identity.`);
    }
    for (const item of [...report.claims, ...report.challenges]) {
      if (item.scanId !== report.summary.id) fail(`Claim ${item.id} belongs to another scan.`);
    }
    for (const item of [
      ...report.claims,
      ...report.challenges,
      ...report.experiments,
      ...report.verdicts,
      ...report.findings,
      ...report.metrics,
    ]) {
      for (const id of item.evidenceIds)
        if (!evidenceIds.has(id)) fail(`Unknown evidence reference ${id}.`);
    }
    for (const item of [
      ...report.challenges,
      ...report.experiments,
      ...report.verdicts,
      ...report.findings,
    ]) {
      if (!claims.has(item.claimId)) fail(`Unknown claim reference ${item.claimId}.`);
    }
    for (const item of report.experiments) {
      if (challenges.get(item.challengeId)?.claimId !== item.claimId)
        fail(`Experiment ${item.id} has an unrelated challenge.`);
    }
    for (const item of report.verdicts) {
      for (const id of item.experimentIds) {
        if (experiments.get(id)?.claimId !== item.claimId)
          fail(`Verdict ${item.id} has an unrelated experiment.`);
      }
    }
    for (const item of report.findings) {
      if (verdicts.get(item.verdictId)?.claimId !== item.claimId)
        fail(`Finding ${item.id} has an unrelated verdict.`);
    }
    for (const item of report.pages) {
      for (const id of item.linksTo) if (!pageIds.has(id)) fail(`Unknown page reference ${id}.`);
    }
    for (const item of report.agentRuns) {
      for (const id of item.claimIds)
        if (!claims.has(id)) fail(`Unknown agent claim reference ${id}.`);
    }
    if (
      report.summary.pageCount !== report.pages.length ||
      report.summary.evidenceCount !== report.evidence.length ||
      report.summary.findingCount !== report.findings.length
    )
      fail("Summary counts must match report collections.");
  });

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Challenge = z.infer<typeof ChallengeSchema>;
export type Experiment = z.infer<typeof ExperimentSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type ScanSummary = z.infer<typeof ScanSummarySchema>;
export type ScanInput = z.infer<typeof ScanInputSchema>;
export type ScanReport = z.infer<typeof ScanReportSchema>;
export type Page = z.infer<typeof PageSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export * from "./browser-accessibility";
export * from "./browser-performance";
