import { z } from "zod";
import {
  ControlledFixtureKeySchema,
  ControlledReproducerBindingSchema,
  ControlledReproducerPlanSchema,
} from "./controlled-reproducer";
import { TribunalIdSchema } from "./tribunal";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().datetime();
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
export const FIXTURE_STAGING_LIMITS = Object.freeze({
  releaseBytes: 12 * 1024,
  receiptBytes: 16 * 1024,
  metadataBytes: 2048,
  resultBytes: 16 * 1024,
  executorBytes: 1024,
  executorMs: 5000,
  intentLifetimeMs: 86400000,
});
export const ControlledFixtureIntentIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{7,63}$/);
export const ControlledFixtureReproducerObservationSchema = z
  .object({
    schemaVersion: z.literal(1),
    artifactKind: z.literal("controlled-fixture-reproducer-observation-v1"),
    fixtureKey: ControlledFixtureKeySchema,
    source: z.literal("fixture"),
    provenance: z.literal("OBSERVED"),
    navigationOutcome: z.literal("completed"),
    statusCode: z.number().int().min(100).max(599),
    titlePresent: z.boolean(),
    redirectCount: z.literal(0),
    durationMs: z.number().finite().min(0).max(10000),
    capturedAt: date,
    completeness: z.object({ complete: z.literal(true), truncated: z.literal(false) }).strict(),
  })
  .strict();
export const ControlledFixtureReproducerReleaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("controlled-fixture-release-v1"),
    intentId: ControlledFixtureIntentIdSchema,
    releaseId: TribunalIdSchema,
    runId: TribunalIdSchema,
    authorizationId: TribunalIdSchema,
    binding: ControlledReproducerBindingSchema,
    plan: ControlledReproducerPlanSchema,
    planHash: digest,
    intentHash: digest,
    authorizationHash: digest,
    implementationCommit: z.string().regex(/^[a-f0-9]{40}$/),
    inputSnapshotHash: digest,
    fixtureManifestHash: digest,
    bodyHash: digest,
    runnerConfigHash: digest,
    policyHash: digest,
    schemasHash: digest,
    futureProofPolicyHash: digest,
    runtimeRootManifestHash: digest.nullable(),
    chromiumBinaryHash: digest.nullable(),
    storageDirectoryHash: digest,
    storageHostHash: digest,
    storageOwner: z.number().int().nonnegative(),
    retentionPolicy: z.literal("owner-explicit-removal-no-auto-delete-v1"),
    relation: z.literal("lineage-only"),
    claimTested: z.literal(false),
    challengeResolved: z.literal(false),
    createdAt: date,
    expiresAt: date,
  })
  .strict()
  .refine(
    (r) =>
      r.plan.runId === r.runId &&
      r.plan.sourcePlanId === r.binding.sourcePlanId &&
      r.plan.claimId === r.binding.claimId &&
      r.plan.challengeId === r.binding.challengeId &&
      JSON.stringify(r.plan.evidenceIds) === JSON.stringify(r.binding.evidenceIds) &&
      r.plan.createdAt === r.createdAt &&
      new Set([r.runId, r.releaseId, r.authorizationId, r.plan.id]).size === 4 &&
      ![r.binding.sourceRunId, r.binding.sourcePlanId].some((id) =>
        [r.runId, r.releaseId, r.authorizationId, r.plan.id].includes(id),
      ) &&
      Date.parse(r.expiresAt) - Date.parse(r.createdAt) ===
        FIXTURE_STAGING_LIMITS.intentLifetimeMs &&
      bytes(r) <= FIXTURE_STAGING_LIMITS.releaseBytes,
  );

/** Required future host proof, not a promise that it already exists at reservation time. */
export const ControlledFixtureExecutionAttestationSchema = z
  .object({
    kind: z.literal("trusted-linux-host-execution-v1"),
    releaseHash: digest,
    authorizationHash: digest,
    fixtureManifestHash: digest,
    runnerConfigHash: digest,
    futureProofPolicyHash: digest,
    runtimeRootManifestHash: digest,
    chromiumBinaryHash: digest,
    startedAt: date,
    finishedAt: date,
    proofs: z
      .object({
        activeCgroup: z.literal(true),
        sealedRoot: z.literal(true),
        exactAppArmor: z.literal(true),
        appArmorRestriction: z.literal(true),
        chromiumUserns: z.literal(true),
        rendererSeccomp: z.literal(true),
        enforcingProxy: z.literal(true),
        privateNetwork: z.literal(true),
        nonRoot: z.literal(true),
        noNewPrivileges: z.literal(true),
        emptyHostCapabilities: z.literal(true),
        cgroupLimits: z.literal(true),
        cleanup: z.literal(true),
        sentinelHits: z.literal(0),
      })
      .strict(),
  })
  .strict()
  .refine((v) => Date.parse(v.finishedAt) >= Date.parse(v.startedAt));
export const ControlledFixtureReproducerRunSchema = z
  .object({
    schemaVersion: z.literal(1),
    artifactKind: z.literal("controlled-fixture-reproducer-run-v1"),
    executionMode: z.literal("controlled-fixture"),
    scope: z.literal("owned-controlled-fixture"),
    id: TribunalIdSchema,
    release: ControlledFixtureReproducerReleaseSchema,
    releaseHash: digest,
    relation: z.literal("lineage-only"),
    claimTested: z.literal(false),
    challengeResolved: z.literal(false),
    status: z.enum([
      "completed",
      "failed",
      "inconclusive",
      "aborted",
      "timeout",
      "outcome-unknown",
      "not-dispatched",
    ]),
    attestation: ControlledFixtureExecutionAttestationSchema,
    observation: ControlledFixtureReproducerObservationSchema.nullable(),
  })
  .strict()
  .refine(
    (v) =>
      v.id === v.release.runId &&
      v.attestation.releaseHash === v.releaseHash &&
      v.attestation.authorizationHash === v.release.authorizationHash &&
      v.attestation.fixtureManifestHash === v.release.fixtureManifestHash &&
      v.attestation.runnerConfigHash === v.release.runnerConfigHash &&
      v.attestation.futureProofPolicyHash === v.release.futureProofPolicyHash &&
      v.attestation.runtimeRootManifestHash === v.release.runtimeRootManifestHash &&
      v.attestation.chromiumBinaryHash === v.release.chromiumBinaryHash &&
      Date.parse(v.attestation.startedAt) >= Date.parse(v.release.createdAt) &&
      Date.parse(v.attestation.startedAt) < Date.parse(v.release.expiresAt) &&
      Date.parse(v.attestation.finishedAt) - Date.parse(v.attestation.startedAt) <= 50000 &&
      (v.observation === null ||
        (Date.parse(v.observation.capturedAt) >= Date.parse(v.attestation.startedAt) &&
          Date.parse(v.observation.capturedAt) <= Date.parse(v.attestation.finishedAt) &&
          v.observation.durationMs <=
            Date.parse(v.attestation.finishedAt) - Date.parse(v.attestation.startedAt))) &&
      (v.status === "completed") === (v.observation !== null) &&
      bytes(v) <= FIXTURE_STAGING_LIMITS.resultBytes,
  );

export const ControlledFixtureReviewReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    artifactKind: z.literal("controlled-fixture-pre-dispatch-review-v1"),
    release: ControlledFixtureReproducerReleaseSchema,
    releaseHash: digest,
    approvalReady: z.literal(false),
    blockers: z.tuple([
      z.literal("RUNTIME_ARTIFACT_NOT_PINNED"),
      z.literal("REAL_RUNNER_DISABLED"),
      z.literal("OWNER_AUTHORITY_NOT_PROVISIONED"),
    ]),
  })
  .strict()
  .refine((v) => bytes(v) <= FIXTURE_STAGING_LIMITS.receiptBytes);
export const ControlledFixtureStagingLedgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("controlled-fixture-staging-ledger-v1"),
    releaseHash: digest,
    receiptHash: digest,
    approvalHash: digest.nullable(),
    dispatchHash: digest.nullable(),
    resultHash: digest.nullable(),
    state: z.enum(["pending-approval", "dispatched", "terminal"]),
  })
  .strict()
  .refine(
    (v) =>
      (v.state === "terminal") === (v.resultHash !== null) &&
      (v.dispatchHash === null || v.approvalHash !== null) &&
      (v.state !== "pending-approval" || v.dispatchHash === null) &&
      (v.state !== "dispatched" || v.dispatchHash !== null),
  );
/** Future shape only. A parsed record/bare boolean is never owner authority. */
export const ControlledFixtureOwnerApprovalSchema = z
  .object({
    kind: z.literal("owner-verified-controlled-fixture-approval-v1"),
    receiptHash: digest,
    releaseHash: digest,
    futureProofPolicyHash: digest,
    authorityEvidenceHash: digest,
    approvedAt: date,
  })
  .strict();
export const ControlledFixtureSyntheticApprovalSchema = z
  .object({
    kind: z.literal("synthetic-offline-approval-v1"),
    testOnly: z.literal(true),
    receiptHash: digest,
    releaseHash: digest,
    decisionId: TribunalIdSchema,
    approvedAt: date,
  })
  .strict();
export const ControlledFixtureDispatchMarkerSchema = z
  .object({
    kind: z.literal("controlled-fixture-test-dispatch-v1"),
    testOnly: z.literal(true),
    releaseHash: digest,
    receiptHash: digest,
    approvalHash: digest,
    authorizationHash: digest,
    attempts: z.literal(1),
    dispatchedAt: date,
  })
  .strict();
/** Host staging terminal receipt, distinct from an attested real-path run. */
export const ControlledFixtureStagingResultSchema = z
  .object({
    artifactKind: z.literal("controlled-fixture-staging-terminal-v1"),
    releaseHash: digest,
    receiptHash: digest,
    authorizationHash: digest,
    status: z.enum(["not-dispatched", "outcome-unknown", "simulated-completed"]),
    reason: z
      .enum([
        "cancelled",
        "expired",
        "denied",
        "recovered",
        "invalid-output",
        "deadline",
        "executor-failure",
      ])
      .nullable(),
    attempts: z.number().int().min(0).max(1),
    testOnly: z.boolean(),
    provenance: z.literal("SIMULATED").nullable(),
    observation: z.null(),
    finishedAt: date,
  })
  .strict()
  .refine(
    (v) =>
      (v.status === "not-dispatched"
        ? v.attempts === 0 && ["cancelled", "expired", "denied"].includes(v.reason as string)
        : v.attempts === 1) &&
      (v.status === "simulated-completed"
        ? v.reason === null && v.testOnly && v.provenance === "SIMULATED"
        : v.provenance === null) &&
      (v.attempts === 0 || v.testOnly),
  );
export type ControlledFixtureRelease = z.infer<typeof ControlledFixtureReproducerReleaseSchema>;
export type ControlledFixtureReceipt = z.infer<typeof ControlledFixtureReviewReceiptSchema>;
export type ControlledFixtureLedger = z.infer<typeof ControlledFixtureStagingLedgerSchema>;
export type ControlledFixtureTerminal = z.infer<typeof ControlledFixtureStagingResultSchema>;
