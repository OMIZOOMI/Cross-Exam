import {
  ControlledFixtureOwnerApprovalV2Schema,
  LINUX_PREFLIGHT_LIMITS,
  type LinuxApproval,
  LinuxOwnerApprovalPayloadSchema,
  type LinuxReceipt,
  ProtectedApprovalKeySchema,
  type SelectedLinuxHost,
} from "@crossexam/contracts";
import { boundedJson, hash, immutable } from "../../agents/src/provider";

/** Future reviewed host-local OS/TPM adapter. No private key or signing-file interface. */
export interface ProtectedOwnerAuthority {
  publicIdentity(signal: AbortSignal): Promise<SelectedLinuxHost["approvalKey"]>;
  verifyCanonicalPayload(
    bytes: Uint8Array,
    signature: string,
    signal: AbortSignal,
  ): Promise<boolean>;
}
export interface ProtectedOwnerSigner extends ProtectedOwnerAuthority {
  signCanonicalPayload(bytes: Uint8Array, signal: AbortSignal): Promise<string>;
}
const DOMAIN = "CrossExam/owner-controlled-fixture-decision/v2\n";
const sha = (v: unknown) => hash(JSON.stringify(v));
const grants = new WeakMap<
  object,
  { approval: LinuxApproval; receiptHash: string; consumed: boolean; testOnly: boolean }
>();
/** A hash/JSON record is data. Only the reviewed protected backend may verify its signature. */
export function canonicalApprovalBytes(payload: unknown) {
  return new TextEncoder().encode(
    DOMAIN +
      JSON.stringify(
        LinuxOwnerApprovalPayloadSchema.parse(
          JSON.parse(boundedJson(payload, LINUX_PREFLIGHT_LIMITS.approvalBytes)),
        ),
      ),
  );
}
export function expectedApprovalPayload(
  receipt: LinuxReceipt,
  decisionId: string,
  approvedAt: string,
) {
  const i = receipt.intent,
    r = i.release,
    p = i.preflight;
  return LinuxOwnerApprovalPayloadSchema.parse({
    schemaVersion: 2,
    kind: "controlled-fixture-owner-decision-v2",
    decisionId,
    receiptHash: sha(receipt),
    releaseHash: i.releaseHash,
    intentHash: receipt.intentHash,
    linuxPreflightHash: i.preflightHash,
    implementationCommit: p.implementationCommit,
    futureProofPolicyHash: p.futureProofPolicyHash,
    linuxPolicyHash: p.linuxPolicyHash,
    hostBindingHash: p.host.bindingHash,
    storagePathHash: p.host.storagePathHash,
    storageOwnerUid: p.host.storageOwnerUid,
    storageOwnerGid: p.host.storageOwnerGid,
    operationId: r.plan.operationId,
    fixtureKey: r.plan.fixtureKey,
    key: p.selection.approvalKey,
    approvedAt,
    expiresAt: r.expiresAt,
  });
}
async function verified(
  receipt: LinuxReceipt,
  untrusted: unknown,
  backend: ProtectedOwnerAuthority,
  testOnly: boolean,
) {
  const record = ControlledFixtureOwnerApprovalV2Schema.parse(
    JSON.parse(boundedJson(untrusted, LINUX_PREFLIGHT_LIMITS.approvalBytes)),
  );
  const r = receipt.intent.release;
  if (
    Date.parse(record.payload.approvedAt) < Date.parse(r.createdAt) ||
    Date.parse(record.payload.approvedAt) > Date.now() ||
    Date.now() >= Date.parse(r.expiresAt) ||
    record.payload.expiresAt !== r.expiresAt ||
    JSON.stringify(record.payload) !==
      JSON.stringify(
        expectedApprovalPayload(receipt, record.payload.decisionId, record.payload.approvedAt),
      )
  )
    throw new Error("OWNER_APPROVAL_BINDING_MISMATCH");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async () => {
      const identity = ProtectedApprovalKeySchema.parse(
        await backend.publicIdentity(controller.signal),
      );
      if (
        controller.signal.aborted ||
        JSON.stringify(identity) !== JSON.stringify(record.payload.key) ||
        (await backend.verifyCanonicalPayload(
          canonicalApprovalBytes(record.payload),
          record.signature,
          controller.signal,
        )) !== true
      )
        throw new Error("OWNER_SIGNATURE_INVALID");
    })();
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("OWNER_SIGNATURE_INVALID"));
        }, LINUX_PREFLIGHT_LIMITS.authorityTimeoutMs);
      }),
    ]);
  } catch {
    throw new Error("OWNER_SIGNATURE_INVALID");
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
  const cap = Object.freeze(Object.create(null));
  grants.set(cap, {
    approval: immutable(record),
    receiptHash: sha(receipt),
    consumed: false,
    testOnly,
  });
  return cap;
}
/** Deliberately unprovisioned. No key provider, key files, environment, IPC or credential access. */
export function loadProtectedOwnerAuthority(): never {
  throw new Error("OWNER_AUTHORITY_NOT_PROVISIONED");
}
export async function verifyOwnerDecision(receipt: LinuxReceipt, record: unknown) {
  if (receipt.intent.preflight.testOnly) throw new Error("SYNTHETIC_NOT_OWNER_AUTHORITY");
  return verified(receipt, record, loadProtectedOwnerAuthority(), false);
}
/** Unit-only facade: cannot verify a production receipt or mint production authority. */
export async function verifyOwnerDecisionForTest(
  receipt: LinuxReceipt,
  record: unknown,
  backend: ProtectedOwnerAuthority,
) {
  if (!receipt.intent.preflight.testOnly) throw new Error("TEST_RECEIPT_REQUIRED");
  return verified(receipt, record, backend, true);
}
export function consumeSyntheticOwnerDecision(cap: object, receipt: LinuxReceipt) {
  const g = grants.get(cap);
  if (
    !g?.testOnly ||
    g.consumed ||
    g.receiptHash !== sha(receipt) ||
    Date.now() >= Date.parse(g.approval.payload.expiresAt)
  )
    throw new Error("OWNER_DECISION_INVALID_OR_REPLAYED");
  g.consumed = true;
  return g.approval;
}
