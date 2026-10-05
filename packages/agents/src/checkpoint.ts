import {
  type RoleCheckpoint,
  RoleCheckpointSchema,
  type ScanReport,
  ScanReportSchema,
  type TribunalRun,
} from "@crossexam/contracts";
import { type DispatchAuthorization, immutable } from "./provider";

export type { RoleCheckpoint } from "@crossexam/contracts";
/** Finalized host records only. No proposals, envelopes, or invented recovery audits. */
export { RoleCheckpointSchema } from "@crossexam/contracts";
export interface TribunalHostHooks {
  beforeDispatch(
    role: "Explorer" | "Breaker",
    requestHash: string,
  ): Promise<DispatchAuthorization | undefined>;
  checkpoint(value: Readonly<RoleCheckpoint>): Promise<void>;
}
export class HostPersistenceError extends Error {
  constructor() {
    super("HOST_PERSISTENCE_FAILED");
  }
}
/** Both actual finalized role audits are required; recovery never fabricates the absent role. */
export function reportFromCheckpoints(
  input: ScanReport,
  explorer: RoleCheckpoint,
  breaker: RoleCheckpoint,
): ScanReport {
  const e = RoleCheckpointSchema.parse(explorer);
  const b = RoleCheckpointSchema.parse(breaker);
  if (
    e.audit.role !== "Explorer" ||
    b.audit.role !== "Breaker" ||
    e.runId !== b.runId ||
    e.scanId !== b.scanId ||
    e.scanId !== input.summary.id ||
    e.startedAt !== b.startedAt ||
    JSON.stringify(e.claims) !== JSON.stringify(b.claims) ||
    e.challenges.length ||
    JSON.stringify(e.authorizedEvidenceIds) !== JSON.stringify(b.authorizedEvidenceIds)
  )
    throw new Error("CHECKPOINT_MISMATCH");
  const statuses = [e.audit.status, b.audit.status];
  const run: TribunalRun = {
    schemaVersion: 1,
    id: e.runId,
    scanId: e.scanId,
    startedAt: e.startedAt,
    finishedAt: b.finishedAt,
    elapsedMs: b.elapsedMs,
    status: statuses.includes("aborted")
      ? "aborted"
      : statuses.every((s) => s === "completed")
        ? "completed"
        : e.claims.length
          ? "partial"
          : "failed",
    authorizedEvidenceIds: e.authorizedEvidenceIds,
    claims: e.claims,
    challenges: b.challenges,
    agentRuns: [e.audit, b.audit],
  };
  return immutable(ScanReportSchema.parse({ ...input, tribunalRuns: [run] }));
}
