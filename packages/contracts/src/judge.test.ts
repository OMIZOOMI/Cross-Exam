import { describe, expect, it } from "vitest";
import {
  JudgeProposalSchema,
  JudgeReproductionViewSchema,
  JudgeReviewSchema,
  JudgeVerdictProposalSchema,
} from "./judge";

const proposal = {
  claimId: "C-1",
  outcome: "confirmed" as const,
  supportEvidenceIds: ["E-1"],
  challengeIds: [],
  rationale: "The supplied observation supports the claim under its stated scope.",
  limitations: ["This is not a universal statement."],
};

describe("Judge proposal contracts", () => {
  it("accepts the strict proposal envelope and all four outcomes", () => {
    for (const outcome of ["confirmed", "contested", "insufficient-evidence", "rejected"] as const)
      expect(
        JudgeProposalSchema.safeParse({ schemaVersion: 1, verdicts: [{ ...proposal, outcome }] })
          .success,
      ).toBe(true);
    expect(JudgeProposalSchema.safeParse({ schemaVersion: 1, verdicts: [] }).success).toBe(true);
  });

  it.each([
    "id",
    "scanId",
    "decidedBy",
    "provenance",
    "createdAt",
    "status",
    "evidence",
    "findings",
    "confidence",
  ])("rejects provider authority field %s", (key) => {
    expect(JudgeVerdictProposalSchema.safeParse({ ...proposal, [key]: "injected" }).success).toBe(
      false,
    );
  });

  it("rejects nested authority, duplicate references and unsupported scores", () => {
    expect(
      JudgeProposalSchema.safeParse({
        schemaVersion: 1,
        verdicts: [{ ...proposal, supportEvidenceIds: ["E-1", "E-1"] }],
      }).success,
    ).toBe(false);
    expect(
      JudgeProposalSchema.safeParse({
        schemaVersion: 1,
        verdicts: [{ ...proposal, reproduction: { status: "none", runId: "R-1", id: "bad" } }],
      }).success,
    ).toBe(false);
    expect(
      JudgeProposalSchema.safeParse({
        schemaVersion: 1,
        verdicts: [{ ...proposal, rationale: "90% confidence" }],
      }).success,
    ).toBe(true);
  });

  it("keeps the observed reproduction state explicit and bounded", () => {
    expect(
      JudgeReproductionViewSchema.safeParse({
        status: "none",
        source: "none",
        runId: null,
        planId: null,
        claimId: null,
        challengeId: null,
        observedAccepted: false,
      }).success,
    ).toBe(true);
    expect(
      JudgeReproductionViewSchema.safeParse({
        status: "observed-accepted",
        source: "controlled-fixture-attested",
        runId: "RR-1",
        planId: "RP-1",
        claimId: "C-1",
        challengeId: "CH-1",
        observedAccepted: false,
      }).success,
    ).toBe(false);
  });

  it("rejects review identity and authority inconsistencies", () => {
    const review = {
      schemaVersion: 1,
      id: "JR-1",
      scanId: "scan-1",
      artifactHash: "a".repeat(64),
      parent: {
        reportHash: "b".repeat(64),
        scanId: "scan-1",
        tribunalRunId: "TR-1",
        authorizedEvidenceIds: ["E-1"],
        claimIds: ["C-1"],
        challengeIds: [],
        skepticReviewId: null,
        skepticReviewHash: null,
        reproducerRunId: null,
        reproducerHash: null,
        bindingHash: "c".repeat(64),
      },
      verdicts: [],
      audit: {
        schemaVersion: 1,
        id: "JA-1",
        scanId: "scan-1",
        role: "Judge",
        executionMode: "injected-fake",
        provider: "fake-provider",
        model: "fake-model",
        policy: "offline-judge-adjudication-v1",
        policyHash: "d".repeat(64),
        requestSchemaVersion: 1,
        responseSchemaVersion: 1,
        requestSchemaHash: "e".repeat(64),
        responseSchemaHash: "f".repeat(64),
        requestHash: null,
        responseHash: null,
        startedAt: "2026-10-06T00:00:00.000Z",
        finishedAt: "2026-10-06T00:00:00.000Z",
        elapsedMs: 0,
        status: "skipped",
        usage: null,
        acceptedVerdictIds: [],
        rejectedCount: 0,
        rejectedCountKnown: true,
        rejectionCodes: ["NO_CLAIMS"],
        calls: 0,
        outputTokenLimit: 1536,
        timeoutMs: 20000,
        wholeDeadlineMs: 25000,
        semanticRetries: 0,
      },
    };
    expect(JudgeReviewSchema.safeParse(review).success).toBe(true);
    expect(
      JudgeReviewSchema.safeParse({
        ...review,
        parent: { ...review.parent, skepticReviewId: "SR-1" },
      }).success,
    ).toBe(false);
    expect(
      JudgeReviewSchema.safeParse({
        ...review,
        audit: { ...review.audit, acceptedVerdictIds: ["JV-1"] },
      }).success,
    ).toBe(false);
  });
});
