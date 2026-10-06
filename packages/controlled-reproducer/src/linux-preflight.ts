import { createOwnedPreflightParent } from "./fixture-parent";
import { verifyOwnerDecision } from "./linux-authority";
import { verifySelectedLinuxHost } from "./linux-identity";
import {
  closeLinuxPending,
  previewLinuxPending,
  recoverLinuxPending,
  requestManualLinuxDispatch,
  stageLinuxOriginal,
} from "./linux-staging";

export type { ProtectedOwnerAuthority, ProtectedOwnerSigner } from "./linux-authority";
export { requestManualLinuxDispatch, verifySelectedLinuxHost };
/** Explicit selected host only. No inputs, targets, providers or keys supplied by models. */
export async function stageSelectedLinuxFixture(selection: unknown, intentId: string) {
  const p = await verifySelectedLinuxHost(selection);
  return stageLinuxOriginal(await createOwnedPreflightParent(), p, intentId);
}
export async function previewSelectedLinuxFixture(selection: unknown, intentId: string) {
  return previewLinuxPending(await verifySelectedLinuxHost(selection), intentId);
}
export async function recoverSelectedLinuxFixture(selection: unknown, intentId: string) {
  return recoverLinuxPending(await verifySelectedLinuxHost(selection), intentId);
}
export async function closeSelectedLinuxFixture(
  selection: unknown,
  intentId: string,
  action: "cancelled" | "expired" | "denied",
) {
  return closeLinuxPending(await verifySelectedLinuxHost(selection), intentId, action);
}
/** Signature validation interface only. The real protected-key provider is unprovisioned. */
export async function verifySelectedLinuxOwnerDecision(
  selection: unknown,
  intentId: string,
  record: unknown,
) {
  const pending = await previewSelectedLinuxFixture(selection, intentId);
  if (pending.state !== "pending-approval") throw new Error("LINUX_INTENT_NOT_PENDING");
  return verifyOwnerDecision(pending.receipt, record);
}
