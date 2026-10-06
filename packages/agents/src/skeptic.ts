import { randomUUID } from "node:crypto";
import {
  type Challenge,
  SKEPTIC_LIMITS as L,
  type ScanReport,
  ScanReportSchema,
  SKEPTIC_INSTRUCTIONS,
  SKEPTIC_POLICY,
  type SkepticAudit,
  SkepticFakeResultSchema,
  SkepticProposalSchema,
  type SkepticRequest,
  SkepticRequestSchema,
  type SkepticReview,
  SkepticReviewSchema,
  SkepticUsageSchema,
  skepticSchemas,
  TribunalIdSchema,
} from "@crossexam/contracts";
import { evidenceCatalog, roleView } from "./evidence-digest";
import { challengeKey, exportableText } from "./proposal-safety";
import { BoundaryError, boundedJson, decodePayload, hash, immutable } from "./provider";

/** Trusted injected host code, not a sandbox or an SDK/network adapter contract. */
export interface SkepticFakeProvider {
  run(request: SkepticRequest, options: { readonly signal: AbortSignal }): Promise<unknown>;
}
export interface SkepticFakeConfiguration {
  readonly executionMode: "injected-fake";
  readonly provider: string;
  readonly model: string;
  readonly adapter?: SkepticFakeProvider;
}
export class SkepticAdmissionError extends Error {
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
const schemas = skepticSchemas();
const identity = Object.freeze({
  requestSchemaHash: hash(JSON.stringify(schemas.request)),
  responseSchemaHash: hash(JSON.stringify(schemas.response)),
  policyHash: hash(
    JSON.stringify({
      policy: SKEPTIC_POLICY,
      limits: L,
      projection: "numeric-presence-only-v1",
      catalog: { inspected: 256, entries: 96, entryBytes: 4096, bytes: 96 * 1024 },
      semanticPolicy:
        "parent-only; same-claim-links; whole-structure-item-semantics; shared-normalized-challenge-dedup; shared-text-guard-v1",
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
/** Stable key order after schema normalization; arrays retain their observation order. */
export function normalizedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(normalizedJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => `${JSON.stringify(key)}:${normalizedJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const reportSnapshotHash = (report: ScanReport) => hash(normalizedJson(report));
function configure(input: SkepticFakeConfiguration): SkepticFakeConfiguration {
  const fail = () => {
    throw new SkepticAdmissionError("INVALID_CONFIGURATION");
  };
  const plainFields = (value: unknown, keys: string[]) => {
    if (
      !value ||
      typeof value !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.getOwnPropertySymbols(value).length
    )
      return fail();
    const fields = Object.getOwnPropertyDescriptors(value);
    if (
      Object.entries(fields).some(
        ([key, d]) => !keys.includes(key) || !d.enumerable || !("value" in d),
      )
    )
      return fail();
    return fields;
  };
  const fields = plainFields(input, ["executionMode", "provider", "model", "adapter"]);
  const provider = fields.provider?.value;
  const model = fields.model?.value;
  if (
    fields.executionMode?.value !== "injected-fake" ||
    !TribunalIdSchema.safeParse(provider).success ||
    !TribunalIdSchema.safeParse(model).success ||
    !exportableText([provider, model])
  )
    return fail();
  const adapter = fields.adapter?.value;
  const run = adapter === undefined ? undefined : plainFields(adapter, ["run"]).run?.value;
  if (adapter !== undefined && typeof run !== "function") return fail();
  return Object.freeze({
    executionMode: "injected-fake",
    provider,
    model,
    ...(run
      ? {
          adapter: Object.freeze({
            run: (request: SkepticRequest, options: { readonly signal: AbortSignal }) =>
              run.call(adapter, request, options),
          }),
        }
      : {}),
  });
}
function parentSnapshot(input: unknown): ScanReport {
  const parsed = ScanReportSchema.safeParse(input);
  if (!parsed.success) throw new SkepticAdmissionError("INVALID_PARENT");
  const snapshot = immutable(parsed.data);
  if (snapshot.summary.source !== "fixture") throw new SkepticAdmissionError("LIVE_NOT_ALLOWED");
  const parent = snapshot.tribunalRuns[0];
  if (!parent) throw new SkepticAdmissionError("MISSING_PARENT");
  const statuses = parent.agentRuns.map((a) => a.status);
  const expected = statuses.includes("aborted")
    ? "aborted"
    : statuses.every((s) => s === "completed")
      ? "completed"
      : parent.claims.length
        ? "partial"
        : "failed";
  if (
    parent.status !== expected ||
    !TribunalIdSchema.safeParse(snapshot.summary.id).success ||
    Date.parse(parent.finishedAt) < Date.parse(parent.startedAt) ||
    parent.agentRuns.some(
      (a) =>
        Date.parse(a.finishedAt) < Date.parse(a.startedAt) ||
        Date.parse(a.startedAt) < Date.parse(parent.startedAt) ||
        Date.parse(a.finishedAt) > Date.parse(parent.finishedAt) ||
        (a.calls === 1 && a.requestHash === null),
    )
  )
    throw new SkepticAdmissionError("INVALID_PARENT");
  for (const c of parent.claims)
    if (!exportableText([c.statement, c.scope, c.falsifier]))
      throw new SkepticAdmissionError("UNSAFE_PARENT_TEXT");
  for (const c of parent.challenges)
    if (!exportableText([c.question, c.missingEvidence ?? ""]))
      throw new SkepticAdmissionError("UNSAFE_PARENT_TEXT");
  if (
    !exportableText([
      snapshot.summary.id,
      parent.id,
      ...parent.authorizedEvidenceIds,
      ...parent.claims.map((c) => c.id),
      ...parent.challenges.map((c) => c.id),
    ])
  )
    throw new SkepticAdmissionError("UNSAFE_PARENT_TEXT");
  return snapshot;
}
function prepare(snapshot: ScanReport) {
  const parent = snapshot.tribunalRuns[0];
  if (!parent) throw new SkepticAdmissionError("MISSING_PARENT");
  const upstream = {
    status: parent.status,
    explorerStatus: parent.agentRuns[0].status,
    breakerStatus: parent.agentRuns[1].status,
  };
  const binding: SkepticReview["parent"] = {
    snapshotHash: reportSnapshotHash(snapshot),
    tribunalRunId: parent.id,
    authorizedEvidenceIds: [...parent.authorizedEvidenceIds],
    reviewedClaimIds: parent.claims.map((c) => c.id),
    reviewedChallengeIds: parent.challenges.map((c) => c.id),
  };
  const catalog = evidenceCatalog(snapshot);
  const authorized = new Set(parent.authorizedEvidenceIds);
  const evidence = catalog.evidence.filter((e) => authorized.has(e.id));
  const supplied = new Set(evidence.map((e) => e.id));
  if (
    [...parent.claims, ...parent.challenges].some((c) =>
      c.evidenceIds.some((id) => !supplied.has(id)),
    )
  )
    throw new SkepticAdmissionError("UNAVAILABLE_EVIDENCE");
  const skip = parent.status === "aborted" || parent.status === "failed" || !parent.claims.length;
  if (skip) return { parent, binding, upstream, request: null, supplied };
  const baseView = roleView(snapshot, "Explorer", {
    evidence,
    omittedEvidence: snapshot.evidence.length - evidence.length,
  });
  const parsed = SkepticRequestSchema.safeParse({
    schemaVersion: 1,
    role: "Skeptic",
    instructions: SKEPTIC_INSTRUCTIONS,
    maxOutputTokens: 1024,
    timeoutMs: 20000,
    semanticRetries: 0,
    view: {
      schemaVersion: 1,
      role: "Skeptic",
      dataTrust: baseView.dataTrust,
      layers: baseView.layers,
      limitations: [
        ...baseView.limitations,
        "Skeptic validation establishes admissibility, not truth or a verdict.",
        "Parent Breaker links are context, not evidence. Upstream failures remain limitations.",
      ],
      evidence,
      claims: parent.claims.map((c) => ({
        id: c.id,
        statement: c.statement,
        scope: c.scope,
        falsifier: c.falsifier,
        evidenceIds: c.evidenceIds,
        provenance: "INFERRED",
      })),
      challenges: parent.challenges.map((c) => ({
        id: c.id,
        claimId: c.claimId,
        category: c.category,
        question: c.question,
        evidenceIds: c.evidenceIds,
        ...(c.missingEvidence !== undefined ? { missingEvidence: c.missingEvidence } : {}),
        provenance: "INFERRED",
      })),
      upstream,
      omittedEvidence: snapshot.evidence.length - evidence.length,
    },
  });
  if (!parsed.success) throw new SkepticAdmissionError("VIEW_LIMIT");
  return { parent, binding, upstream, request: immutable(parsed.data), supplied };
}
function occupiedIds(snapshot: ScanReport): Set<string> {
  const parent = snapshot.tribunalRuns[0];
  return new Set([
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
      parent ? [parent, ...parent.claims, ...parent.challenges, ...parent.agentRuns] : [],
    ]
      .flat()
      .map((r) => r.id),
  ]);
}
function replay(
  existing: unknown,
  snapshot: ScanReport,
  prepared: ReturnType<typeof prepare>,
): SkepticReview {
  try {
    const r = SkepticReviewSchema.parse(JSON.parse(boundedJson(existing, L.reviewBytes)));
    const a = r.audit;
    const occupied = occupiedIds(snapshot);
    const meanings = new Set(prepared.parent.challenges.map(challengeKey));
    if (
      r.scanId !== snapshot.summary.id ||
      normalizedJson(r.parent) !== normalizedJson(prepared.binding) ||
      normalizedJson(r.upstream) !== normalizedJson(prepared.upstream) ||
      a.policyHash !== identity.policyHash ||
      a.requestSchemaHash !== identity.requestSchemaHash ||
      a.responseSchemaHash !== identity.responseSchemaHash ||
      (prepared.request
        ? a.requestHash !== hash(JSON.stringify(prepared.request)) &&
          !(a.calls === 0 && a.status === "aborted" && a.requestHash === null)
        : a.status !== "skipped") ||
      (!prepared.request && a.requestHash !== null) ||
      Date.parse(a.startedAt) < Date.parse(prepared.parent.finishedAt) ||
      !exportableText([a.provider, a.model])
    )
      throw new Error();
    for (const id of [r.id, a.id, ...r.challenges.map((c) => c.challenge.id)])
      if (occupied.has(id)) throw new Error();
    for (const entry of r.challenges) {
      const c = entry.challenge;
      if (
        c.evidenceIds.some((id) => !prepared.supplied.has(id)) ||
        entry.relatedChallengeIds.some(
          (id) => !prepared.parent.challenges.some((b) => b.id === id && b.claimId === c.claimId),
        ) ||
        !exportableText([c.question, c.missingEvidence ?? ""])
      )
        throw new Error();
      const meaning = challengeKey(c);
      if (meanings.has(meaning)) throw new Error();
      meanings.add(meaning);
    }
    return immutable(r);
  } catch {
    throw new SkepticAdmissionError("REPLAY_MISMATCH");
  }
}

/** Internal shared admission for downstream offline roles; performs no adapter call. */
export function admitOfflineReviewParent(input: unknown, existingReview?: unknown) {
  const snapshot = parentSnapshot(input);
  const prepared = prepare(snapshot);
  const review =
    existingReview === undefined ? undefined : replay(existingReview, snapshot, prepared);
  return Object.freeze({ snapshot, prepared, review });
}

/** A separate offline snapshot review. Never mutates ScanReport or the paid-call ledger. */
export function createSkepticSession(
  input: unknown,
  fakeProviderConfiguration: SkepticFakeConfiguration,
  existingReview?: unknown,
) {
  const snapshot = parentSnapshot(input);
  const configuration = configure(fakeProviderConfiguration);
  const prepared = prepare(snapshot);
  const original =
    existingReview === undefined ? undefined : replay(existingReview, snapshot, prepared);
  let once: Promise<SkepticReview> | undefined;
  const execute = async (signal?: AbortSignal): Promise<SkepticReview> => {
    if (original) return original;
    const start = performance.now();
    const occupied = occupiedIds(snapshot);
    const id = (prefix: string) => {
      for (let i = 0; i < 3; i++) {
        const candidate = `${prefix}-${randomUUID()}`;
        if (!occupied.has(candidate)) {
          occupied.add(candidate);
          return candidate;
        }
      }
      throw new Error("HOST_ID_ALLOCATION_FAILED");
    };
    const audit: SkepticAudit = {
      schemaVersion: 1,
      id: id("SA"),
      scanId: snapshot.summary.id,
      role: "Skeptic",
      executionMode: "injected-fake",
      provider: configuration.provider,
      model: configuration.model,
      policy: SKEPTIC_POLICY,
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
      acceptedIds: [],
      rejectedCount: 0,
      rejectedCountKnown: true,
      rejectionCodes: [],
      calls: 0,
      outputTokenLimit: 1024,
      timeoutMs: 20000,
      semanticRetries: 0,
    };
    const review: SkepticReview = {
      schemaVersion: 1,
      id: id("SR"),
      scanId: snapshot.summary.id,
      parent: prepared.binding,
      upstream: prepared.upstream,
      challenges: [],
      audit,
    };
    const reject = (code: SkepticAudit["rejectionCodes"][number], n = 0) => {
      audit.rejectedCount = Math.min(L.responseBytes, audit.rejectedCount + n);
      if (!audit.rejectionCodes.includes(code)) audit.rejectionCodes.push(code);
    };
    const cancel = (timedOut: boolean) => {
      audit.status = timedOut ? "timeout" : "aborted";
      review.challenges = [];
      audit.acceptedIds = [];
      audit.usage = null;
      reject(timedOut ? "DEADLINE" : "CANCELLED");
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let aborted: (() => void) | undefined;
    const controller = new AbortController();
    let timedOut = false;
    try {
      if (!prepared.request)
        reject(
          prepared.parent.status === "failed" || prepared.parent.status === "aborted"
            ? "PARENT_NOT_ELIGIBLE"
            : "NO_CLAIMS",
        );
      else if (signal?.aborted) cancel(false);
      else {
        const request = prepared.request;
        audit.requestHash = hash(JSON.stringify(request));
        if (!configuration.adapter) {
          audit.status = "configuration-failure";
          reject("PROVIDER_FAILURE");
        } else {
          const stop = new Promise<unknown>((resolve) => {
            aborted = () => {
              controller.abort();
              resolve({ kind: "failure", category: "abort" });
            };
            signal?.addEventListener("abort", aborted, { once: true });
            timer = setTimeout(
              () => {
                timedOut = true;
                controller.abort();
                resolve({ kind: "failure", category: "timeout" });
              },
              Math.max(0, L.timeoutMs - (performance.now() - start)),
            );
          });
          const invocation = Promise.resolve()
            .then(() => {
              if (controller.signal.aborted || signal?.aborted)
                return { kind: "failure", category: "abort" };
              if (performance.now() - start >= L.timeoutMs)
                return { kind: "failure", category: "timeout" };
              audit.calls = 1;
              return configuration.adapter?.run(
                request,
                Object.freeze({ signal: controller.signal }),
              );
            })
            .catch(() => ({ kind: "failure", category: "transport-error" }));
          const untrusted = await Promise.race([invocation, stop]);
          if (signal?.aborted || timedOut || performance.now() - start >= L.timeoutMs)
            cancel(!signal?.aborted);
          else {
            // Bound and copy the complete fake envelope before accessing any provider fields.
            const raw = JSON.parse(boundedJson(untrusted, L.responseBytes));
            const envelope = SkepticFakeResultSchema.safeParse(raw);
            const badUsage =
              raw &&
              Object.hasOwn(raw, "usage") &&
              !SkepticUsageSchema.safeParse(raw.usage).success;
            if (!envelope.success || (raw.kind === "response" && !Object.hasOwn(raw, "payload"))) {
              audit.status = badUsage ? "limit-exceeded" : "schema-failure";
              audit.rejectedCountKnown = false;
              reject(badUsage ? "USAGE_LIMIT" : "INVALID_PROVIDER_RESULT");
            } else {
              audit.usage = envelope.data.usage ?? null;
              if (
                audit.usage?.reasoningTokens != null &&
                audit.usage.outputTokens != null &&
                audit.usage.reasoningTokens > audit.usage.outputTokens
              ) {
                audit.status = "limit-exceeded";
                audit.usage = null;
                audit.rejectedCountKnown = false;
                reject("USAGE_LIMIT");
              } else if (envelope.data.kind === "failure") {
                audit.status = failures[envelope.data.category];
                reject("PROVIDER_FAILURE");
              } else {
                const decoded = decodePayload(envelope.data.payload);
                audit.responseHash = decoded.responseHash;
                const parsed = SkepticProposalSchema.safeParse(decoded.value);
                if (!parsed.success) {
                  const limited = parsed.error.issues.some(
                    (i) => i.code === "too_big" || (i.code === "custom" && i.params?.limit),
                  );
                  audit.status = limited ? "limit-exceeded" : "schema-failure";
                  const n =
                    decoded.value &&
                    typeof decoded.value === "object" &&
                    Array.isArray((decoded.value as Record<string, unknown>).challenges)
                      ? (decoded.value as { challenges: unknown[] }).challenges.length
                      : null;
                  audit.rejectedCountKnown = n !== null;
                  reject(limited ? "CANONICAL_LIMIT" : "SCHEMA_INVALID", n ?? 0);
                } else {
                  const keys = new Set(prepared.parent.challenges.map(challengeKey));
                  for (const p of parsed.data.challenges) {
                    if (!prepared.parent.claims.some((c) => c.id === p.claimId)) {
                      reject("UNAUTHORIZED_CLAIM", 1);
                      continue;
                    }
                    if (p.evidenceIds.some((id) => !prepared.supplied.has(id))) {
                      reject("UNAUTHORIZED_EVIDENCE", 1);
                      continue;
                    }
                    if (
                      p.relatedChallengeIds.some(
                        (id) =>
                          !prepared.parent.challenges.some(
                            (b) => b.id === id && b.claimId === p.claimId,
                          ),
                      )
                    ) {
                      reject("UNAUTHORIZED_RELATED_CHALLENGE", 1);
                      continue;
                    }
                    if (!exportableText([p.question, p.missingEvidence ?? ""])) {
                      reject("TEXT_NOT_ALLOWED", 1);
                      continue;
                    }
                    const key = challengeKey(p);
                    if (keys.has(key)) {
                      reject("DUPLICATE", 1);
                      continue;
                    }
                    const { relatedChallengeIds, ...proposal } = p;
                    const canonical: Challenge = {
                      ...proposal,
                      id: id("CH-S"),
                      scanId: snapshot.summary.id,
                      createdAt: new Date().toISOString(),
                      raisedBy: "Skeptic",
                      provenance: "INFERRED",
                      status: "open",
                    };
                    keys.add(key);
                    review.challenges.push({ challenge: canonical, relatedChallengeIds });
                    audit.acceptedIds.push(canonical.id);
                  }
                  if (review.challenges.length > 0) {
                    audit.status = audit.rejectedCount ? "partial-rejection" : "completed";
                  } else {
                    audit.status = audit.rejectedCount > 0 ? "no-valid-output" : "completed";
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      review.challenges = [];
      audit.acceptedIds = [];
      audit.status =
        error instanceof BoundaryError
          ? error.code === "RESPONSE_LIMIT"
            ? "limit-exceeded"
            : error.code === "MALFORMED_JSON"
              ? "malformed-output"
              : "schema-failure"
          : "schema-failure";
      audit.responseHash = error instanceof BoundaryError ? (error.responseHash ?? null) : null;
      audit.rejectedCountKnown = false;
      reject(error instanceof BoundaryError ? error.code : "INVALID_PROVIDER_RESULT");
    } finally {
      clearTimeout(timer);
      if (aborted) signal?.removeEventListener("abort", aborted);
      controller.abort();
      if (
        prepared.request &&
        (signal?.aborted || timedOut || performance.now() - start >= L.timeoutMs)
      )
        cancel(!signal?.aborted);
      audit.finishedAt = new Date().toISOString();
      audit.elapsedMs = Math.max(0, performance.now() - start);
    }
    return immutable(SkepticReviewSchema.parse(review));
  };
  return Object.freeze({
    run(options: { readonly signal?: AbortSignal } = {}) {
      once ??= execute(options.signal);
      return once;
    },
  });
}
