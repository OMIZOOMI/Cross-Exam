import { randomUUID } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  ControlledFixtureOwnerApprovalV2Schema as ApprovalSchema,
  ControlledFixtureIntentIdSchema,
  FIXTURE_STAGING_LIMITS,
  ControlledFixtureLinuxIntentSchema as IntentSchema,
  LINUX_PREFLIGHT_LIMITS as L,
  LinuxFixtureLedgerSchema as LedgerSchema,
  type LinuxLedger,
  type LinuxPreflight,
  type LinuxReceipt,
  type LinuxTerminal,
  LinuxFixtureTestDispatchSchema as MarkerSchema,
  ControlledFixtureLinuxReceiptSchema as ReceiptSchema,
  ControlledFixtureReproducerReleaseSchema as ReleaseSchema,
  ScanReportSchema,
  LinuxFixtureTerminalSchema as TerminalSchema,
} from "@crossexam/contracts";
import { hash, immutable } from "../../agents/src/provider";
import { attestControlledReproducerParent } from "../../agents/src/reproducer";
import { INPUT_SNAPSHOT_HASH } from "./fixture-parent";
import {
  consumeSyntheticOwnerDecision,
  expectedApprovalPayload,
  verifyOwnerDecision,
} from "./linux-authority";
import { assertOriginalLinuxPreflight } from "./linux-identity";
import { ControlledStore, type Fault } from "./storage";

const sha = (v: unknown) => hash(JSON.stringify(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export type LinuxStoreOptions = { fault?: Fault };
function storeFor(p: LinuxPreflight, options: LinuxStoreOptions) {
  return new ControlledStore(p.host.storagePath, options.fault);
}
function receipt(intent: ReturnType<typeof IntentSchema.parse>): LinuxReceipt {
  return immutable(
    ReceiptSchema.parse({
      schemaVersion: 1,
      artifactKind: "controlled-fixture-linux-review-v1",
      intent,
      intentHash: sha(intent),
      approvalReady: false,
      blockers: ["OWNER_AUTHORITY_NOT_PROVISIONED", "REAL_DISPATCH_DISABLED"],
    }),
  );
}
function authHash(r: ReturnType<typeof ReleaseSchema.parse>) {
  const { authorizationHash: _ignored, ...data } = r;
  return sha(data);
}
function intentBindingHash(r: ReturnType<typeof ReleaseSchema.parse>, p: LinuxPreflight) {
  return sha({
    intentId: r.intentId,
    preflightHash: sha(p),
    bindingHash: sha(r.binding),
    planHash: sha(r.plan),
    implementationCommit: r.implementationCommit,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    storageDirectoryHash: r.storageDirectoryHash,
    storageHostHash: r.storageHostHash,
  });
}
function decode<T>(raw: string | null, schema: { parse(v: unknown): T }): T {
  try {
    return schema.parse(JSON.parse(raw as string));
  } catch {
    throw new Error("LINUX_STORE_CORRUPT");
  }
}
async function load(p: LinuxPreflight, store: ControlledStore, id: string) {
  const dir = path.join(store.directory, id);
  await store.privateDirectory(store.directory);
  await store.privateDirectory(dir);
  for (const file of [store.directory, dir])
    if ((await lstat(file)).gid !== p.host.storageOwnerGid)
      throw new Error("LINUX_STORAGE_OWNER_MISMATCH");
  const raw = await store.read(dir, "intent.json", L.intentBytes);
  const i = decode(raw, IntentSchema);
  const r = i.release;
  if (
    !same(i.preflight, p) ||
    i.preflightHash !== sha(p) ||
    r.intentId !== id ||
    i.releaseHash !== sha(r) ||
    r.planHash !== sha(r.plan) ||
    r.intentHash !== intentBindingHash(r, p) ||
    r.authorizationHash !== authHash(r) ||
    r.inputSnapshotHash !== INPUT_SNAPSHOT_HASH
  )
    throw new Error("LINUX_INTENT_BINDING_MISMATCH");
  const review = receipt(i);
  const ledgerRaw = await store.read(dir, "ledger.json", L.metadataBytes);
  const ledger = decode(ledgerRaw, LedgerSchema);
  if (ledger.intentHash !== sha(i) || ledger.receiptHash !== sha(review))
    throw new Error("LINUX_STORE_CORRUPT");
  const receiptRaw = await store.read(dir, "receipt.json", L.receiptBytes, true);
  if (
    receiptRaw !== null &&
    (!same(decode(receiptRaw, ReceiptSchema), review) || hash(receiptRaw) !== sha(review))
  )
    throw new Error("LINUX_STORE_CORRUPT");
  const approvalRaw = await store.read(dir, "approval.json", L.approvalBytes, true);
  const markerRaw = await store.read(dir, "dispatch.json", L.metadataBytes, true);
  const resultRaw = await store.read(dir, "result.json", L.resultBytes, true);
  for (const [name, contents] of [
    ["intent.json", raw],
    ["ledger.json", ledgerRaw],
    ["receipt.json", receiptRaw],
    ["approval.json", approvalRaw],
    ["dispatch.json", markerRaw],
    ["result.json", resultRaw],
  ] as const)
    if (contents !== null && (await lstat(path.join(dir, name))).gid !== p.host.storageOwnerGid)
      throw new Error("LINUX_STORAGE_OWNER_MISMATCH");
  if (
    (ledger.approvalHash && approvalRaw === null) ||
    (ledger.dispatchHash && markerRaw === null) ||
    (ledger.resultHash && resultRaw === null)
  )
    throw new Error("LINUX_STORE_CORRUPT");
  if (approvalRaw !== null) {
    const a = decode(approvalRaw, ApprovalSchema);
    if (
      !same(
        a.payload,
        expectedApprovalPayload(review, a.payload.decisionId, a.payload.approvedAt),
      ) ||
      Date.parse(a.payload.approvedAt) < Date.parse(r.createdAt) ||
      Date.parse(a.payload.approvedAt) >= Date.parse(r.expiresAt) ||
      (ledger.approvalHash && ledger.approvalHash !== hash(approvalRaw))
    )
      throw new Error("LINUX_STORE_CORRUPT");
    if (!p.testOnly) await verifyOwnerDecision(review, a); // Unprovisioned real loader always fails closed.
  }
  if (markerRaw !== null) {
    const m = decode(markerRaw, MarkerSchema);
    if (
      !p.testOnly ||
      approvalRaw === null ||
      m.approvalHash !== hash(approvalRaw) ||
      m.intentHash !== ledger.intentHash ||
      m.receiptHash !== ledger.receiptHash ||
      m.authorizationHash !== r.authorizationHash ||
      Date.parse(m.dispatchedAt) <
        Date.parse(decode(approvalRaw, ApprovalSchema).payload.approvedAt) ||
      Date.parse(m.dispatchedAt) >= Date.parse(r.expiresAt) ||
      (ledger.dispatchHash && ledger.dispatchHash !== hash(markerRaw)) ||
      (ledger.state === "terminal" && (!ledger.dispatchHash || !ledger.approvalHash))
    )
      throw new Error("LINUX_STORE_CORRUPT");
  }
  const result = resultRaw === null ? null : decode(resultRaw, TerminalSchema);
  if (
    result &&
    (result.intentHash !== ledger.intentHash ||
      result.receiptHash !== ledger.receiptHash ||
      result.attempts !== (markerRaw ? 1 : 0) ||
      result.testOnly !== p.testOnly ||
      Date.parse(result.finishedAt) < Date.parse(r.createdAt) ||
      (result.reason === "expired" && Date.parse(result.finishedAt) < Date.parse(r.expiresAt)) ||
      (ledger.resultHash && ledger.resultHash !== hash(resultRaw as string)) ||
      (markerRaw && !ledger.dispatchHash && result.reason !== "recovered"))
  )
    throw new Error("LINUX_STORE_CORRUPT");
  return {
    dir,
    intent: i,
    review,
    ledger,
    result,
    raw,
    ledgerRaw,
    receiptRaw,
    approvalRaw,
    markerRaw,
    resultRaw,
  };
}
/** Only a freshly verified original identity and original Stage 16A object can stage. */
export async function stageLinuxOriginal(
  parent: {
    report: unknown;
    sourceRun: unknown;
    sourceIdentity: { provider: string; model: string };
    skepticReview?: unknown;
  },
  p: LinuxPreflight,
  id: string,
  options: LinuxStoreOptions = {},
  test = false,
) {
  assertOriginalLinuxPreflight(p, test);
  ControlledFixtureIntentIdSchema.parse(id);
  const report = ScanReportSchema.parse(parent.report);
  if (
    sha({ ...report, claims: [], challenges: [], tribunalRuns: [] }) !== INPUT_SNAPSHOT_HASH ||
    parent.sourceIdentity.provider !== "owned-fixture-preflight-fake" ||
    parent.sourceIdentity.model !== "deterministic-v1"
  )
    throw new Error("LINUX_PARENT_MISMATCH");
  const binding = attestControlledReproducerParent(
    parent.report,
    parent.sourceRun,
    parent.sourceIdentity,
    parent.skepticReview,
  );
  const store = storeFor(p, options);
  const { dir, created, unlock } = await store.openRun(id, true);
  try {
    if (!created) throw new Error("LINUX_INTENT_EXISTS");
    const createdAt = new Date().toISOString(),
      runId = `LFR-${randomUUID()}`;
    const r = ReleaseSchema.parse({
      schemaVersion: 1,
      kind: "controlled-fixture-release-v1",
      intentId: id,
      releaseId: `LFL-${randomUUID()}`,
      runId,
      authorizationId: `LFA-${randomUUID()}`,
      binding,
      plan: {
        id: `LFP-${randomUUID()}`,
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
      implementationCommit: p.implementationCommit,
      inputSnapshotHash: INPUT_SNAPSHOT_HASH,
      fixtureManifestHash: p.fixtureManifestHash,
      bodyHash: p.bodyHash,
      runnerConfigHash: p.configurationHash,
      policyHash: p.linuxPolicyHash,
      schemasHash: p.linuxSchemasHash,
      futureProofPolicyHash: p.futureProofPolicyHash,
      runtimeRootManifestHash: p.rootManifestHash,
      chromiumBinaryHash: p.chromiumBinaryHash,
      storageDirectoryHash: p.host.storagePathHash,
      storageHostHash: p.host.bindingHash,
      storageOwner: p.host.storageOwnerUid,
      retentionPolicy: "owner-explicit-removal-no-auto-delete-v1",
      relation: "lineage-only",
      claimTested: false,
      challengeResolved: false,
      createdAt,
      expiresAt: new Date(
        Date.parse(createdAt) + FIXTURE_STAGING_LIMITS.intentLifetimeMs,
      ).toISOString(),
    });
    r.planHash = sha(r.plan);
    r.intentHash = intentBindingHash(r, p);
    r.authorizationHash = authHash(r);
    const i = IntentSchema.parse({
      schemaVersion: 1,
      kind: "controlled-fixture-linux-intent-v1",
      preflight: p,
      preflightHash: sha(p),
      release: r,
      releaseHash: sha(r),
    });
    const review = receipt(i);
    await store.publish(dir, "intent.json", i, L.intentBytes);
    await store.publish(
      dir,
      "ledger.json",
      LedgerSchema.parse({
        kind: "controlled-fixture-linux-ledger-v1",
        intentHash: sha(i),
        receiptHash: sha(review),
        approvalHash: null,
        dispatchHash: null,
        resultHash: null,
        state: "pending-approval",
      }),
      L.metadataBytes,
    );
    await store.point("linux-pending-durable");
    await store.publish(dir, "receipt.json", review, L.receiptBytes);
    return review;
  } finally {
    await unlock();
  }
}
export async function previewLinuxPending(
  p: LinuxPreflight,
  id: string,
  options: LinuxStoreOptions = {},
  test = false,
) {
  assertOriginalLinuxPreflight(p, test);
  ControlledFixtureIntentIdSchema.parse(id);
  const store = storeFor(p, options),
    x = await load(p, store, id);
  for (const [file, raw, cap, optional] of [
    ["intent.json", x.raw, L.intentBytes, false],
    ["ledger.json", x.ledgerRaw, L.metadataBytes, false],
    ["receipt.json", x.receiptRaw, L.receiptBytes, true],
    ["approval.json", x.approvalRaw, L.approvalBytes, true],
    ["dispatch.json", x.markerRaw, L.metadataBytes, true],
    ["result.json", x.resultRaw, L.resultBytes, true],
  ] as const)
    if ((await store.read(x.dir, file, cap, optional)) !== raw) throw new Error("LINUX_STORE_BUSY");
  return immutable({
    state: x.result ? "terminal" : x.markerRaw ? "dispatch-consumed" : "pending-approval",
    receipt: x.review,
    receiptHash: sha(x.review),
    result: x.result,
  });
}
async function locked<T>(
  p: LinuxPreflight,
  id: string,
  options: LinuxStoreOptions,
  test: boolean,
  fn: (store: ControlledStore, x: Awaited<ReturnType<typeof load>>) => Promise<T>,
) {
  assertOriginalLinuxPreflight(p, test);
  ControlledFixtureIntentIdSchema.parse(id);
  const store = storeFor(p, options),
    { unlock } = await store.openRun(id, false);
  try {
    return await fn(store, await load(p, store, id));
  } finally {
    await unlock();
  }
}
function terminal(
  x: Awaited<ReturnType<typeof load>>,
  reason: LinuxTerminal["reason"],
  attempts: 0 | 1,
): LinuxTerminal {
  return immutable(
    TerminalSchema.parse({
      kind: "linux-fixture-staging-terminal-v1",
      intentHash: x.ledger.intentHash,
      receiptHash: x.ledger.receiptHash,
      status: attempts ? "outcome-unknown" : "not-dispatched",
      reason,
      attempts,
      testOnly: x.intent.preflight.testOnly,
      observation: null,
      executionAttestation: null,
      finishedAt: new Date().toISOString(),
    }),
  );
}
async function finalize(
  store: ControlledStore,
  x: Awaited<ReturnType<typeof load>>,
  ledger: LinuxLedger,
  result: LinuxTerminal,
) {
  await store.publish(x.dir, "result.json", result, L.resultBytes);
  await store.publish(
    x.dir,
    "ledger.json",
    { ...ledger, state: "terminal", resultHash: sha(result) },
    L.metadataBytes,
  );
  return result;
}
export async function recoverLinuxPending(
  p: LinuxPreflight,
  id: string,
  options: LinuxStoreOptions = {},
  test = false,
) {
  return locked(p, id, options, test, async (store, x) => {
    const ledger = { ...x.ledger };
    if (x.markerRaw) {
      ledger.approvalHash = hash(x.approvalRaw as string);
      ledger.dispatchHash = hash(x.markerRaw);
      ledger.state = "dispatched";
    }
    if (x.result) {
      if (x.ledger.state !== "terminal")
        await store.publish(
          x.dir,
          "ledger.json",
          { ...ledger, state: "terminal", resultHash: sha(x.result) },
          L.metadataBytes,
        );
      return x.result;
    }
    if (x.markerRaw) return finalize(store, x, ledger, terminal(x, "recovered", 1));
    return immutable({ state: "pending-approval", receipt: x.review, receiptHash: sha(x.review) });
  });
}
export async function closeLinuxPending(
  p: LinuxPreflight,
  id: string,
  action: "cancelled" | "expired" | "denied",
  options: LinuxStoreOptions = {},
  test = false,
) {
  if (!["cancelled", "expired", "denied"].includes(action))
    throw new Error("LINUX_TERMINAL_ACTION_INVALID");
  return locked(p, id, options, test, async (store, x) => {
    if (x.result) return x.result;
    if (x.markerRaw) throw new Error("LINUX_DISPATCH_CONSUMED");
    if (action === "expired" && Date.now() < Date.parse(x.intent.release.expiresAt))
      throw new Error("LINUX_INTENT_NOT_EXPIRED");
    return finalize(store, x, x.ledger, terminal(x, action, 0));
  });
}
/** Synthetic proof of future marker ordering only; never uses the real runner. */
export async function consumeLinuxDecisionForTest(
  p: LinuxPreflight,
  id: string,
  cap: object,
  options: LinuxStoreOptions = {},
) {
  if (!p.testOnly) throw new Error("TEST_PREFLIGHT_REQUIRED");
  const store = storeFor(p, options);
  await store.privateDirectory(store.directory);
  const unlockDecisions = await store.lock(store.directory, "decisions.lock");
  try {
    return await locked(p, id, options, true, async (store, x) => {
      if (x.result) return x.result;
      if (x.markerRaw || x.approvalRaw) throw new Error("OWNER_DECISION_ALREADY_RECORDED");
      const a = consumeSyntheticOwnerDecision(cap, x.review);
      const dirs = (await readdir(store.directory, { withFileTypes: true })).filter((d) =>
        d.isDirectory(),
      );
      if (dirs.length > L.intents) throw new Error("LINUX_STORE_CAPACITY");
      for (const d of dirs) {
        const raw = await store.read(
          path.join(store.directory, d.name),
          "approval.json",
          L.approvalBytes,
          true,
        );
        if (raw !== null && decode(raw, ApprovalSchema).payload.decisionId === a.payload.decisionId)
          throw new Error("OWNER_DECISION_REPLAYED");
      }
      await store.publish(x.dir, "approval.json", a, L.approvalBytes);
      const marker = MarkerSchema.parse({
        kind: "linux-fixture-synthetic-dispatch-v1",
        testOnly: true,
        intentHash: x.ledger.intentHash,
        receiptHash: x.ledger.receiptHash,
        approvalHash: sha(a),
        authorizationHash: x.intent.release.authorizationHash,
        attempts: 1,
        dispatchedAt: new Date().toISOString(),
      });
      await store.publish(x.dir, "dispatch.json", marker, L.metadataBytes);
      const ledger = {
        ...x.ledger,
        state: "dispatched" as const,
        approvalHash: sha(a),
        dispatchHash: sha(marker),
      };
      await store.publish(x.dir, "ledger.json", ledger, L.metadataBytes);
      await store.point("linux-dispatch-durable"); // No worker/fixture/proxy/browser invocation follows.
      return finalize(
        store,
        x,
        ledger,
        terminal({ ...x, markerRaw: JSON.stringify(marker) }, "synthetic-consumed", 1),
      );
    });
  } finally {
    await unlockDecisions();
  }
}
/** No owner decision, flag, push or restart can enable actual dispatch in this stage. */
export function requestManualLinuxDispatch(): never {
  throw new Error("REAL_DISPATCH_DISABLED");
}
