import { describe, expect, it } from "vitest";
import {
  REPRODUCER_LIMITS,
  REPRODUCER_POLICY,
  ReproducerAuditSchema,
  ReproducerAuthorizationMetadataSchema,
  ReproducerExecutionAuditSchema,
  ReproducerFakeExecutorResultSchema,
  ReproducerPlanningStatusSchema,
  ReproducerProposalSchema,
  type ReproducerRun,
  ReproducerRunSchema,
  reproducerSchemas,
} from "./index";

const required = <T>(value: T | null | undefined): T => {
  if (value == null) throw new Error("TEST_FIXTURE_MISSING");
  return value;
};
const timestamp = "2026-10-06T00:00:00.000Z";
const digest = "a".repeat(64);
const item = {
  claimId: "C-parent",
  challengeId: "CH-parent",
  operationId: "fixture-document-repeat-v1",
  evidenceIds: ["E-1"],
};
function empty(): ReproducerRun {
  return {
    schemaVersion: 1,
    id: "RR-1",
    sessionId: "RS-1",
    scanId: "scan-1",
    finalized: true,
    executionMode: "injected-fake",
    parent: {
      snapshotHash: digest,
      tribunalRunId: "TR-1",
      skepticReviewId: null,
      skepticReviewHash: null,
      authorizedEvidenceIds: ["E-1"],
      reviewedClaimIds: ["C-parent"],
      reviewedChallengeIds: ["CH-parent"],
    },
    plans: [],
    audit: {
      schemaVersion: 1,
      id: "RA-1",
      scanId: "scan-1",
      role: "Reproducer",
      executionMode: "injected-fake",
      provider: "fake",
      model: "fake-v1",
      policy: REPRODUCER_POLICY,
      policyHash: digest,
      requestSchemaVersion: 1,
      responseSchemaVersion: 1,
      requestSchemaHash: digest,
      responseSchemaHash: digest,
      requestHash: digest,
      responseHash: digest,
      startedAt: timestamp,
      finishedAt: timestamp,
      elapsedMs: 0,
      status: "completed",
      calls: 1,
      acceptedIds: [],
      rejectedCount: 0,
      rejectedCountKnown: true,
      rejectionCodes: [],
      usage: null,
      outputTokenLimit: 768,
      timeoutMs: 20000,
      semanticRetries: 0,
    },
    authorization: null,
    execution: {
      schemaVersion: 1,
      executionMode: "injected-fake",
      status: "not-requested",
      reason: null,
      calls: 0,
      startedAt: null,
      finishedAt: null,
      elapsedMs: 0,
      timeoutMs: 5000,
      responseHash: null,
      result: null,
    },
    startedAt: timestamp,
    finishedAt: timestamp,
    elapsedMs: 0,
    totalTimeoutMs: 25000,
  };
}
function one() {
  const r = empty();
  r.plans = [
    {
      ...item,
      id: "RP-1",
      scanId: r.scanId,
      runId: r.id,
      createdAt: timestamp,
      plannedBy: "Reproducer",
      provenance: "INFERRED",
      operationId: "fixture-document-repeat-v1",
    },
  ];
  r.audit.acceptedIds = ["RP-1"];
  r.authorization = {
    schemaVersion: 1,
    runId: r.id,
    sessionId: r.sessionId,
    planId: "RP-1",
    parentSnapshotHash: digest,
    planHash: digest,
    operationPolicyHash: digest,
    bindingHash: digest,
    issuedAt: timestamp,
    consumedAt: timestamp,
    attempts: 1,
    guarantee: "one-trusted-host-attempt-per-capability-in-one-process",
  };
  r.execution = {
    ...r.execution,
    status: "simulated-completed",
    calls: 1,
    startedAt: timestamp,
    finishedAt: timestamp,
    responseHash: digest,
    result: { schemaVersion: 1, provenance: "SIMULATED", code: "FAKE_COMPLETED" },
  };
  return r;
}
describe("Reproducer v1 contracts", () => {
  it("accepts only zero or one strict proposal with required references", () => {
    expect(ReproducerProposalSchema.parse({ schemaVersion: 1, plans: [] }).plans).toEqual([]);
    expect(ReproducerProposalSchema.parse({ schemaVersion: 1, plans: [item] }).plans).toHaveLength(
      1,
    );
    expect(
      ReproducerProposalSchema.safeParse({ schemaVersion: 1, plans: [item, item] }).success,
    ).toBe(false);
    expect(
      ReproducerProposalSchema.safeParse({
        schemaVersion: 1,
        plans: [{ ...item, evidenceIds: [] }],
      }).success,
    ).toBe(false);
  });
  it.each([
    "id",
    "scanId",
    "status",
    "provenance",
    "verdict",
    "url",
    "path",
    "headers",
    "method",
    "script",
    "selector",
    "fixtureTarget",
    "timeoutMs",
    "parameters",
    "createdAt",
  ])("rejects unknown field %s at both proposal levels", (key) => {
    expect(
      ReproducerProposalSchema.safeParse({ schemaVersion: 1, plans: [], [key]: "untrusted" })
        .success,
    ).toBe(false);
    expect(
      ReproducerProposalSchema.safeParse({
        schemaVersion: 1,
        plans: [{ ...item, [key]: "untrusted" }],
      }).success,
    ).toBe(false);
  });
  it.each([
    { claimId: "x".repeat(129) },
    { challengeId: "../path" },
    { operationId: "https://target.invalid" },
    { evidenceIds: Array.from({ length: 7 }, (_, i) => `E-${i}`) },
    { evidenceIds: ["E-1", "E-1"] },
    { operationId: "" },
  ])("rejects identifier/reference bounds %j", (patch) => {
    expect(
      ReproducerProposalSchema.safeParse({ schemaVersion: 1, plans: [{ ...item, ...patch }] })
        .success,
    ).toBe(false);
  });
  it("accepts completed empty audits/runs and a simulated one-plan run", () => {
    expect(ReproducerAuditSchema.safeParse(empty().audit).success).toBe(true);
    expect(ReproducerRunSchema.safeParse(empty()).success).toBe(true);
    expect(ReproducerRunSchema.safeParse(one()).success).toBe(true);
  });
  it.each([
    { calls: 0 },
    { requestHash: null },
    { responseHash: null },
    { rejectedCount: 1 },
    { rejectionCodes: ["SCHEMA_INVALID"] },
    { rejectedCountKnown: false },
  ])("rejects incoherent completed empty audit %j", (patch) => {
    expect(ReproducerAuditSchema.safeParse({ ...empty().audit, ...patch }).success).toBe(false);
  });
  it("requires exactly one known semantic rejection for no-valid-output", () => {
    const r = empty();
    r.audit.status = "no-valid-output";
    r.audit.rejectedCount = 1;
    r.audit.rejectionCodes = ["UNAUTHORIZED_CLAIM"];
    expect(ReproducerRunSchema.safeParse(r).success).toBe(true);
    for (const patch of [
      { rejectedCount: 0 },
      { rejectedCountKnown: false },
      { rejectionCodes: [] },
      { responseHash: null },
      { calls: 0 },
      { acceptedIds: ["RP-1"] },
    ])
      expect(ReproducerAuditSchema.safeParse({ ...r.audit, ...patch }).success).toBe(false);
  });
  it("rejects partial-rejection in all new role status positions", () => {
    expect(ReproducerPlanningStatusSchema.safeParse("partial-rejection").success).toBe(false);
    expect(
      ReproducerAuditSchema.safeParse({ ...empty().audit, status: "partial-rejection" }).success,
    ).toBe(false);
    expect(
      ReproducerExecutionAuditSchema.safeParse({
        ...empty().execution,
        status: "partial-rejection",
      }).success,
    ).toBe(false);
    const r = empty();
    expect(ReproducerRunSchema.safeParse({ ...r, status: "partial-rejection" }).success).toBe(
      false,
    );
  });
  it.each([
    (r: ReproducerRun) => {
      r.authorization = null;
    },
    (r: ReproducerRun) => {
      required(r.authorization).attempts = 0 as 1;
    },
    (r: ReproducerRun) => {
      required(r.authorization).sessionId = "other-session";
    },
    (r: ReproducerRun) => {
      required(r.authorization).parentSnapshotHash = "b".repeat(64);
    },
    (r: ReproducerRun) => {
      required(r.authorization).planId = "different-plan";
    },
    (r: ReproducerRun) => {
      required(r.plans[0]).scanId = "other-scan";
    },
    (r: ReproducerRun) => {
      required(r.plans[0]).claimId = "base-claim";
    },
    (r: ReproducerRun) => {
      required(r.plans[0]).challengeId = "unavailable";
    },
    (r: ReproducerRun) => {
      required(r.plans[0]).evidenceIds = ["not-authorized"];
    },
    (r: ReproducerRun) => {
      r.audit.acceptedIds = [];
    },
    (r: ReproducerRun) => {
      r.execution.calls = 0;
    },
    (r: ReproducerRun) => {
      required(r.execution.result).provenance = "OBSERVED" as "SIMULATED";
    },
  ])("rejects incoherent authority/provenance linkage", (mutate) => {
    const r = one();
    mutate(r);
    expect(ReproducerRunSchema.safeParse(r).success).toBe(false);
  });
  it("permits consumed outcome-unknown only without result and with one attempt", () => {
    const r = one();
    r.execution.status = "outcome-unknown";
    r.execution.reason = "DEADLINE";
    r.execution.result = null;
    r.execution.responseHash = null;
    expect(ReproducerRunSchema.safeParse(r).success).toBe(true);
    for (const patch of [{ calls: 0 }, { reason: null }, { result: one().execution.result }])
      expect(ReproducerExecutionAuditSchema.safeParse({ ...r.execution, ...patch }).success).toBe(
        false,
      );
  });
  it("rejects fake OBSERVED evidence, bodies and arbitrary output text", () => {
    const result = one().execution.result;
    expect(ReproducerFakeExecutorResultSchema.safeParse({ kind: "result", result }).success).toBe(
      true,
    );
    for (const patch of [
      { provenance: "OBSERVED" },
      { body: "page-content" },
      { text: "claim reproduced" },
      { evidence: [] },
    ])
      expect(
        ReproducerFakeExecutorResultSchema.safeParse({
          kind: "result",
          result: { ...result, ...patch },
        }).success,
      ).toBe(false);
  });
  it("requires finalized immutable artifact semantics and rejects capability fields", () => {
    expect(ReproducerRunSchema.safeParse({ ...empty(), finalized: false }).success).toBe(false);
    expect(
      ReproducerAuthorizationMetadataSchema.safeParse({ ...one().authorization, capability: {} })
        .success,
    ).toBe(false);
    expect(
      ReproducerRunSchema.safeParse({
        ...empty(),
        rawOutput: "x".repeat(REPRODUCER_LIMITS.runBytes),
      }).success,
    ).toBe(false);
  });
  it("versioned schema identity describes proposals, never canonical plans", () => {
    const schemas = reproducerSchemas();
    const serialized = JSON.stringify(schemas.response);
    expect(schemas.request).toHaveProperty("properties");
    expect(serialized).toContain("maxItems");
    expect(serialized).toContain("additionalProperties");
    expect(serialized).not.toContain("createdAt");
    expect(serialized).not.toContain("plannedBy");
    expect(Buffer.byteLength(JSON.stringify(one()))).toBeLessThan(REPRODUCER_LIMITS.runBytes);
  });
});
