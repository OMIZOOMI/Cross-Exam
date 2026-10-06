import { randomUUID } from "node:crypto";
import {
  REPRODUCER_LIMITS as L,
  REPRODUCER_INSTRUCTIONS,
  REPRODUCER_POLICY,
  type ReproducerAudit,
  ReproducerFakeExecutorResultSchema,
  ReproducerFakePlannerResultSchema,
  type ReproducerPlan,
  ReproducerProposalSchema,
  type ReproducerRequest,
  ReproducerRequestSchema,
  type ReproducerRun,
  ReproducerRunSchema,
  ReproducerUsageSchema,
  reproducerSchemas,
  TribunalIdSchema,
} from "@crossexam/contracts";
import { exportableText } from "./proposal-safety";
import { BoundaryError, boundedJson, decodePayload, hash, immutable } from "./provider";
import {
  issueReproducerAuthorization,
  OPERATION_POLICY_HASH,
  REPRODUCER_OPERATIONS,
  type ReproducerOperationCapability,
} from "./reproducer-authorization";
import { admitOfflineReviewParent, SkepticAdmissionError } from "./skeptic";

/** Both injected components are trusted host code, not sandboxed or real-provider adapters. */
export interface ReproducerFakeConfiguration {
  readonly executionMode: "injected-fake";
  readonly provider: string;
  readonly model: string;
  readonly planner?: {
    run(request: ReproducerRequest, options: { readonly signal: AbortSignal }): Promise<unknown>;
  };
  readonly executor?: {
    execute(
      capability: ReproducerOperationCapability,
      options: { readonly signal: AbortSignal },
    ): Promise<unknown>;
  };
}
export class ReproducerAdmissionError extends Error {
  constructor(
    readonly code:
      | "INVALID_PARENT"
      | "LIVE_NOT_ALLOWED"
      | "MISSING_PARENT"
      | "UNAVAILABLE_EVIDENCE"
      | "UNSAFE_PARENT_TEXT"
      | "VIEW_LIMIT"
      | "REPLAY_MISMATCH"
      | "INVALID_CONFIGURATION",
  ) {
    super(code);
  }
}
const schemas = reproducerSchemas();
const identity = Object.freeze({
  requestSchemaHash: hash(JSON.stringify(schemas.request)),
  responseSchemaHash: hash(JSON.stringify(schemas.response)),
  policyHash: hash(
    JSON.stringify({
      policy: REPRODUCER_POLICY,
      limits: L,
      operationPolicyHash: OPERATION_POLICY_HASH,
      parent: "offline-skeptic-admission-v1",
      authorizationBinding: "report-snapshot-and-separate-skeptic-review-v1",
      projection: "numeric-presence-only-v1",
      execution: "injected-fake-only; object-identity-replay",
    }),
  ),
});
const failures = {
  "missing-configuration": "configuration-failure",
  unavailable: "provider-unavailable",
  "transport-error": "transport-failure",
  timeout: "timeout",
  abort: "aborted",
} as const;
// Only exact immutable result objects issued in this process can replay. No serialized recovery.
const completedRuns = new WeakMap<ReproducerRun, string>();
function configure(input: ReproducerFakeConfiguration) {
  const fail = (): never => {
    throw new ReproducerAdmissionError("INVALID_CONFIGURATION");
  };
  const fields = (v: unknown, keys: string[]) => {
    if (
      !v ||
      typeof v !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
      Object.getOwnPropertySymbols(v).length
    )
      return fail();
    const d = Object.getOwnPropertyDescriptors(v);
    if (
      Object.entries(d).some(([key, x]) => !keys.includes(key) || !x.enumerable || !("value" in x))
    )
      return fail();
    return d;
  };
  const d = fields(input, ["executionMode", "provider", "model", "planner", "executor"]);
  const provider = d.provider?.value;
  const model = d.model?.value;
  if (
    d.executionMode?.value !== "injected-fake" ||
    !TribunalIdSchema.safeParse(provider).success ||
    !TribunalIdSchema.safeParse(model).success ||
    !exportableText([provider, model])
  )
    return fail();
  const planner = d.planner?.value;
  const executor = d.executor?.value;
  const run = planner === undefined ? undefined : fields(planner, ["run"]).run?.value;
  const execute = executor === undefined ? undefined : fields(executor, ["execute"]).execute?.value;
  if (
    (planner !== undefined && typeof run !== "function") ||
    (executor !== undefined && typeof execute !== "function")
  )
    return fail();
  return Object.freeze({
    provider: provider as string,
    model: model as string,
    planner: run
      ? (request: ReproducerRequest, options: { readonly signal: AbortSignal }) =>
          run.call(planner, request, options)
      : undefined,
    executor: execute
      ? (capability: ReproducerOperationCapability, options: { readonly signal: AbortSignal }) =>
          execute.call(executor, capability, options)
      : undefined,
  });
}
function prepare(input: unknown, skepticReview?: unknown) {
  let admitted: ReturnType<typeof admitOfflineReviewParent>;
  try {
    admitted = admitOfflineReviewParent(input, skepticReview);
  } catch (e) {
    throw new ReproducerAdmissionError(
      e instanceof SkepticAdmissionError ? e.code : "INVALID_PARENT",
    );
  }
  const { snapshot, prepared, review } = admitted;
  const parent = prepared.parent;
  if (
    Date.parse(review?.audit.finishedAt ?? parent.finishedAt) > Date.now() ||
    parent.agentRuns.some((a) => {
      const records = a.role === "Explorer" ? parent.claims : parent.challenges;
      return (
        records.length > 0 &&
        (!a.responseHash ||
          records.some(
            (c) =>
              Date.parse(c.createdAt) < Date.parse(a.startedAt) ||
              Date.parse(c.createdAt) > Date.parse(a.finishedAt),
          ))
      );
    })
  )
    throw new ReproducerAdmissionError("INVALID_PARENT");
  if (
    review &&
    !exportableText([review.id, review.audit.id, ...review.challenges.map((c) => c.challenge.id)])
  )
    throw new ReproducerAdmissionError("UNSAFE_PARENT_TEXT");
  const challenges = [
    ...parent.challenges.map((c) => ({ ...c, relatedChallengeIds: [] as string[] })),
    ...(review?.challenges.map((c) => ({
      ...c.challenge,
      relatedChallengeIds: c.relatedChallengeIds,
    })) ?? []),
  ];
  const skepticHash = review ? hash(JSON.stringify(review)) : null;
  const binding: ReproducerRun["parent"] = {
    snapshotHash: prepared.binding.snapshotHash,
    tribunalRunId: parent.id,
    skepticReviewId: review?.id ?? null,
    skepticReviewHash: skepticHash,
    authorizedEvidenceIds: [...parent.authorizedEvidenceIds],
    reviewedClaimIds: parent.claims.map((c) => c.id),
    reviewedChallengeIds: challenges.map((c) => c.id),
  };
  if (challenges.some((c) => c.evidenceIds.some((id) => !prepared.supplied.has(id))))
    throw new ReproducerAdmissionError("UNAVAILABLE_EVIDENCE");
  const skip =
    !prepared.request ||
    !challenges.length ||
    (review &&
      !["completed", "partial-rejection", "no-valid-output"].includes(review.audit.status));
  let request: ReproducerRequest | null = null;
  if (!skip && prepared.request) {
    const base = prepared.request.view;
    const parsed = ReproducerRequestSchema.safeParse({
      schemaVersion: 1,
      role: "Reproducer",
      instructions: REPRODUCER_INSTRUCTIONS,
      maxOutputTokens: 768,
      timeoutMs: 20000,
      semanticRetries: 0,
      view: {
        schemaVersion: 1,
        role: "Reproducer",
        dataTrust: base.dataTrust,
        layers: base.layers,
        limitations: [
          ...base.limitations.slice(0, 6),
          "Plans authorize injected tests only; no reproduction or verdict is established.",
          "Related challenge links are context only. No tools, targets or parameters are available.",
        ],
        evidence: base.evidence,
        claims: base.claims,
        challenges: challenges.map((c) => ({
          id: c.id,
          claimId: c.claimId,
          category: c.category,
          question: c.question,
          evidenceIds: c.evidenceIds,
          ...(c.missingEvidence !== undefined ? { missingEvidence: c.missingEvidence } : {}),
          raisedBy: c.raisedBy,
          provenance: "INFERRED",
          relatedChallengeIds: c.relatedChallengeIds,
        })),
        upstream: prepared.upstream,
        skepticStatus: review?.audit.status ?? null,
        omittedEvidence: base.omittedEvidence,
        operations: REPRODUCER_OPERATIONS,
      },
    });
    if (!parsed.success) throw new ReproducerAdmissionError("VIEW_LIMIT");
    request = immutable(parsed.data);
  }
  const occupied = new Set([
    snapshot.summary.id,
    ...[
      snapshot.pages,
      snapshot.metrics,
      snapshot.evidence,
      snapshot.claims,
      snapshot.challenges,
      snapshot.experiments,
      snapshot.verdicts,
      snapshot.findings,
      snapshot.agentRuns,
      [parent, ...parent.claims, ...parent.challenges, ...parent.agentRuns],
    ]
      .flat()
      .map((x) => x.id),
    ...(review
      ? [review.id, review.audit.id, ...review.challenges.map((c) => c.challenge.id)]
      : []),
  ]);
  return {
    binding,
    request,
    parent,
    challenges,
    supplied: prepared.supplied,
    occupied,
    scanId: snapshot.summary.id,
  };
}

/** Separate offline artifact; no evidence/report mutation, operation implementation or storage. */
export function createReproducerSession(
  input: unknown,
  fake: ReproducerFakeConfiguration,
  options: { readonly skepticReview?: unknown; readonly existingRun?: unknown } = {},
) {
  const prepared = prepare(input, options.skepticReview);
  const config = configure(fake);
  const replayKey = hash(
    JSON.stringify({
      binding: prepared.binding,
      identity,
      requestHash: prepared.request ? hash(JSON.stringify(prepared.request)) : null,
      provider: config.provider,
      model: config.model,
    }),
  );
  const existing = options.existingRun;
  if (
    existing !== undefined &&
    (!existing ||
      typeof existing !== "object" ||
      completedRuns.get(existing as ReproducerRun) !== replayKey)
  )
    throw new ReproducerAdmissionError("REPLAY_MISMATCH");
  let once: Promise<ReproducerRun> | undefined;
  async function execute(signal?: AbortSignal): Promise<ReproducerRun> {
    if (existing !== undefined) return existing as ReproducerRun;
    const start = performance.now();
    const id = (prefix: string) => {
      for (let n = 0; n < 3; n++) {
        const candidate = `${prefix}-${randomUUID()}`;
        if (!prepared.occupied.has(candidate)) {
          prepared.occupied.add(candidate);
          return candidate;
        }
      }
      throw new Error("HOST_ID_ALLOCATION_FAILED");
    };
    const audit: ReproducerAudit = {
      schemaVersion: 1,
      id: id("RA"),
      scanId: prepared.scanId,
      role: "Reproducer",
      executionMode: "injected-fake",
      provider: config.provider,
      model: config.model,
      policy: REPRODUCER_POLICY,
      ...identity,
      requestSchemaVersion: 1,
      responseSchemaVersion: 1,
      requestHash: null,
      responseHash: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedMs: 0,
      status: "skipped",
      calls: 0,
      acceptedIds: [],
      rejectedCount: 0,
      rejectedCountKnown: true,
      rejectionCodes: [],
      usage: null,
      outputTokenLimit: 768,
      timeoutMs: 20000,
      semanticRetries: 0,
    };
    const run: ReproducerRun = {
      schemaVersion: 1,
      id: id("RR"),
      sessionId: id("RS"),
      scanId: prepared.scanId,
      finalized: true,
      executionMode: "injected-fake",
      parent: prepared.binding,
      plans: [],
      audit,
      authorization: null,
      execution: {
        schemaVersion: 1,
        executionMode: "injected-fake",
        status: "not-requested",
        reason: null,
        calls: 0,
        startedAt: null,
        finishedAt: null,
        elapsedMs: 0,
        timeoutMs: 5000,
        responseHash: null,
        result: null,
      },
      startedAt: audit.startedAt,
      finishedAt: audit.startedAt,
      elapsedMs: 0,
      totalTimeoutMs: 25000,
    };
    const reject = (code: ReproducerAudit["rejectionCodes"][number]) => {
      audit.rejectionCodes = [code];
    };
    const plannerCancel = () => {
      audit.status = signal?.aborted ? "aborted" : "timeout";
      run.plans = [];
      audit.acceptedIds = [];
      audit.usage = null;
      reject(signal?.aborted ? "CANCELLED" : "DEADLINE");
    };
    // Separate races share the same total acceptance deadline and always remove their listeners.
    async function boundedAttempt(call: (signal: AbortSignal) => unknown, ms: number) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let aborted: (() => void) | undefined;
      let stopped: "abort" | "timeout" | null = null;
      const deadline = Math.min(start + L.totalMs, performance.now() + ms);
      try {
        const stop = new Promise<{ kind: "failure"; category: "abort" | "timeout" }>((resolve) => {
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
            Math.max(0, deadline - performance.now()),
          );
        });
        const invocation = Promise.resolve()
          .then(() => {
            if (signal?.aborted || controller.signal.aborted) {
              stopped = "abort";
              return { kind: "failure", category: "abort" };
            }
            if (performance.now() >= deadline) {
              stopped = "timeout";
              return { kind: "failure", category: "timeout" };
            }
            return call(controller.signal);
          })
          .catch(() => ({ kind: "failure", category: "transport-error" }));
        const value = await Promise.race([invocation, stop]);
        if (signal?.aborted) stopped = "abort";
        else if (performance.now() >= deadline) stopped = "timeout";
        return { value, stopped, deadline };
      } finally {
        clearTimeout(timer);
        if (aborted) signal?.removeEventListener("abort", aborted);
        controller.abort();
      }
    }
    if (!prepared.request) reject("PARENT_NOT_ELIGIBLE");
    else if (signal?.aborted) plannerCancel();
    else {
      audit.requestHash = hash(JSON.stringify(prepared.request));
      if (!config.planner) {
        audit.status = "configuration-failure";
        reject("PROVIDER_FAILURE");
      } else {
        try {
          const attempt = await boundedAttempt((s) => {
            audit.calls = 1;
            return config.planner?.(
              prepared.request as ReproducerRequest,
              Object.freeze({ signal: s }),
            );
          }, L.plannerMs);
          if (attempt.stopped) plannerCancel();
          else {
            const raw = JSON.parse(boundedJson(attempt.value, L.responseBytes));
            const envelope = ReproducerFakePlannerResultSchema.safeParse(raw);
            if (!envelope.success || (raw.kind === "response" && !Object.hasOwn(raw, "payload"))) {
              audit.status =
                Object.hasOwn(raw ?? {}, "usage") &&
                !ReproducerUsageSchema.safeParse(raw.usage).success
                  ? "limit-exceeded"
                  : "schema-failure";
              audit.rejectedCountKnown = false;
              reject(audit.status === "limit-exceeded" ? "USAGE_LIMIT" : "INVALID_PROVIDER_RESULT");
            } else if (envelope.data.kind === "failure") {
              audit.status = failures[envelope.data.category];
              reject("PROVIDER_FAILURE");
            } else {
              audit.usage = envelope.data.usage ?? null;
              const decoded = decodePayload(envelope.data.payload);
              audit.responseHash = decoded.responseHash;
              const p = ReproducerProposalSchema.safeParse(decoded.value);
              if (!p.success) {
                audit.status = "schema-failure";
                audit.rejectedCountKnown = false;
                reject("SCHEMA_INVALID");
              } else {
                const proposal = p.data.plans[0];
                let code: ReproducerAudit["rejectionCodes"][number] | undefined;
                if (proposal) {
                  const challenge = prepared.challenges.find((c) => c.id === proposal.challengeId);
                  if (!exportableText(proposal)) code = "TEXT_NOT_ALLOWED";
                  else if (!prepared.parent.claims.some((c) => c.id === proposal.claimId))
                    code = "UNAUTHORIZED_CLAIM";
                  else if (!challenge || challenge.claimId !== proposal.claimId)
                    code = "UNAUTHORIZED_CHALLENGE";
                  else if (proposal.evidenceIds.some((x) => !prepared.supplied.has(x)))
                    code = "UNAUTHORIZED_EVIDENCE";
                  else if (!REPRODUCER_OPERATIONS.some((o) => o.id === proposal.operationId))
                    code = "UNKNOWN_OPERATION";
                  if (!code) {
                    const plan: ReproducerPlan = {
                      ...proposal,
                      operationId: "fixture-document-repeat-v1",
                      id: id("RP"),
                      scanId: prepared.scanId,
                      runId: run.id,
                      createdAt: new Date().toISOString(),
                      plannedBy: "Reproducer",
                      provenance: "INFERRED",
                    };
                    run.plans = [plan];
                    audit.acceptedIds = [plan.id];
                  }
                }
                audit.status = code ? "no-valid-output" : "completed";
                if (code) {
                  audit.rejectedCount = 1;
                  reject(code);
                }
              }
            }
            if (signal?.aborted || performance.now() >= attempt.deadline) plannerCancel();
          }
        } catch (e) {
          run.plans = [];
          audit.acceptedIds = [];
          audit.usage = null;
          audit.status =
            e instanceof BoundaryError && e.code === "RESPONSE_LIMIT"
              ? "limit-exceeded"
              : "schema-failure";
          audit.responseHash = e instanceof BoundaryError ? (e.responseHash ?? null) : null;
          audit.rejectedCountKnown = false;
          reject(e instanceof BoundaryError ? e.code : "INVALID_PROVIDER_RESULT");
        }
      }
    }
    audit.finishedAt = new Date().toISOString();
    audit.elapsedMs = Math.max(0, performance.now() - start);
    const plan = run.plans[0];
    if (plan) {
      const e = run.execution;
      const executionStart = performance.now();
      e.startedAt = new Date().toISOString();
      if (signal?.aborted) {
        e.status = "aborted";
        e.reason = "CANCELLED";
      } else if (performance.now() - start >= L.totalMs) {
        e.status = "timeout";
        e.reason = "DEADLINE";
      } else if (!config.executor) {
        e.status = "configuration-failure";
        e.reason = "EXECUTOR_UNAVAILABLE";
      } else {
        try {
          const attempt = await boundedAttempt((s) => {
            const grant = issueReproducerAuthorization({
              runId: run.id,
              sessionId: run.sessionId,
              parentSnapshotHash: prepared.binding.snapshotHash,
              parentSkepticReviewHash: prepared.binding.skepticReviewHash,
              plan,
            });
            const consumed = grant.consume(grant.bindingHash);
            run.authorization = consumed.metadata;
            e.calls = 1; // Count the trusted-host attempt before invoking code, including synchronous throws.
            return config.executor?.(consumed.capability, Object.freeze({ signal: s }));
          }, L.executorMs);
          if (attempt.stopped) {
            e.status = e.calls
              ? "outcome-unknown"
              : attempt.stopped === "abort"
                ? "aborted"
                : "timeout";
            e.reason = attempt.stopped === "abort" ? "CANCELLED" : "DEADLINE";
          } else {
            const raw = boundedJson(attempt.value, L.executorBytes);
            const result = ReproducerFakeExecutorResultSchema.safeParse(JSON.parse(raw));
            if (!result.success || result.data.kind === "failure") {
              e.status = "outcome-unknown";
              e.reason = result.success ? "EXECUTOR_FAILURE" : "INVALID_EXECUTOR_RESULT";
            } else {
              e.status = "simulated-completed";
              e.responseHash = hash(raw);
              e.result = result.data.result;
            }
            if (signal?.aborted || performance.now() >= attempt.deadline) {
              e.status = "outcome-unknown";
              e.reason = signal?.aborted ? "CANCELLED" : "DEADLINE";
              e.responseHash = null;
              e.result = null;
            }
          }
        } catch (x) {
          e.status = "outcome-unknown";
          e.reason =
            x instanceof BoundaryError && x.code === "RESPONSE_LIMIT"
              ? "EXECUTOR_LIMIT"
              : "INVALID_EXECUTOR_RESULT";
          e.result = null;
          e.responseHash = null;
        }
      }
      e.finishedAt = new Date().toISOString();
      e.elapsedMs = Math.max(0, performance.now() - executionStart);
    }
    run.finishedAt = new Date().toISOString();
    run.elapsedMs = Math.max(0, performance.now() - start);
    const result = immutable(ReproducerRunSchema.parse(run));
    completedRuns.set(result, replayKey);
    return result;
  }
  return Object.freeze({
    run(options: { readonly signal?: AbortSignal } = {}) {
      once ??= execute(options.signal);
      return once;
    },
  });
}
