import { randomUUID } from "node:crypto";
import {
  ControlledReproducerDispatchSchema,
  ControlledReproducerFakeResultSchema,
  ControlledReproducerIntentSchema,
  type ControlledReproducerLedger,
  ControlledReproducerLedgerSchema,
  ControlledReproducerPlanSchema,
  type ControlledReproducerRelease,
  ControlledReproducerReleaseSchema,
  type ControlledReproducerRun,
  ControlledReproducerRunSchema,
  CONTROLLED_REPRODUCER_LIMITS as L,
} from "@crossexam/contracts";
import { boundedJson, hash, immutable } from "../../agents/src/provider";
import { attestControlledReproducerParent } from "../../agents/src/reproducer";
import { CONTROLLED_POLICY_HASH, FIXTURE_MANIFEST_HASH } from "./fixture-manifest";
import { ControlledStore, ControlledStoreError, type Fault } from "./storage";

export { ControlledStoreError } from "./storage";

type Options = { directory: string; signal?: AbortSignal; fault?: Fault };
type Executor = {
  executionMode: "injected-fake";
  execute(capability: object, options: { signal: AbortSignal }): Promise<unknown>;
};
const capabilities = new WeakSet<object>();
/** Inspection gives only a fixed ID, never a URL/path, caller parameters or browser handle. */
export function inspectOfflineCapability(capability: object) {
  if (!capabilities.has(capability)) throw new ControlledStoreError("BINDING_MISMATCH");
  return "controlled-fixture-empty-navigation-v1" as const;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function parse<T>(raw: string | null, schema: { parse(v: unknown): T }): T {
  try {
    return schema.parse(JSON.parse(raw as string));
  } catch {
    throw new ControlledStoreError("STORE_CORRUPT");
  }
}
function authorizationHash(
  r: Pick<
    ControlledReproducerRelease,
    | "authorizationId"
    | "runId"
    | "planId"
    | "planHash"
    | "intentHash"
    | "binding"
    | "fixtureManifestHash"
    | "policyHash"
  >,
) {
  return hash(
    JSON.stringify({
      authorizationId: r.authorizationId,
      runId: r.runId,
      planId: r.planId,
      planHash: r.planHash,
      intentHash: r.intentHash,
      sourceRunHash: r.binding.sourceRunHash,
      parentSnapshotHash: r.binding.parent.snapshotHash,
      parentSkepticReviewHash: r.binding.parent.skepticReviewHash,
      fixtureManifestHash: r.fixtureManifestHash,
      policyHash: r.policyHash,
    }),
  );
}
function validateRelease(r: ControlledReproducerRelease) {
  if (
    r.policyHash !== CONTROLLED_POLICY_HASH ||
    r.fixtureManifestHash !== FIXTURE_MANIFEST_HASH ||
    r.planHash !== hash(JSON.stringify(r.plan)) ||
    r.intentHash !== hash(JSON.stringify(r.intent)) ||
    r.authorizationBindingHash !== authorizationHash(r)
  )
    throw new ControlledStoreError("BINDING_MISMATCH");
}
function receipt(
  release: ControlledReproducerRelease,
  status: ControlledReproducerRun["status"],
  attempts: 0 | 1,
  reason: ControlledReproducerRun["reason"],
  simulated: ControlledReproducerRun["simulated"] = null,
  durationMs: number | null = null,
) {
  return immutable(
    ControlledReproducerRunSchema.parse({
      schemaVersion: 1,
      id: release.runId,
      executionMode: "injected-fake",
      testOnly: true,
      release,
      releaseHash: hash(JSON.stringify(release)),
      relation: "lineage-only",
      claimTested: false,
      challengeResolved: false,
      status,
      attempts,
      reason,
      observation: null,
      simulated,
      durationMs,
      finishedAt: new Date().toISOString(),
    }),
  );
}
async function finalize(
  store: ControlledStore,
  dir: string,
  ledger: ControlledReproducerLedger,
  result: ControlledReproducerRun,
) {
  await store.publish(dir, "result.json", result, L.resultBytes);
  await store.publish(
    dir,
    "ledger.json",
    { ...ledger, complete: true, resultHash: hash(JSON.stringify(result)) },
    L.ledgerBytes,
  );
  return result;
}
async function recoverLocked(
  store: ControlledStore,
  dir: string,
  expected?: { intent: unknown; binding: unknown },
) {
  const rawRelease = await store.read(dir, "release.json", L.releaseBytes);
  const release = parse(rawRelease, ControlledReproducerReleaseSchema);
  validateRelease(release);
  if (
    expected &&
    (!same(expected.intent, release.intent) || !same(expected.binding, release.binding))
  )
    throw new ControlledStoreError("BINDING_MISMATCH");
  const ledger = parse(
    await store.read(dir, "ledger.json", L.ledgerBytes),
    ControlledReproducerLedgerSchema,
  );
  if (ledger.releaseHash !== hash(rawRelease as string))
    throw new ControlledStoreError("STORE_CORRUPT");
  const markerRaw = await store.read(dir, "dispatch.json", L.markerBytes, true);
  const dispatchRecorded = ledger.dispatchHash !== null;
  if (markerRaw === null && ledger.dispatchHash) throw new ControlledStoreError("STORE_CORRUPT");
  if (markerRaw !== null) {
    if (ledger.complete && !dispatchRecorded) throw new ControlledStoreError("STORE_CORRUPT");
    const marker = parse(markerRaw, ControlledReproducerDispatchSchema);
    if (
      marker.releaseHash !== ledger.releaseHash ||
      marker.authorizationId !== release.authorizationId ||
      marker.authorizationBindingHash !== release.authorizationBindingHash ||
      Date.parse(marker.dispatchedAt) < Date.parse(release.createdAt) ||
      (ledger.dispatchHash && ledger.dispatchHash !== hash(markerRaw))
    )
      throw new ControlledStoreError("STORE_CORRUPT");
    ledger.dispatchHash = hash(markerRaw);
  }
  const rawResult = await store.read(dir, "result.json", L.resultBytes, true);
  if (rawResult !== null) {
    const result = parse(rawResult, ControlledReproducerRunSchema);
    if (
      !same(result.release, release) ||
      result.releaseHash !== ledger.releaseHash ||
      result.attempts !== (markerRaw ? 1 : 0) ||
      (markerRaw !== null &&
        !dispatchRecorded &&
        (result.status !== "outcome-unknown" || result.reason !== "recovered")) ||
      (ledger.resultHash && ledger.resultHash !== hash(rawResult))
    )
      throw new ControlledStoreError("STORE_CORRUPT");
    if (!ledger.complete)
      await store.publish(
        dir,
        "ledger.json",
        { ...ledger, complete: true, resultHash: hash(rawResult) },
        L.ledgerBytes,
      );
    return immutable(result);
  }
  if (ledger.complete || ledger.resultHash) throw new ControlledStoreError("STORE_CORRUPT");
  return finalize(
    store,
    dir,
    ledger,
    receipt(
      release,
      markerRaw ? "outcome-unknown" : "not-dispatched",
      markerRaw ? 1 : 0,
      "recovered",
    ),
  );
}
/** Provider/browser-free recovery only. It cannot promote, dispatch or make a new reservation. */
export async function recoverControlledReproducer(
  intentId: string,
  options: Pick<Options, "directory" | "fault">,
) {
  ControlledReproducerIntentSchema.shape.intentId.parse(intentId);
  const store = new ControlledStore(options.directory, options.fault);
  const { dir, unlock } = await store.openRun(intentId, false);
  try {
    return await recoverLocked(store, dir);
  } finally {
    await unlock();
  }
}
/** Offline-only entry: no actual fixture implementation or real-operation admission exists. */
export async function runOfflineControlledReproducer(
  input: {
    report: unknown;
    sourceRun: unknown;
    skepticReview?: unknown;
    sourceIdentity: { provider: string; model: string };
    intent: unknown;
  },
  executor: Executor | undefined,
  options: Options,
) {
  const intent = ControlledReproducerIntentSchema.parse(input.intent);
  const binding = attestControlledReproducerParent(
    input.report,
    input.sourceRun,
    input.sourceIdentity,
    input.skepticReview,
  );
  if (
    executor &&
    (executor.executionMode !== "injected-fake" || typeof executor.execute !== "function")
  )
    throw new ControlledStoreError("BINDING_MISMATCH");
  const store = new ControlledStore(options.directory, options.fault);
  const { dir, created, unlock } = await store.openRun(intent.intentId, true);
  try {
    if (!created) return await recoverLocked(store, dir, { intent, binding });
    const runId = `CR-${randomUUID()}`;
    const planId = `CP-${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const plan = ControlledReproducerPlanSchema.parse({
      id: planId,
      runId,
      sourcePlanId: binding.sourcePlanId,
      claimId: binding.claimId,
      challengeId: binding.challengeId,
      evidenceIds: binding.evidenceIds,
      operationId: intent.operationId,
      fixtureKey: intent.fixtureKey,
      relation: "lineage-only",
      claimTested: false,
      challengeResolved: false,
      provenance: "INFERRED",
      createdAt,
    });
    const unsigned = {
      schemaVersion: 1 as const,
      kind: "offline-test-reservation" as const,
      intent,
      binding,
      runId,
      planId,
      plan,
      planHash: hash(JSON.stringify(plan)),
      intentHash: hash(JSON.stringify(intent)),
      authorizationId: `CA-${randomUUID()}`,
      fixtureManifestHash: FIXTURE_MANIFEST_HASH,
      policyHash: CONTROLLED_POLICY_HASH,
      createdAt,
    };
    const release = immutable(
      ControlledReproducerReleaseSchema.parse({
        ...unsigned,
        authorizationBindingHash: authorizationHash(unsigned),
      }),
    );
    validateRelease(release);
    await store.publish(dir, "release.json", release, L.releaseBytes);
    const ledger: ControlledReproducerLedger = {
      schemaVersion: 1,
      releaseHash: hash(JSON.stringify(release)),
      dispatchHash: null,
      resultHash: null,
      complete: false,
    };
    await store.publish(dir, "ledger.json", ledger, L.ledgerBytes);
    await store.point("reserved");
    if (options.signal?.aborted || !executor)
      return await finalize(
        store,
        dir,
        ledger,
        receipt(
          release,
          options.signal?.aborted ? "aborted" : "not-dispatched",
          0,
          options.signal?.aborted ? "cancelled" : "executor-unavailable",
        ),
      );
    const marker = ControlledReproducerDispatchSchema.parse({
      schemaVersion: 1,
      releaseHash: ledger.releaseHash,
      authorizationId: release.authorizationId,
      authorizationBindingHash: release.authorizationBindingHash,
      dispatchedAt: new Date().toISOString(),
      attempts: 1,
      testOnly: true,
    });
    await store.publish(dir, "dispatch.json", marker, L.markerBytes);
    ledger.dispatchHash = hash(JSON.stringify(marker));
    await store.publish(dir, "ledger.json", ledger, L.ledgerBytes);
    await store.point("dispatch-durable");
    // Cancellation after marker consumption is conservative: no in-place redispatch.
    if (options.signal?.aborted)
      return await finalize(
        store,
        dir,
        ledger,
        receipt(release, "outcome-unknown", 1, "cancelled"),
      );
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop!: (value: "cancelled" | "deadline") => void;
    const stopped = new Promise<"cancelled" | "deadline">((done) => {
      stop = done;
    });
    const cancel = () => {
      controller.abort();
      stop("cancelled");
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    const capability = Object.freeze(Object.create(null));
    capabilities.add(capability);
    const start = performance.now();
    timer = setTimeout(() => {
      controller.abort();
      stop("deadline");
    }, L.executorMs);
    let result: ControlledReproducerRun;
    try {
      const value = await Promise.race([
        Promise.resolve()
          .then(() => executor.execute(capability, { signal: controller.signal }))
          .then(
            (value) => ({ value }),
            () => ({ failure: true }),
          ),
        stopped.then((reason) => ({ reason })),
      ]);
      const elapsed = performance.now() - start;
      const duration = elapsed <= 30000 ? Math.max(0, elapsed) : null;
      if (options.signal?.aborted || elapsed >= L.executorMs || "reason" in value)
        result = receipt(
          release,
          "outcome-unknown",
          1,
          options.signal?.aborted ? "cancelled" : "deadline",
          null,
          duration,
        );
      else if ("failure" in value)
        result = receipt(release, "outcome-unknown", 1, "executor-failure", null, duration);
      else {
        try {
          const parsed = ControlledReproducerFakeResultSchema.parse(
            JSON.parse(boundedJson(value.value, L.executorBytes)),
          );
          result = receipt(release, "completed", 1, null, parsed, duration);
        } catch {
          result = receipt(release, "outcome-unknown", 1, "invalid-output", null, duration);
        }
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      controller.abort();
      capabilities.delete(capability);
    }
    await store.point("executor-finished");
    return await finalize(store, dir, ledger, result);
  } finally {
    await unlock();
  }
}
