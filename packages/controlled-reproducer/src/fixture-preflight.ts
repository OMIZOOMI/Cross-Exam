import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createOwnedPreflightParent } from "./fixture-parent";
import { fixedRunnerReview } from "./fixture-runner";
import {
  type FixtureStoreOptions,
  previewPendingFixture,
  stageOriginalFixtureParent,
} from "./fixture-staging";

export {
  closePendingFixture,
  previewPendingFixture,
  recoverPendingFixture,
  requestManualFixtureDispatch,
} from "./fixture-staging";
export function currentPreflightCommit() {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  if (execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }).trim())
    throw new Error("PREFLIGHT_REQUIRES_CLEAN_COMMIT");
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}
/** Operator only: no report/review/URL/model/browser/config override accepted. */
export async function stageOwnedFixture(intentId: string, options: FixtureStoreOptions) {
  const commit = currentPreflightCommit();
  fixedRunnerReview();
  const parent = await createOwnedPreflightParent();
  return stageOriginalFixtureParent(parent, intentId, commit, options);
}
export async function renderPendingFixturePacket(intentId: string, options: FixtureStoreOptions) {
  const pending = await previewPendingFixture(intentId, options);
  const packet = {
    ...pending,
    fixedConfiguration: fixedRunnerReview(),
    privateStorage: {
      directory: `${options.directory}/controlled-fixture-v1`,
      owner: pending.receipt.release.storageOwner,
      retention: pending.receipt.release.retentionPolicy,
    },
    approvalReady: false,
  };
  if (Buffer.byteLength(JSON.stringify(packet)) > 24 * 1024) throw new Error("REVIEW_PACKET_LIMIT");
  return packet;
}
