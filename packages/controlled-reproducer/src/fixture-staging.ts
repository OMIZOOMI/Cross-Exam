import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import {
  ControlledFixtureSyntheticApprovalSchema as ApprovalSchema,
  ControlledReproducerFakeResultSchema,
  ControlledFixtureIntentIdSchema as IdSchema,
  FIXTURE_STAGING_LIMITS as L,
  type ControlledFixtureLedger as Ledger,
  ControlledFixtureStagingLedgerSchema as LedgerSchema,
  ControlledFixtureDispatchMarkerSchema as MarkerSchema,
  type ControlledFixtureReceipt as Receipt,
  ControlledFixtureReviewReceiptSchema as ReceiptSchema,
  type ControlledFixtureRelease as Release,
  ControlledFixtureReproducerReleaseSchema as ReleaseSchema,
  ScanReportSchema,
  type ControlledFixtureTerminal as Terminal,
  ControlledFixtureStagingResultSchema as TerminalSchema,
} from "@crossexam/contracts";
import { boundedJson, hash, immutable } from "../../agents/src/provider";
import { attestControlledReproducerParent } from "../../agents/src/reproducer";
import { INPUT_SNAPSHOT_HASH } from "./fixture-parent";
import {
  BODY_HASH,
  FUTURE_PROOF_POLICY_HASH,
  fixedRunnerReview,
  invokeFixedRunner,
  REAL_MANIFEST_HASH,
  REAL_POLICY_HASH,
  REAL_SCHEMAS_HASH,
  RUNNER_CONFIG_HASH,
} from "./fixture-runner";
import { ControlledStore, ControlledStoreError as ErrorCode, type Fault } from "./storage";

export type FixtureStoreOptions = { directory: string; fault?: Fault; signal?: AbortSignal };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sha = (v: unknown) => hash(JSON.stringify(v));
class FixtureStore extends ControlledStore {
  constructor(options: FixtureStoreOptions) {
    super(path.join(path.resolve(options.directory), "controlled-fixture-v1"), options.fault);
  }
}
const decode = <T>(raw: string | null, schema: { parse(v: unknown): T }): T => {
  try {
    return schema.parse(JSON.parse(raw as string));
  } catch {
    throw new ErrorCode("STORE_CORRUPT");
  }
};
function authorizationHash(r: Release) {
  const { authorizationHash: _ignored, ...bound } = r;
  return sha(bound);
}
function intentHash(r: Release) {
  return sha({
    intentId: r.intentId,
    operationId: r.plan.operationId,
    fixtureKey: r.plan.fixtureKey,
    implementationCommit: r.implementationCommit,
    bindingHash: sha(r.binding),
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    storageDirectoryHash: r.storageDirectoryHash,
  });
}
function validateRelease(r: Release, store: FixtureStore) {
  fixedRunnerReview();
  if (
    r.fixtureManifestHash !== REAL_MANIFEST_HASH ||
    r.bodyHash !== BODY_HASH ||
    r.runnerConfigHash !== RUNNER_CONFIG_HASH ||
    r.policyHash !== REAL_POLICY_HASH ||
    r.schemasHash !== REAL_SCHEMAS_HASH ||
    r.futureProofPolicyHash !== FUTURE_PROOF_POLICY_HASH ||
    r.inputSnapshotHash !== INPUT_SNAPSHOT_HASH ||
    r.planHash !== sha(r.plan) ||
    r.intentHash !== intentHash(r) ||
    r.authorizationHash !== authorizationHash(r) ||
    r.storageDirectoryHash !== hash(store.directory) ||
    r.storageHostHash !== hash(hostname()) ||
    r.storageOwner !== process.getuid?.() ||
    r.runtimeRootManifestHash !== null ||
    r.chromiumBinaryHash !== null
  )
    throw new ErrorCode("BINDING_MISMATCH");
}
function review(r: Release): Receipt {
  return immutable(
    ReceiptSchema.parse({
      schemaVersion: 1,
      artifactKind: "controlled-fixture-pre-dispatch-review-v1",
      release: r,
      releaseHash: sha(r),
      approvalReady: false,
      blockers: [
        "RUNTIME_ARTIFACT_NOT_PINNED",
        "REAL_RUNNER_DISABLED",
        "OWNER_AUTHORITY_NOT_PROVISIONED",
      ],
    }),
  );
}
function terminal(
  r: Receipt,
  status: Terminal["status"],
  reason: Terminal["reason"],
  attempts: 0 | 1,
): Terminal {
  return immutable(
    TerminalSchema.parse({
      artifactKind: "controlled-fixture-staging-terminal-v1",
      releaseHash: r.releaseHash,
      receiptHash: sha(r),
      authorizationHash: r.release.authorizationHash,
      status,
      reason,
      attempts,
      testOnly: attempts === 1,
      provenance: status === "simulated-completed" ? "SIMULATED" : null,
      observation: null,
      finishedAt: new Date().toISOString(),
    }),
  );
}
async function finalize(store: FixtureStore, dir: string, ledger: Ledger, result: Terminal) {
  await store.publish(dir, "result.json", result, L.resultBytes);
  await store.publish(
    dir,
    "ledger.json",
    { ...ledger, state: "terminal", resultHash: sha(result) },
    L.metadataBytes,
  );
  return result;
}
async function load(store: FixtureStore, dir: string) {
  const releaseRaw = await store.read(dir, "release.json", L.releaseBytes);
  const release = decode(releaseRaw, ReleaseSchema);
  validateRelease(release, store);
  if (release.intentId !== path.basename(dir)) throw new ErrorCode("BINDING_MISMATCH");
  const ledgerRaw = await store.read(dir, "ledger.json", L.metadataBytes);
  const ledger = decode(ledgerRaw, LedgerSchema);
  const receipt = review(release);
  if (
    ledger.releaseHash !== hash(releaseRaw as string) ||
    ledger.releaseHash !== receipt.releaseHash ||
    ledger.receiptHash !== sha(receipt)
  )
    throw new ErrorCode("STORE_CORRUPT");
  const savedReceipt = await store.read(dir, "receipt.json", L.receiptBytes, true);
  if (
    savedReceipt !== null &&
    (!same(decode(savedReceipt, ReceiptSchema), receipt) ||
      hash(savedReceipt) !== ledger.receiptHash)
  )
    throw new ErrorCode("STORE_CORRUPT");
  const approvalRaw = await store.read(dir, "approval.json", L.metadataBytes, true);
  const markerRaw = await store.read(dir, "dispatch.json", L.metadataBytes, true);
  const resultRaw = await store.read(dir, "result.json", L.resultBytes, true);
  if (
    (ledger.approvalHash && approvalRaw === null) ||
    (ledger.dispatchHash && markerRaw === null) ||
    (ledger.resultHash && resultRaw === null)
  )
    throw new ErrorCode("STORE_CORRUPT");
  if (approvalRaw !== null) {
    const a = decode(approvalRaw, ApprovalSchema);
    if (
      a.receiptHash !== ledger.receiptHash ||
      a.releaseHash !== ledger.releaseHash ||
      Date.parse(a.approvedAt) < Date.parse(release.createdAt) ||
      Date.parse(a.approvedAt) >= Date.parse(release.expiresAt) ||
      (ledger.approvalHash && ledger.approvalHash !== hash(approvalRaw))
    )
      throw new ErrorCode("STORE_CORRUPT");
  }
  if (markerRaw !== null) {
    const m = decode(markerRaw, MarkerSchema);
    if (
      approvalRaw === null ||
      m.approvalHash !== hash(approvalRaw) ||
      m.authorizationHash !== release.authorizationHash ||
      m.releaseHash !== ledger.releaseHash ||
      m.receiptHash !== ledger.receiptHash ||
      Date.parse(m.dispatchedAt) < Date.parse(decode(approvalRaw, ApprovalSchema).approvedAt) ||
      Date.parse(m.dispatchedAt) >= Date.parse(release.expiresAt) ||
      (ledger.dispatchHash && ledger.dispatchHash !== hash(markerRaw)) ||
      (ledger.state === "terminal" && !ledger.dispatchHash)
    )
      throw new ErrorCode("STORE_CORRUPT");
  }
  const result = resultRaw === null ? null : decode(resultRaw, TerminalSchema);
  if (
    result &&
    (result.releaseHash !== ledger.releaseHash ||
      result.receiptHash !== ledger.receiptHash ||
      result.authorizationHash !== release.authorizationHash ||
      result.attempts !== (markerRaw ? 1 : 0) ||
      Date.parse(result.finishedAt) < Date.parse(release.createdAt) ||
      (result.reason === "expired" &&
        Date.parse(result.finishedAt) < Date.parse(release.expiresAt)) ||
      (ledger.resultHash && ledger.resultHash !== hash(resultRaw as string)) ||
      (markerRaw &&
        !ledger.dispatchHash &&
        (result.status !== "outcome-unknown" || result.reason !== "recovered")))
  )
    throw new ErrorCode("STORE_CORRUPT");
  return {
    release,
    ledger,
    receipt,
    approvalRaw,
    markerRaw,
    result,
    resultRaw,
    releaseRaw,
    ledgerRaw,
  };
}
/** Read only: no lock/receipt creation, no terminalization, no new authority or timestamp. */
export async function previewPendingFixture(intentId: string, options: FixtureStoreOptions) {
  IdSchema.parse(intentId);
  const store = new FixtureStore(options);
  const dir = path.join(store.directory, intentId);
  await store.privateDirectory(store.directory);
  await store.privateDirectory(dir);
  const state = await load(store, dir);
  if (
    state.releaseRaw !== (await store.read(dir, "release.json", L.releaseBytes)) ||
    state.ledgerRaw !== (await store.read(dir, "ledger.json", L.metadataBytes)) ||
    state.approvalRaw !== (await store.read(dir, "approval.json", L.metadataBytes, true)) ||
    state.markerRaw !== (await store.read(dir, "dispatch.json", L.metadataBytes, true)) ||
    state.resultRaw !== (await store.read(dir, "result.json", L.resultBytes, true))
  )
    throw new ErrorCode("STORE_BUSY");
  return immutable({
    state: state.result ? "terminal" : state.markerRaw ? "dispatch-consumed" : "pending-approval",
    receipt: state.receipt,
    receiptHash: sha(state.receipt),
    result: state.result,
  });
}
async function locked<T>(
  intentId: string,
  options: FixtureStoreOptions,
  fn: (s: FixtureStore, d: string) => Promise<T>,
) {
  IdSchema.parse(intentId);
  const store = new FixtureStore(options);
  const { dir, unlock } = await store.openRun(intentId, false);
  try {
    return await fn(store, dir);
  } finally {
    await unlock();
  }
}
export async function recoverPendingFixture(intentId: string, options: FixtureStoreOptions) {
  return locked(intentId, options, async (store, dir) => {
    const x = await load(store, dir);
    const ledger = { ...x.ledger };
    if (x.markerRaw) {
      ledger.dispatchHash = hash(x.markerRaw);
      ledger.approvalHash = hash(x.approvalRaw as string);
      ledger.state = "dispatched";
    }
    if (x.result) {
      if (x.ledger.state !== "terminal")
        await store.publish(
          dir,
          "ledger.json",
          { ...ledger, state: "terminal", resultHash: sha(x.result) },
          L.metadataBytes,
        );
      return x.result;
    }
    if (x.markerRaw)
      return finalize(store, dir, ledger, terminal(x.receipt, "outcome-unknown", "recovered", 1));
    return immutable({
      state: "pending-approval",
      receipt: x.receipt,
      receiptHash: sha(x.receipt),
    });
  });
}
/** Internal host handoff; not the operator API. Tests exercise counterfeit original objects here. */
export async function stageOriginalFixtureParent(
  parent: {
    report: unknown;
    sourceRun: unknown;
    sourceIdentity: { provider: string; model: string };
    skepticReview?: unknown;
  },
  intentId: string,
  implementationCommit: string,
  options: FixtureStoreOptions,
) {
  IdSchema.parse(intentId);
  if (options.signal?.aborted) throw new ErrorCode("BINDING_MISMATCH");
  const report = ScanReportSchema.parse(parent.report);
  const base = { ...report, claims: [], challenges: [], tribunalRuns: [] };
  if (
    sha(base) !== INPUT_SNAPSHOT_HASH ||
    parent.sourceIdentity.provider !== "owned-fixture-preflight-fake" ||
    parent.sourceIdentity.model !== "deterministic-v1"
  )
    throw new ErrorCode("BINDING_MISMATCH");
  const binding = attestControlledReproducerParent(
    parent.report,
    parent.sourceRun,
    parent.sourceIdentity,
    parent.skepticReview,
  );
  const store = new FixtureStore(options);
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  await store.privateDirectory(options.directory);
  const { dir, created, unlock } = await store.openRun(intentId, true);
  try {
    if (!created) throw new ErrorCode("BINDING_MISMATCH"); // Explicit preview/recovery, never generate a new source on replay.
    const createdAt = new Date().toISOString();
    const runId = `FR-${randomUUID()}`;
    const planId = `FP-${randomUUID()}`;
    const draft = ReleaseSchema.parse({
      schemaVersion: 1,
      kind: "controlled-fixture-release-v1",
      intentId,
      releaseId: `FL-${randomUUID()}`,
      runId,
      authorizationId: `FA-${randomUUID()}`,
      binding,
      plan: {
        id: planId,
        runId,
        sourcePlanId: binding.sourcePlanId,
        claimId: binding.claimId,
        challengeId: binding.challengeId,
        evidenceIds: binding.evidenceIds,
        operationId: "controlled-fixture-empty-navigation-v1",
        fixtureKey: "browser-empty-navigation-v1",
        relation: "lineage-only",
        claimTested: false,
        challengeResolved: false,
        provenance: "INFERRED",
        createdAt,
      },
      planHash: "0".repeat(64),
      intentHash: "0".repeat(64),
      authorizationHash: "0".repeat(64),
      implementationCommit,
      inputSnapshotHash: INPUT_SNAPSHOT_HASH,
      fixtureManifestHash: REAL_MANIFEST_HASH,
      bodyHash: BODY_HASH,
      runnerConfigHash: RUNNER_CONFIG_HASH,
      policyHash: REAL_POLICY_HASH,
      schemasHash: REAL_SCHEMAS_HASH,
      futureProofPolicyHash: FUTURE_PROOF_POLICY_HASH,
      runtimeRootManifestHash: null,
      chromiumBinaryHash: null,
      storageDirectoryHash: hash(store.directory),
      storageHostHash: hash(hostname()),
      storageOwner: process.getuid?.(),
      retentionPolicy: "owner-explicit-removal-no-auto-delete-v1",
      relation: "lineage-only",
      claimTested: false,
      challengeResolved: false,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + L.intentLifetimeMs).toISOString(),
    });
    draft.planHash = sha(draft.plan);
    draft.intentHash = intentHash(draft);
    draft.authorizationHash = authorizationHash(draft);
    const release = immutable(ReleaseSchema.parse(draft));
    validateRelease(release, store);
    const receipt = review(release);
    await store.publish(dir, "release.json", release, L.releaseBytes);
    await store.publish(
      dir,
      "ledger.json",
      {
        schemaVersion: 1,
        kind: "controlled-fixture-staging-ledger-v1",
        releaseHash: sha(release),
        receiptHash: sha(receipt),
        approvalHash: null,
        dispatchHash: null,
        resultHash: null,
        state: "pending-approval",
      },
      L.metadataBytes,
    );
    await store.point("pending-durable");
    await store.publish(dir, "receipt.json", receipt, L.receiptBytes);
    return receipt;
  } finally {
    await unlock();
  }
}
export async function closePendingFixture(
  intentId: string,
  action: "cancelled" | "expired" | "denied",
  options: FixtureStoreOptions,
) {
  if (!["cancelled", "expired", "denied"].includes(action)) throw new ErrorCode("BINDING_MISMATCH");
  return locked(intentId, options, async (store, dir) => {
    const x = await load(store, dir);
    if (x.result) return x.result;
    if (x.markerRaw) throw new ErrorCode("BINDING_MISMATCH");
    if (action === "expired" && Date.now() < Date.parse(x.release.expiresAt))
      throw new ErrorCode("BINDING_MISMATCH");
    return finalize(store, dir, x.ledger, terminal(x.receipt, "not-dispatched", action, 0));
  });
}
/** Manual-only real boundary. No authority loader is provisioned; no flag/data can enable it. */
export function requestManualFixtureDispatch(
  _intentId: string,
  _ownerAuthority: unknown,
  _options: FixtureStoreOptions,
): never {
  return invokeFixedRunner();
}

// Explicit offline synthetic authority seam, not exported by the package/operator entrypoint.
type TestApproval = ReturnType<typeof ApprovalSchema.parse>;
const synthetic = new WeakMap<object, { record: TestApproval; consumed: boolean }>();
export function mintSyntheticFixtureApproval(receipt: Receipt) {
  const cap = Object.freeze(Object.create(null));
  synthetic.set(cap, {
    record: ApprovalSchema.parse({
      kind: "synthetic-offline-approval-v1",
      testOnly: true,
      receiptHash: sha(receipt),
      releaseHash: receipt.releaseHash,
      decisionId: `TEST-${randomUUID()}`,
      approvedAt: new Date().toISOString(),
    }),
    consumed: false,
  });
  return cap;
}
export async function dispatchFixtureFakeForTest(
  intentId: string,
  approval: object,
  executor: (cap: object, options: { signal: AbortSignal }) => Promise<unknown>,
  options: FixtureStoreOptions,
) {
  return locked(intentId, options, async (store, dir) => {
    const x = await load(store, dir);
    if (x.result) return x.result;
    if (x.markerRaw) throw new ErrorCode("BINDING_MISMATCH");
    const grant = synthetic.get(approval);
    if (
      !grant ||
      grant.consumed ||
      grant.record.receiptHash !== x.ledger.receiptHash ||
      grant.record.releaseHash !== x.ledger.releaseHash ||
      Date.parse(grant.record.approvedAt) < Date.parse(x.release.createdAt) ||
      Date.parse(grant.record.approvedAt) >= Date.parse(x.release.expiresAt) ||
      Date.now() >= Date.parse(x.release.expiresAt)
    )
      throw new ErrorCode("BINDING_MISMATCH");
    if (options.signal?.aborted)
      return finalize(store, dir, x.ledger, terminal(x.receipt, "not-dispatched", "cancelled", 0));
    if (x.approvalRaw && !same(JSON.parse(x.approvalRaw), grant.record))
      throw new ErrorCode("BINDING_MISMATCH");
    grant.consumed = true;
    await store.publish(dir, "approval.json", grant.record, L.metadataBytes);
    const marker = MarkerSchema.parse({
      kind: "controlled-fixture-test-dispatch-v1",
      testOnly: true,
      releaseHash: x.ledger.releaseHash,
      receiptHash: x.ledger.receiptHash,
      approvalHash: sha(grant.record),
      authorizationHash: x.release.authorizationHash,
      attempts: 1,
      dispatchedAt: new Date().toISOString(),
    });
    await store.publish(dir, "dispatch.json", marker, L.metadataBytes);
    const ledger = {
      ...x.ledger,
      state: "dispatched" as const,
      approvalHash: sha(grant.record),
      dispatchHash: sha(marker),
    };
    await store.publish(dir, "ledger.json", ledger, L.metadataBytes);
    await store.point("dispatch-durable");
    const controller = new AbortController();
    let stop!: (v: "cancelled" | "deadline") => void;
    const stopped = new Promise<{ reason: "cancelled" | "deadline" }>((r) => {
      stop = (reason) => r({ reason });
    });
    const cancel = () => {
      controller.abort();
      stop("cancelled");
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      controller.abort();
      stop("deadline");
    }, L.executorMs);
    const started = performance.now();
    let result: Terminal;
    try {
      if (options.signal?.aborted) cancel();
      const value = await Promise.race([
        options.signal?.aborted
          ? stopped
          : Promise.resolve()
              .then(() =>
                executor(Object.freeze(Object.create(null)), { signal: controller.signal }),
              )
              .then(
                (value) => ({ value }),
                () => ({ reason: "executor-failure" as const }),
              ),
        stopped,
      ]);
      if (
        options.signal?.aborted ||
        performance.now() - started >= L.executorMs ||
        "reason" in value
      )
        result = terminal(
          x.receipt,
          "outcome-unknown",
          options.signal?.aborted ? "cancelled" : "reason" in value ? value.reason : "deadline",
          1,
        );
      else {
        try {
          ControlledReproducerFakeResultSchema.parse(
            JSON.parse(boundedJson(value.value, L.executorBytes)),
          );
          result = terminal(x.receipt, "simulated-completed", null, 1);
        } catch {
          result = terminal(x.receipt, "outcome-unknown", "invalid-output", 1);
        }
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      controller.abort();
    }
    await store.point("executor-finished");
    return finalize(store, dir, ledger, result);
  });
}
