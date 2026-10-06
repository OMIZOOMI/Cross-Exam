import { z } from "zod";
import { ReproducerParentSchema } from "./reproducer";
import { TribunalIdSchema } from "./tribunal";

export const CONTROLLED_REPRODUCER_LIMITS = Object.freeze({
  runs: 16,
  releaseBytes: 8 * 1024,
  ledgerBytes: 1024,
  markerBytes: 1024,
  resultBytes: 12 * 1024,
  executorBytes: 1024,
  executorMs: 5000,
});
export const ControlledOperationSchema = z.literal("controlled-fixture-empty-navigation-v1");
export const ControlledFixtureKeySchema = z.literal("browser-empty-navigation-v1");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().datetime();
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
const refs = z
  .array(TribunalIdSchema)
  .min(1)
  .max(6)
  .refine((v) => new Set(v).size === v.length);
export const ControlledReproducerIntentSchema = z
  .object({
    schemaVersion: z.literal(1),
    intentId: z.string().regex(/^[a-z0-9][a-z0-9-]{7,63}$/),
    executionMode: z.literal("injected-fake"),
    testOnly: z.literal(true),
    operationId: ControlledOperationSchema,
    fixtureKey: ControlledFixtureKeySchema,
  })
  .strict();
export const ControlledReproducerBindingSchema = z
  .object({
    scanId: TribunalIdSchema,
    sourceRunId: TribunalIdSchema,
    sourceRunHash: digest,
    sourcePlanId: TribunalIdSchema,
    sourcePlanHash: digest,
    sourcePolicyHash: digest,
    sourceRequestHash: digest,
    provider: TribunalIdSchema,
    model: TribunalIdSchema,
    parent: ReproducerParentSchema,
    claimId: TribunalIdSchema,
    challengeId: TribunalIdSchema,
    evidenceIds: refs,
  })
  .strict()
  .refine(
    (b) =>
      b.parent.reviewedClaimIds.includes(b.claimId) &&
      b.parent.reviewedChallengeIds.includes(b.challengeId) &&
      b.evidenceIds.every((id) => b.parent.authorizedEvidenceIds.includes(id)),
  );
export const ControlledReproducerPlanSchema = z
  .object({
    id: TribunalIdSchema,
    runId: TribunalIdSchema,
    sourcePlanId: TribunalIdSchema,
    claimId: TribunalIdSchema,
    challengeId: TribunalIdSchema,
    evidenceIds: refs,
    operationId: ControlledOperationSchema,
    fixtureKey: ControlledFixtureKeySchema,
    relation: z.literal("lineage-only"),
    claimTested: z.literal(false),
    challengeResolved: z.literal(false),
    provenance: z.literal("INFERRED"),
    createdAt: date,
  })
  .strict();
/** Offline test reservation, never approval/admission for a real fixture run. */
export const ControlledReproducerReleaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("offline-test-reservation"),
    intent: ControlledReproducerIntentSchema,
    binding: ControlledReproducerBindingSchema,
    runId: TribunalIdSchema,
    planId: TribunalIdSchema,
    plan: ControlledReproducerPlanSchema,
    planHash: digest,
    intentHash: digest,
    authorizationId: TribunalIdSchema,
    authorizationBindingHash: digest,
    fixtureManifestHash: digest,
    policyHash: digest,
    createdAt: date,
  })
  .strict()
  .refine(
    (v) =>
      new Set([v.runId, v.planId, v.authorizationId]).size === 3 &&
      v.plan.id === v.planId &&
      v.plan.runId === v.runId &&
      v.plan.sourcePlanId === v.binding.sourcePlanId &&
      v.plan.claimId === v.binding.claimId &&
      v.plan.challengeId === v.binding.challengeId &&
      JSON.stringify(v.plan.evidenceIds) === JSON.stringify(v.binding.evidenceIds) &&
      v.plan.createdAt === v.createdAt &&
      ![v.binding.sourceRunId, v.binding.sourcePlanId].some((id) =>
        [v.runId, v.planId, v.authorizationId].includes(id),
      ) &&
      bytes(v) <= CONTROLLED_REPRODUCER_LIMITS.releaseBytes,
  );
export const ControlledReproducerLedgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    releaseHash: digest,
    dispatchHash: digest.nullable(),
    resultHash: digest.nullable(),
    complete: z.boolean(),
  })
  .strict()
  .refine((v) => v.complete === (v.resultHash !== null));
export const ControlledReproducerDispatchSchema = z
  .object({
    schemaVersion: z.literal(1),
    releaseHash: digest,
    authorizationId: TribunalIdSchema,
    authorizationBindingHash: digest,
    dispatchedAt: date,
    attempts: z.literal(1),
    testOnly: z.literal(true),
  })
  .strict();
export const ControlledReproducerStatusSchema = z.enum([
  "completed",
  "failed",
  "inconclusive",
  "aborted",
  "timeout",
  "outcome-unknown",
  "not-dispatched",
]);
/** Future projection shape only: parsing this shape is not execution attestation. */
export const ControlledReproducerObservationSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixtureKey: ControlledFixtureKeySchema,
    source: z.literal("fixture"),
    provenance: z.literal("OBSERVED"),
    navigationOutcome: z.literal("completed"),
    statusCode: z.number().int().min(100).max(599),
    titlePresent: z.boolean(),
    redirectCount: z.number().int().min(0).max(0),
    durationMs: z.number().finite().min(0).max(10000),
    capturedAt: date,
    completeness: z.object({ complete: z.literal(true), truncated: z.literal(false) }).strict(),
  })
  .strict();
export const ControlledReproducerFakeResultSchema = z
  .object({
    kind: z.literal("simulated-completed"),
    provenance: z.literal("SIMULATED"),
    testOnly: z.literal(true),
  })
  .strict();
export const ControlledReproducerRunSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: TribunalIdSchema,
    executionMode: z.literal("injected-fake"),
    testOnly: z.literal(true),
    release: ControlledReproducerReleaseSchema,
    releaseHash: digest,
    relation: z.literal("lineage-only"),
    claimTested: z.literal(false),
    challengeResolved: z.literal(false),
    status: ControlledReproducerStatusSchema,
    reason: z
      .enum([
        "cancelled",
        "deadline",
        "invalid-output",
        "executor-failure",
        "recovered",
        "executor-unavailable",
      ])
      .nullable(),
    attempts: z.number().int().min(0).max(1),
    simulated: ControlledReproducerFakeResultSchema.nullable(),
    // No Stage 16B offline path can issue actual OBSERVED output.
    observation: z.null(),
    finishedAt: date,
    durationMs: z.number().finite().min(0).max(30000).nullable(),
  })
  .strict()
  .refine(
    (r) =>
      r.id === r.release.runId &&
      Date.parse(r.finishedAt) >= Date.parse(r.release.createdAt) &&
      (r.status === "completed") === (r.simulated !== null) &&
      (r.status !== "completed" || (r.attempts === 1 && r.reason === null)) &&
      (r.status !== "not-dispatched" || r.attempts === 0) &&
      (r.status !== "outcome-unknown" || r.attempts === 1) &&
      (r.attempts !== 0 || ["not-dispatched", "aborted", "timeout"].includes(r.status)) &&
      bytes(r) <= CONTROLLED_REPRODUCER_LIMITS.resultBytes,
  );
export type ControlledReproducerIntent = z.infer<typeof ControlledReproducerIntentSchema>;
export type ControlledReproducerRelease = z.infer<typeof ControlledReproducerReleaseSchema>;
export type ControlledReproducerLedger = z.infer<typeof ControlledReproducerLedgerSchema>;
export type ControlledReproducerRun = z.infer<typeof ControlledReproducerRunSchema>;
