import { randomUUID } from "node:crypto";
import {
  type ControlledReproducerRun,
  ControlledReproducerRunSchema,
  JUDGE_INSTRUCTIONS,
  JUDGE_POLICY,
  type JudgeAudit,
  type JudgeChallengeProjection,
  type JudgeParent,
  JudgeProposalSchema,
  type JudgeRequest,
  JudgeRequestSchema,
  type JudgeReview,
  JudgeReviewSchema,
  type JudgeVerdict,
  type JudgeVerdictProposal,
  type JudgeView,
  JudgeViewSchema,
  judgeSchemas,
  JUDGE_LIMITS as L,
  ProviderReceiptSchema,
  ReproducerRunSchema,
  type ScanReport,
  ScanReportSchema,
  type SkepticReview,
  TribunalIdSchema,
  type TribunalRun,
} from "@crossexam/contracts";
import { evidenceCatalog, roleView } from "./evidence-digest";
import { exportableText } from "./proposal-safety";
import { BoundaryError, boundedJson, decodePayload, hash, immutable } from "./provider";
import { createReproducerSession, ReproducerAdmissionError } from "./reproducer";
import { admitOfflineReviewParent, reportSnapshotHash, SkepticAdmissionError } from "./skeptic";

/** Trusted injected host code, not a provider SDK or a network boundary. */
export interface JudgeFakeProvider {
  run(request: JudgeRequest, options: { readonly signal: AbortSignal }): Promise<unknown>;
}
export interface JudgeFakeConfiguration {
  readonly executionMode: "injected-fake";
  readonly provider: string;
  readonly model: string;
  readonly adapter?: JudgeFakeProvider;
}
export class JudgeAdmissionError extends Error {
  constructor(
    readonly code:
      | "INVALID_PARENT"
      | "LIVE_NOT_ALLOWED"
      | "MISSING_PARENT"
      | "UNAVAILABLE_EVIDENCE"
      | "UNSAFE_PARENT_TEXT"
      | "VIEW_LIMIT"
      | "REPLAY_MISMATCH"
      | "INVALID_REPRODUCER"
      | "INVALID_CONFIGURATION",
  ) {
    super(code);
  }
}

const schemas = judgeSchemas();
const identity = Object.freeze({
  requestSchemaHash: hash(JSON.stringify(schemas.request)),
  responseSchemaHash: hash(JSON.stringify(schemas.response)),
  policyHash: hash(
    JSON.stringify({
      policy: JUDGE_POLICY,
      limits: L,
      parent: "report-tribunal-skeptic-reproducer-separate-binding-v1",
      projection: "numeric-presence-only-v1",
      semanticPolicy:
        "bounded-scope; direct-support; contradiction-basis; missing-evidence-is-not-rejection; no-confidence-v1",
    }),
  ),
});
const failureStatus = {
  "missing-configuration": "missing-configuration",
  unavailable: "provider-unavailable",
  "transport-error": "transport-error",
  timeout: "timeout",
  abort: "aborted",
} as const;
const causalText =
  /\b(?:cause(?:s|d)?|causal|because|due to|leads? to|results? in|responsible for)\b/i;
const forbiddenScoringText =
  /\b(?:confidence|probability|probabilities|consensus|majority vote|model agreement|agreement score)\b|\b\d{1,3}(?:\.\d+)?%/i;

function fields(value: unknown, allowed: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.getOwnPropertySymbols(value).length
  )
    throw new BoundaryError("INVALID_PROVIDER_RESULT");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).some((key) => !allowed.includes(key)))
    throw new BoundaryError("INVALID_PROVIDER_RESULT");
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor))
      throw new BoundaryError("INVALID_PROVIDER_RESULT");
    result[key] = descriptor.value;
  }
  return result;
}

function usage(value: unknown): NonNullable<JudgeAudit["usage"]> {
  if (value === undefined) return { inputTokens: null, outputTokens: null };
  const v = fields(value, ["inputTokens", "outputTokens", "reasoningTokens"]);
  const valid = (n: unknown, max: number) =>
    n === null || (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max);
  if (!valid(v.inputTokens, 32768) || !valid(v.outputTokens, L.outputTokens))
    throw new Error("USAGE_LIMIT");
  if (
    v.reasoningTokens !== undefined &&
    (!valid(v.reasoningTokens, L.outputTokens) ||
      (typeof v.reasoningTokens === "number" &&
        typeof v.outputTokens === "number" &&
        v.reasoningTokens > v.outputTokens))
  )
    throw new Error("USAGE_LIMIT");
  return v as NonNullable<JudgeAudit["usage"]>;
}

function proposalCount(value: unknown) {
  if (value && typeof value === "object") {
    const verdicts = (value as Record<string, unknown>).verdicts;
    if (Array.isArray(verdicts)) return Math.min(verdicts.length, L.responseBytes);
  }
  return null;
}

function normalizedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(normalizedJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${normalizedJson(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function safeJudgeText(value: unknown) {
  if (!exportableText(value)) return false;
  const strings: string[] = [];
  const collect = (item: unknown) => {
    if (typeof item === "string") strings.push(item);
    else if (Array.isArray(item)) item.forEach(collect);
    else if (item && typeof item === "object") Object.values(item).forEach(collect);
  };
  collect(value);
  return !strings.some((item) => forbiddenScoringText.test(item));
}

function configure(input: JudgeFakeConfiguration): JudgeFakeConfiguration {
  const fail = (): never => {
    throw new JudgeAdmissionError("INVALID_CONFIGURATION");
  };
  const ownFields = (value: unknown, allowed: string[]) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.getOwnPropertySymbols(value).length
    )
      return fail();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Object.entries(descriptors).some(
        ([key, descriptor]) =>
          !allowed.includes(key) || !descriptor.enumerable || !("value" in descriptor),
      )
    )
      return fail();
    return descriptors;
  };
  const config = ownFields(input, ["executionMode", "provider", "model", "adapter"]);
  const provider = config.provider?.value;
  const model = config.model?.value;
  if (
    config.executionMode?.value !== "injected-fake" ||
    !TribunalIdSchema.safeParse(provider).success ||
    !TribunalIdSchema.safeParse(model).success ||
    !exportableText([provider, model])
  )
    return fail();
  const adapter = config.adapter?.value;
  const run = adapter === undefined ? undefined : ownFields(adapter, ["run"]).run?.value;
  if (adapter !== undefined && typeof run !== "function") return fail();
  return Object.freeze({
    executionMode: "injected-fake" as const,
    provider: provider as string,
    model: model as string,
    ...(run
      ? {
          adapter: Object.freeze({
            run: (request: JudgeRequest, options: { readonly signal: AbortSignal }) =>
              run.call(adapter, request, options),
          }),
        }
      : {}),
  });
}

function parentSnapshot(input: unknown): { snapshot: ScanReport; tribunal: TribunalRun } {
  const parsed = ScanReportSchema.safeParse(input);
  if (!parsed.success) throw new JudgeAdmissionError("INVALID_PARENT");
  const snapshot = immutable(parsed.data);
  if (snapshot.summary.source !== "fixture") throw new JudgeAdmissionError("LIVE_NOT_ALLOWED");
  const tribunal = snapshot.tribunalRuns[0];
  if (!tribunal) throw new JudgeAdmissionError("MISSING_PARENT");
  if (
    !exportableText([
      snapshot.summary.id,
      tribunal.id,
      ...tribunal.authorizedEvidenceIds,
      ...tribunal.claims.flatMap((claim) => [
        claim.id,
        claim.statement,
        claim.scope,
        claim.falsifier,
        ...claim.evidenceIds,
      ]),
      ...tribunal.challenges.flatMap((challenge) => [
        challenge.id,
        challenge.claimId,
        challenge.question,
        challenge.missingEvidence ?? "",
        ...challenge.evidenceIds,
      ]),
    ])
  )
    throw new JudgeAdmissionError("UNSAFE_PARENT_TEXT");
  return { snapshot, tribunal };
}

type Prepared = {
  snapshot: ScanReport;
  tribunal: TribunalRun;
  reportHash: string;
  evidence: JudgeView["evidence"];
  claims: JudgeView["claims"];
  challenges: JudgeView["challenges"];
  skeptic: SkepticReview | null;
  skepticHash: string | null;
  reproducer: ReproducerArtifact | null;
  reproducerHash: string | null;
  reproduction: JudgeView["reproduction"];
  parent: JudgeParent;
  view: JudgeView;
  request: JudgeRequest | null;
};

type ReproducerArtifact = import("@crossexam/contracts").ReproducerRun | ControlledReproducerRun;
const isControlledReproducer = (run: ReproducerArtifact): run is ControlledReproducerRun =>
  "artifactKind" in run;

function controlledAuthorizationHash(release: ControlledReproducerRun["release"]) {
  return hash(
    JSON.stringify({
      authorizationId: release.authorizationId,
      runId: release.runId,
      planId: release.planId,
      planHash: release.planHash,
      intentHash: release.intentHash,
      sourceRunHash: release.binding.sourceRunHash,
      parentSnapshotHash: release.binding.parent.snapshotHash,
      parentSkepticReviewHash: release.binding.parent.skepticReviewHash,
      fixtureManifestHash: release.fixtureManifestHash,
      policyHash: release.policyHash,
    }),
  );
}

function reproductionView(run: Prepared["reproducer"]): JudgeView["reproduction"] {
  if (!run) {
    return {
      status: "none",
      source: "none",
      runId: null,
      planId: null,
      claimId: null,
      challengeId: null,
      observedAccepted: false,
    };
  }
  if (isControlledReproducer(run)) {
    return {
      status:
        run.status === "completed"
          ? "simulated-test-only"
          : run.status === "not-dispatched"
            ? "planned-only"
            : "outcome-unknown",
      source: "stage16b-injected-fake",
      runId: run.id,
      planId: run.release.planId,
      claimId: run.release.plan.claimId,
      challengeId: run.release.plan.challengeId,
      observedAccepted: false,
    };
  }
  const plan = run.plans[0];
  if (!plan)
    return {
      status: "none",
      source: "none",
      runId: null,
      planId: null,
      claimId: null,
      challengeId: null,
      observedAccepted: false,
    };
  return {
    status:
      run.execution.status === "simulated-completed"
        ? "simulated-test-only"
        : run.execution.status === "not-requested" ||
            (run.execution.status === "configuration-failure" && run.execution.calls === 0)
          ? "planned-only"
          : "outcome-unknown",
    source: "stage16a-injected-fake",
    runId: run.id,
    planId: plan.id,
    claimId: plan.claimId,
    challengeId: plan.challengeId,
    observedAccepted: false,
  };
}

function judgeChallenge(
  challenge: TribunalRun["challenges"][number],
  reviewId: string | null,
): JudgeChallengeProjection {
  return {
    id: challenge.id,
    claimId: challenge.claimId,
    category: challenge.category,
    question: challenge.question,
    evidenceIds: [...challenge.evidenceIds],
    ...(challenge.missingEvidence !== undefined
      ? { missingEvidence: challenge.missingEvidence }
      : {}),
    raisedBy: challenge.raisedBy,
    provenance: "INFERRED",
    reviewId,
  };
}

function buildParentBinding(base: Omit<JudgeParent, "bindingHash">): JudgeParent {
  return { ...base, bindingHash: hash(normalizedJson(base)) };
}

function artifactHash(review: Omit<JudgeReview, "artifactHash">) {
  return hash(normalizedJson(review));
}

function prepare(
  input: unknown,
  options: { readonly skepticReview?: unknown; readonly reproducer?: unknown },
): Prepared {
  const { snapshot, tribunal } = parentSnapshot(input);
  const reportHash = reportSnapshotHash(snapshot);
  const catalog = evidenceCatalog(snapshot);
  const authorizedIds = new Set(tribunal.authorizedEvidenceIds);
  const evidence = catalog.evidence.filter((item) => authorizedIds.has(item.id));
  const supplied = new Set(evidence.map((item) => item.id));
  if (
    [...tribunal.claims, ...tribunal.challenges].some((record) =>
      record.evidenceIds.some((id) => !supplied.has(id)),
    )
  )
    throw new JudgeAdmissionError("UNAVAILABLE_EVIDENCE");

  let skeptic: SkepticReview | null = null;
  if (options.skepticReview !== undefined) {
    try {
      const admitted = admitOfflineReviewParent(snapshot, options.skepticReview);
      skeptic = admitted.review ?? null;
    } catch (error) {
      throw new JudgeAdmissionError(
        error instanceof SkepticAdmissionError ? "INVALID_PARENT" : "REPLAY_MISMATCH",
      );
    }
    if (!skeptic || skeptic.scanId !== snapshot.summary.id)
      throw new JudgeAdmissionError("INVALID_PARENT");
  }
  const skepticHash = skeptic ? hash(JSON.stringify(skeptic)) : null;

  let reproducer: Prepared["reproducer"] = null;
  if (options.reproducer !== undefined) {
    const stage16a = ReproducerRunSchema.safeParse(options.reproducer);
    if (stage16a.success) {
      const candidate = stage16a.data;
      try {
        // Stage 16A deliberately requires the original in-process run object for admission.
        createReproducerSession(
          snapshot,
          {
            executionMode: "injected-fake",
            provider: candidate.audit.provider,
            model: candidate.audit.model,
          },
          { skepticReview: skeptic ?? undefined, existingRun: options.reproducer },
        );
      } catch (error) {
        if (error instanceof ReproducerAdmissionError && error.code === "REPLAY_MISMATCH")
          throw new JudgeAdmissionError("REPLAY_MISMATCH");
        throw new JudgeAdmissionError("INVALID_REPRODUCER");
      }
      if (
        candidate.scanId !== snapshot.summary.id ||
        candidate.parent.snapshotHash !== reportHash ||
        candidate.parent.skepticReviewHash !== skepticHash
      )
        throw new JudgeAdmissionError("REPLAY_MISMATCH");
      reproducer = candidate;
    } else {
      const controlled = ControlledReproducerRunSchema.safeParse(options.reproducer);
      if (!controlled.success) throw new JudgeAdmissionError("INVALID_REPRODUCER");
      const candidate = controlled.data;
      const parent = candidate.release.binding.parent;
      const claimIds = new Set(tribunal.claims.map((claim) => claim.id));
      const challengeIds = new Set([
        ...tribunal.challenges.map((challenge) => challenge.id),
        ...(skeptic?.challenges.map((entry) => entry.challenge.id) ?? []),
      ]);
      if (
        candidate.releaseHash !== hash(JSON.stringify(candidate.release)) ||
        candidate.release.planHash !== hash(JSON.stringify(candidate.release.plan)) ||
        candidate.release.intentHash !== hash(JSON.stringify(candidate.release.intent)) ||
        candidate.release.authorizationBindingHash !==
          controlledAuthorizationHash(candidate.release) ||
        candidate.release.binding.scanId !== snapshot.summary.id ||
        parent.snapshotHash !== reportHash ||
        parent.skepticReviewHash !== skepticHash ||
        !claimIds.has(candidate.release.plan.claimId) ||
        !challengeIds.has(candidate.release.plan.challengeId) ||
        candidate.release.plan.evidenceIds.some((id) => !supplied.has(id)) ||
        parent.authorizedEvidenceIds.some((id) => !authorizedIds.has(id))
      )
        throw new JudgeAdmissionError("REPLAY_MISMATCH");
      reproducer = candidate;
    }
  }
  const reproducerHash = reproducer ? hash(JSON.stringify(reproducer)) : null;
  const baseView = roleView(snapshot, "Explorer", {
    evidence,
    omittedEvidence: tribunal.authorizedEvidenceIds.length - evidence.length,
  });
  const claims = tribunal.claims.map((claim) => ({
    id: claim.id,
    statement: claim.statement,
    scope: claim.scope,
    falsifier: claim.falsifier,
    evidenceIds: [...claim.evidenceIds],
    provenance: "INFERRED" as const,
  }));
  const challenges = [
    ...tribunal.challenges.map((challenge) => judgeChallenge(challenge, null)),
    ...(skeptic?.challenges.map((entry) => judgeChallenge(entry.challenge, skeptic?.id ?? null)) ??
      []),
  ];
  const reproduction = reproductionView(reproducer);
  const parent = buildParentBinding({
    reportHash,
    scanId: snapshot.summary.id,
    tribunalRunId: tribunal.id,
    authorizedEvidenceIds: [...tribunal.authorizedEvidenceIds],
    claimIds: claims.map((claim) => claim.id),
    challengeIds: challenges.map((challenge) => challenge.id),
    skepticReviewId: skeptic?.id ?? null,
    skepticReviewHash: skepticHash,
    reproducerRunId: reproducer?.id ?? null,
    reproducerHash,
  });
  const view = JudgeViewSchema.parse({
    schemaVersion: 1,
    role: "Judge",
    scan: baseView.scan,
    layers: baseView.layers,
    limitations: [
      ...baseView.limitations.slice(0, 5),
      "Verdicts cover only the supplied claim scope and admitted evidence.",
      "SIMULATED or test-only reproduction is not OBSERVED evidence.",
      "No confidence or model-agreement score is used.",
    ],
    dataTrust: baseView.dataTrust,
    collection: {
      authorizedEvidenceCount: tribunal.authorizedEvidenceIds.length,
      omittedEvidence: tribunal.authorizedEvidenceIds.length - evidence.length,
      truncated:
        tribunal.authorizedEvidenceIds.length > evidence.length ||
        evidence.some((item) => item.completeness.collectionTruncated === true),
    },
    evidence,
    claims,
    challenges,
    skeptic: skeptic
      ? {
          id: skeptic.id,
          status: skeptic.audit.status,
          challengeIds: skeptic.challenges.map((entry) => entry.challenge.id),
        }
      : null,
    reproduction,
    upstream: {
      tribunalStatus: tribunal.status,
      explorerStatus: tribunal.agentRuns[0].status,
      breakerStatus: tribunal.agentRuns[1].status,
    },
  });
  let request: JudgeRequest | null = null;
  if (claims.length) {
    request = immutable(
      JudgeRequestSchema.parse({
        schemaVersion: 1,
        role: "Judge",
        instructions: JUDGE_INSTRUCTIONS,
        view,
        maxOutputTokens: L.outputTokens,
        timeoutMs: L.roleMs,
        semanticRetries: 0,
      }),
    );
  }
  return {
    snapshot,
    tribunal,
    reportHash,
    evidence,
    claims,
    challenges,
    skeptic,
    skepticHash,
    reproducer,
    reproducerHash,
    reproduction,
    parent,
    view,
    request,
  };
}

type JudgeCode = JudgeAudit["rejectionCodes"][number];
type Accepted = { readonly verdict: JudgeVerdict } | { readonly code: JudgeCode };

function statusInStatement(statement: string): number | null {
  const http = /\bHTTP\s+([1-5]\d\d)\b/i.exec(statement);
  const status = /\bstatus(?:\s+code)?\s*(?:returned|is|was|:)\s*([1-5]\d\d)\b/i.exec(statement);
  const value = http?.[1] ?? status?.[1];
  return value ? Number(value) : null;
}

function validateProposal(
  proposal: JudgeVerdictProposal,
  prepared: Prepared,
  seenClaims: ReadonlySet<string>,
  id?: string,
  decidedAt = new Date().toISOString(),
): Accepted {
  if (!safeJudgeText([proposal.rationale, proposal.limitations]))
    return { code: "TEXT_NOT_ALLOWED" };
  const claim = prepared.claims.find((item) => item.id === proposal.claimId);
  if (!claim) return { code: "UNAUTHORIZED_CLAIM" };
  if (seenClaims.has(claim.id)) return { code: "DUPLICATE" };
  const challengeMap = new Map(prepared.challenges.map((challenge) => [challenge.id, challenge]));
  const selectedChallenges: JudgeChallengeProjection[] = [];
  for (const challengeId of proposal.challengeIds) {
    const challenge = challengeMap.get(challengeId);
    if (!challenge) return { code: "UNAUTHORIZED_CHALLENGE" };
    if (challenge.claimId !== claim.id) return { code: "UNAUTHORIZED_CHALLENGE" };
    selectedChallenges.push(challenge);
  }
  const evidenceMap = new Map(prepared.evidence.map((evidence) => [evidence.id, evidence]));
  const claimChallenges = prepared.challenges.filter((challenge) => challenge.claimId === claim.id);
  const linkedEvidence = new Set([
    ...claim.evidenceIds,
    ...claimChallenges.flatMap((challenge) => challenge.evidenceIds),
  ]);
  for (const evidenceId of proposal.supportEvidenceIds) {
    if (!evidenceMap.has(evidenceId)) return { code: "UNAUTHORIZED_EVIDENCE" };
    if (!linkedEvidence.has(evidenceId)) return { code: "SEMANTIC_INVALID" };
  }
  if (proposal.skepticReviewId !== undefined) {
    if (!prepared.skeptic || proposal.skepticReviewId !== prepared.skeptic.id)
      return { code: "UNAUTHORIZED_SKEPTIC" };
    if (selectedChallenges.some((challenge) => challenge.raisedBy === "Skeptic") === false)
      return { code: "UNAUTHORIZED_SKEPTIC" };
  } else if (selectedChallenges.some((challenge) => challenge.raisedBy === "Skeptic")) {
    return { code: "UNAUTHORIZED_SKEPTIC" };
  }
  if (proposal.reproduction !== undefined) {
    if (
      prepared.reproduction.status === "none" ||
      proposal.reproduction.status !== prepared.reproduction.status ||
      proposal.reproduction.runId !== prepared.reproduction.runId ||
      prepared.reproduction.claimId !== claim.id ||
      (prepared.reproduction.challengeId !== null &&
        !proposal.challengeIds.includes(prepared.reproduction.challengeId))
    )
      return { code: "UNAUTHORIZED_REPRODUCER" };
  }

  const directSupport = proposal.supportEvidenceIds.some((id) => claim.evidenceIds.includes(id));
  const collectionIncomplete =
    prepared.view.collection.truncated || prepared.view.collection.omittedEvidence > 0;
  const requiresReproduction =
    causalText.test(claim.statement) ||
    claimChallenges.some((challenge) => challenge.category === "reproduction-gap");
  const observedReproduction =
    prepared.reproduction.status === "observed-accepted" && prepared.reproduction.observedAccepted;
  const missingEvidenceChallenge = claimChallenges.some((challenge) =>
    [
      "missing-evidence",
      "collection-limitation",
      "overbroad-scope",
      "unsupported-causality",
      "context-mismatch",
    ].includes(challenge.category),
  );
  const contradictionChallenges = selectedChallenges.filter(
    (challenge) =>
      challenge.category === "contradictory-evidence" && challenge.evidenceIds.length > 0,
  );
  const contradictionEvidence = new Set(
    contradictionChallenges.flatMap((challenge) => challenge.evidenceIds),
  );
  const statusClaim = statusInStatement(claim.statement);
  const statusContradiction =
    statusClaim !== null &&
    proposal.supportEvidenceIds.some((evidenceId) => {
      const value = evidenceMap.get(evidenceId)?.facts.statusCode;
      return typeof value === "number" && value !== statusClaim;
    });
  const hasContradiction =
    proposal.supportEvidenceIds.some((evidenceId) => contradictionEvidence.has(evidenceId)) ||
    statusContradiction;
  const unresolvedMaterialChallenge = claimChallenges.length > 0;

  if (proposal.outcome === "confirmed") {
    if (!proposal.supportEvidenceIds.length || !directSupport) return { code: "NO_SUPPORT" };
    if (requiresReproduction && !observedReproduction) return { code: "REQUIRED_REPRODUCTION" };
    if (unresolvedMaterialChallenge) return { code: "SEMANTIC_INVALID" };
  } else if (proposal.outcome === "contested") {
    if (!proposal.supportEvidenceIds.length || !directSupport) return { code: "NO_SUPPORT" };
    if (!selectedChallenges.length) return { code: "SEMANTIC_INVALID" };
  } else if (proposal.outcome === "insufficient-evidence") {
    if (
      !(
        collectionIncomplete ||
        missingEvidenceChallenge ||
        !directSupport ||
        (requiresReproduction && !observedReproduction)
      )
    )
      return { code: "SEMANTIC_INVALID" };
  } else if (proposal.outcome === "rejected") {
    if (!proposal.supportEvidenceIds.length) return { code: "NO_SUPPORT" };
    if (!hasContradiction) return { code: "CONTRADICTION_REQUIRED" };
  }

  const verdict: JudgeVerdict = {
    id: id ?? "JV-unassigned",
    scanId: prepared.snapshot.summary.id,
    claimId: claim.id,
    status: proposal.outcome,
    basisEvidenceIds: [...proposal.supportEvidenceIds],
    challengeIds: [...proposal.challengeIds],
    skepticReviewId: proposal.skepticReviewId ?? null,
    reproduction: proposal.reproduction ?? null,
    rationale: proposal.rationale,
    limitations: [...proposal.limitations],
    decidedBy: "Judge",
    decidedAt,
  };
  return { verdict };
}

function occupiedIds(prepared: Prepared): Set<string> {
  const report = prepared.snapshot;
  return new Set(
    [
      report.summary,
      ...report.pages,
      ...report.metrics,
      ...report.evidence,
      ...report.claims,
      ...report.challenges,
      ...report.experiments,
      ...report.verdicts,
      ...report.findings,
      ...report.agentRuns,
      ...report.tribunalRuns,
      ...report.tribunalRuns.flatMap((run) => [...run.claims, ...run.challenges, ...run.agentRuns]),
      ...(prepared.skeptic
        ? [
            prepared.skeptic,
            prepared.skeptic.audit,
            ...prepared.skeptic.challenges.map((entry) => entry.challenge),
          ]
        : []),
      ...(prepared.reproducer
        ? isControlledReproducer(prepared.reproducer)
          ? [prepared.reproducer, prepared.reproducer.release, prepared.reproducer.release.plan]
          : [prepared.reproducer, prepared.reproducer.audit, ...prepared.reproducer.plans]
        : []),
    ]
      .filter((item) => item && typeof item === "object" && "id" in item)
      .map((item) => (item as { id: string }).id),
  );
}

function validateCanonicalReview(review: JudgeReview, prepared: Prepared) {
  const seenClaims = new Set<string>();
  for (const verdict of review.verdicts) {
    const proposal: JudgeVerdictProposal = {
      claimId: verdict.claimId,
      outcome: verdict.status,
      supportEvidenceIds: verdict.basisEvidenceIds,
      challengeIds: verdict.challengeIds,
      ...(verdict.skepticReviewId !== null ? { skepticReviewId: verdict.skepticReviewId } : {}),
      ...(verdict.reproduction !== null ? { reproduction: verdict.reproduction } : {}),
      rationale: verdict.rationale,
      limitations: verdict.limitations,
    };
    const result = validateProposal(proposal, prepared, seenClaims, verdict.id, verdict.decidedAt);
    if (!("verdict" in result) || result.verdict.id !== verdict.id)
      throw new Error("INVALID_VERDICT");
    seenClaims.add(verdict.claimId);
  }
}

function replay(
  existing: unknown,
  prepared: Prepared,
  configuration: JudgeFakeConfiguration,
): JudgeReview {
  try {
    const serialized =
      typeof existing === "string" ? existing : boundedJson(existing, L.reviewBytes);
    if (Buffer.byteLength(serialized) > L.reviewBytes) throw new Error();
    const review = JudgeReviewSchema.parse(JSON.parse(serialized));
    const { artifactHash: suppliedHash, ...withoutHash } = review;
    if (
      suppliedHash !== artifactHash(withoutHash) ||
      review.scanId !== prepared.snapshot.summary.id ||
      normalizedJson(review.parent) !== normalizedJson(prepared.parent) ||
      review.audit.provider !== configuration.provider ||
      review.audit.model !== configuration.model ||
      review.audit.policyHash !== identity.policyHash ||
      review.audit.requestSchemaHash !== identity.requestSchemaHash ||
      review.audit.responseSchemaHash !== identity.responseSchemaHash ||
      review.audit.requestHash !==
        (prepared.request ? hash(JSON.stringify(prepared.request)) : null)
    )
      throw new Error();
    validateCanonicalReview(review, prepared);
    return immutable(review);
  } catch {
    throw new JudgeAdmissionError("REPLAY_MISMATCH");
  }
}

function finalizeReview(base: Omit<JudgeReview, "artifactHash">): JudgeReview {
  return immutable(
    JudgeReviewSchema.parse({
      ...base,
      artifactHash: artifactHash(base),
    }),
  );
}

export function createJudgeSession(
  input: unknown,
  fakeProviderConfiguration: JudgeFakeConfiguration,
  options: {
    readonly skepticReview?: unknown;
    readonly reproducer?: unknown;
    readonly existingReview?: unknown;
  } = {},
) {
  const configuration = configure(fakeProviderConfiguration);
  const prepared = prepare(input, options);
  const original =
    options.existingReview === undefined
      ? undefined
      : replay(options.existingReview, prepared, configuration);
  let once: Promise<JudgeReview> | undefined;
  const execute = async (signal?: AbortSignal): Promise<JudgeReview> => {
    if (original) return original;
    const start = performance.now();
    const occupied = occupiedIds(prepared);
    const id = (prefix: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidate = `${prefix}-${randomUUID()}`;
        if (!occupied.has(candidate)) {
          occupied.add(candidate);
          return candidate;
        }
      }
      throw new Error("HOST_ID_ALLOCATION_FAILED");
    };
    const audit: JudgeAudit = {
      schemaVersion: 1,
      id: id("JA"),
      scanId: prepared.snapshot.summary.id,
      role: "Judge",
      executionMode: "injected-fake",
      provider: configuration.provider,
      model: configuration.model,
      policy: JUDGE_POLICY,
      ...identity,
      requestSchemaVersion: 1,
      responseSchemaVersion: 1,
      requestHash: null,
      responseHash: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedMs: 0,
      status: "skipped",
      usage: null,
      acceptedVerdictIds: [],
      rejectedCount: 0,
      rejectedCountKnown: true,
      rejectionCodes: [],
      calls: 0,
      outputTokenLimit: L.outputTokens,
      timeoutMs: L.roleMs,
      wholeDeadlineMs: L.totalMs,
      semanticRetries: 0,
    };
    const reviewId = id("JR");
    const verdicts: JudgeVerdict[] = [];
    const reject = (code: JudgeCode, amount = 1) => {
      audit.rejectedCount = Math.min(L.responseBytes, audit.rejectedCount + amount);
      if (!audit.rejectionCodes.includes(code)) audit.rejectionCodes.push(code);
    };
    const finish = () => {
      audit.finishedAt = new Date().toISOString();
      audit.elapsedMs = Math.max(0, performance.now() - start);
      audit.acceptedVerdictIds = verdicts.map((verdict) => verdict.id);
      return finalizeReview({
        schemaVersion: 1,
        id: reviewId,
        scanId: prepared.snapshot.summary.id,
        parent: prepared.parent,
        verdicts,
        audit,
      });
    };
    if (!prepared.request) {
      reject("NO_CLAIMS", 0);
      return finish();
    }
    if (signal?.aborted) {
      audit.status = "aborted";
      reject("CANCELLED", 0);
      return finish();
    }
    audit.requestHash = hash(JSON.stringify(prepared.request));
    if (!configuration.adapter) {
      audit.status = "missing-configuration";
      reject("PROVIDER_FAILURE", 0);
      return finish();
    }
    const roleStart = performance.now();
    const remaining = Math.min(L.roleMs - (roleStart - start), L.totalMs - (roleStart - start));
    if (remaining <= 0) {
      audit.status = "timeout";
      reject("DEADLINE", 0);
      return finish();
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let aborted: (() => void) | undefined;
    let stopped: "abort" | "timeout" | null = null;
    try {
      const stop = new Promise<unknown>((resolve) => {
        aborted = () => {
          stopped = "abort";
          controller.abort();
          resolve({ kind: "failure", category: "abort" });
        };
        signal?.addEventListener("abort", aborted, { once: true });
        timer = setTimeout(
          () => {
            stopped = "timeout";
            controller.abort();
            resolve({ kind: "failure", category: "timeout" });
          },
          Math.max(0, remaining),
        );
      });
      const invocation = Promise.resolve()
        .then(() => {
          if (signal?.aborted || controller.signal.aborted)
            return { kind: "failure", category: "abort" };
          if (performance.now() - start >= L.totalMs || performance.now() - roleStart >= L.roleMs)
            return { kind: "failure", category: "timeout" };
          audit.calls = 1;
          return configuration.adapter?.run(
            prepared.request as JudgeRequest,
            Object.freeze({ signal: controller.signal }),
          );
        })
        .catch(() => ({ kind: "failure", category: "transport-error" }));
      const untrusted = await Promise.race([invocation, stop]);
      if (signal?.aborted || stopped === "abort") {
        audit.status = "aborted";
        reject("CANCELLED", 0);
        return finish();
      }
      if (
        stopped === "timeout" ||
        performance.now() - start >= L.totalMs ||
        performance.now() - roleStart >= L.roleMs
      ) {
        audit.status = "timeout";
        reject("DEADLINE", 0);
        return finish();
      }
      const envelope = fields(untrusted, ["kind", "payload", "usage", "category", "receipt"]);
      if (envelope.receipt !== undefined) ProviderReceiptSchema.parse(envelope.receipt);
      try {
        audit.usage = usage(envelope.usage);
      } catch {
        audit.status = "limit-exceeded";
        audit.rejectedCountKnown = false;
        reject("USAGE_LIMIT", 0);
        return finish();
      }
      if (envelope.kind === "failure") {
        if (
          Object.keys(envelope).some(
            (key) => !["kind", "category", "receipt", "usage"].includes(key),
          ) ||
          typeof envelope.category !== "string" ||
          !Object.hasOwn(failureStatus, envelope.category)
        )
          throw new BoundaryError("INVALID_PROVIDER_RESULT");
        audit.status = failureStatus[envelope.category as keyof typeof failureStatus];
        reject("PROVIDER_FAILURE", 0);
        return finish();
      }
      if (
        envelope.kind !== "response" ||
        !Object.hasOwn(envelope, "payload") ||
        Object.hasOwn(envelope, "category")
      )
        throw new BoundaryError("INVALID_PROVIDER_RESULT");
      const decoded = decodePayload(envelope.payload);
      audit.responseHash = decoded.responseHash;
      const parsed = JudgeProposalSchema.safeParse(decoded.value);
      if (!parsed.success) {
        const limited = parsed.error.issues.some((issue) => issue.code === "too_big");
        const count = proposalCount(decoded.value);
        audit.status = limited ? "limit-exceeded" : "schema-invalid";
        audit.rejectedCountKnown = count !== null;
        reject(limited ? "RESPONSE_LIMIT" : "SCHEMA_INVALID", count ?? 0);
        return finish();
      }
      const seenClaims = new Set<string>();
      for (const proposal of parsed.data.verdicts) {
        const result = validateProposal(proposal, prepared, seenClaims);
        if (!("verdict" in result)) {
          reject(result.code);
          continue;
        }
        const verdict = { ...result.verdict, id: id("JV") };
        verdicts.push(verdict);
        seenClaims.add(verdict.claimId);
      }
      audit.status = verdicts.length
        ? audit.rejectedCount
          ? "completed-with-rejections"
          : "completed"
        : audit.rejectedCount
          ? "no-valid-output"
          : "completed";
      return finish();
    } catch (error) {
      audit.status =
        error instanceof BoundaryError
          ? error.code === "RESPONSE_LIMIT"
            ? "limit-exceeded"
            : error.code === "MALFORMED_JSON"
              ? "malformed-output"
              : "schema-invalid"
          : "schema-invalid";
      audit.rejectedCountKnown = false;
      reject(
        error instanceof BoundaryError
          ? error.code === "RESPONSE_LIMIT"
            ? "RESPONSE_LIMIT"
            : error.code === "MALFORMED_JSON"
              ? "MALFORMED_JSON"
              : "INVALID_PROVIDER_RESULT"
          : "INVALID_PROVIDER_RESULT",
        0,
      );
      if (error instanceof BoundaryError && error.responseHash)
        audit.responseHash = error.responseHash;
      return finish();
    } finally {
      clearTimeout(timer);
      if (aborted) signal?.removeEventListener("abort", aborted);
      controller.abort();
    }
  };
  return Object.freeze({
    run(options: { readonly signal?: AbortSignal } = {}) {
      once ??= execute(options.signal);
      return once;
    },
  });
}
