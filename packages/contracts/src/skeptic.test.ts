import { describe, expect, it } from "vitest";
import {
  CanonicalChallengeSchema,
  SKEPTIC_LIMITS,
  SkepticChallengeProposalSchema,
  SkepticProposalSchema,
  SkepticRequestSchema,
  type SkepticReview,
  SkepticReviewSchema,
  skepticSchemas,
} from "./index";

const item = {
  claimId: "C-parent",
  category: "collection-limitation",
  question: "Was the observation window sufficient?",
  evidenceIds: ["E-1"],
  relatedChallengeIds: ["CH-parent"],
};
const proposal = (c: unknown[] = [item]) => ({ schemaVersion: 1, challenges: c });
describe("Skeptic v1 contracts", () => {
  it("validates the separate proposal and preserves canonical Challenge strictness", () => {
    expect(SkepticProposalSchema.parse(proposal()).challenges).toHaveLength(1);
    expect(
      CanonicalChallengeSchema.safeParse({
        ...item,
        id: "CH-new",
        scanId: "scan",
        createdAt: new Date().toISOString(),
        raisedBy: "Skeptic",
        provenance: "INFERRED",
        status: "open",
      }).success,
    ).toBe(false);
    expect(SkepticReviewSchema.shape.schemaVersion.value).toBe(1);
  });
  it.each([
    "id",
    "scanId",
    "raisedBy",
    "provenance",
    "createdAt",
    "status",
    "verdict",
    "confidence",
    "experiments",
    "reasoning",
    "evidence",
    "findings",
  ])("rejects authority field %s", (key) => {
    expect(SkepticProposalSchema.safeParse({ ...proposal(), [key]: "injected" }).success).toBe(
      false,
    );
    expect(
      SkepticProposalSchema.safeParse(proposal([{ ...item, [key]: "injected" }])).success,
    ).toBe(false);
  });
  it.each([
    { question: "x".repeat(481) },
    { question: " " },
    { question: "line\ncontrol" },
    { evidenceIds: Array.from({ length: 7 }, (_, i) => `E-${i}`) },
    { evidenceIds: ["E-1", "E-1"] },
    { relatedChallengeIds: Array.from({ length: 4 }, (_, i) => `CH-${i}`) },
    { relatedChallengeIds: ["CH-1", "CH-1"] },
    { category: "truth-verdict" },
    { relatedChallengeIds: undefined },
    { claimId: "../path" },
  ])("rejects item bounds/unknown category %j", (patch) => {
    expect(SkepticProposalSchema.safeParse(proposal([{ ...item, ...patch }])).success).toBe(false);
  });
  it("rejects whole total/per-claim cardinality rather than accepting the prefix", () => {
    expect(
      SkepticProposalSchema.safeParse(
        proposal(Array.from({ length: 7 }, (_, i) => ({ ...item, claimId: `C-${i}` }))),
      ).success,
    ).toBe(false);
    expect(SkepticProposalSchema.safeParse(proposal(Array(3).fill(item))).success).toBe(false);
    expect(
      SkepticProposalSchema.safeParse(
        proposal(
          Array.from({ length: 6 }, (_, i) => ({ ...item, claimId: `C-${Math.floor(i / 2)}` })),
        ),
      ).success,
    ).toBe(true);
  });
  it("reuses the exact missing-evidence policy", () => {
    const c = { ...item, category: "missing-evidence", evidenceIds: [] };
    expect(SkepticChallengeProposalSchema.safeParse(c).success).toBe(false);
    expect(SkepticChallengeProposalSchema.safeParse({ ...c, missingEvidence: " " }).success).toBe(
      false,
    );
    expect(
      SkepticChallengeProposalSchema.safeParse({
        ...c,
        missingEvidence: "Independent reproduction.",
      }).success,
    ).toBe(true);
    expect(
      SkepticChallengeProposalSchema.safeParse({ ...c, missingEvidence: "x".repeat(321) }).success,
    ).toBe(false);
    expect(
      SkepticChallengeProposalSchema.safeParse({
        ...item,
        evidenceIds: [],
        relatedChallengeIds: ["CH-1"],
      }).success,
    ).toBe(false);
    expect(
      SkepticChallengeProposalSchema.safeParse({ ...item, missingEvidence: "Unexpected" }).success,
    ).toBe(false);
    expect(SkepticChallengeProposalSchema.safeParse({ ...c, evidenceIds: ["E-1"] }).success).toBe(
      true,
    );
  });
  it("has explicit byte ceilings and offline-only schema identity", () => {
    expect(SKEPTIC_LIMITS).toMatchObject({
      requestBytes: 131072,
      responseBytes: 24576,
      reviewBytes: 65536,
      timeoutMs: 20000,
      outputTokens: 1024,
    });
    expect(Object.isFrozen(SKEPTIC_LIMITS)).toBe(true);
    const schemas = skepticSchemas();
    expect(JSON.stringify(schemas)).not.toContain("openai");
    expect(
      SkepticRequestSchema.safeParse({
        schemaVersion: 1,
        role: "Judge",
        view: {},
        instructions: "override",
      }).success,
    ).toBe(false);
  });
  it("allows an honest empty proposal, without asserting accessibility or truth", () => {
    expect(SkepticProposalSchema.parse(proposal([])).challenges).toEqual([]);
  });
});

/** Host-shaped synthetic review; no provider or parent mutation is involved. */
const emptyReview = (): SkepticReview => {
  const sha = "a".repeat(64);
  const time = "2026-10-05T10:00:00.000Z";
  return {
    schemaVersion: 1,
    id: "SR-empty",
    scanId: "scan-owned",
    parent: {
      snapshotHash: sha,
      tribunalRunId: "TR-parent",
      authorizedEvidenceIds: ["E-1"],
      reviewedClaimIds: ["C-parent"],
      reviewedChallengeIds: [],
    },
    upstream: { status: "completed", explorerStatus: "completed", breakerStatus: "completed" },
    challenges: [],
    audit: {
      schemaVersion: 1,
      id: "SA-empty",
      scanId: "scan-owned",
      role: "Skeptic",
      executionMode: "injected-fake",
      provider: "fake-provider",
      model: "fake-model",
      policy: "skeptic-numeric-audit-v1",
      policyHash: sha,
      requestSchemaVersion: 1,
      responseSchemaVersion: 1,
      requestSchemaHash: sha,
      responseSchemaHash: sha,
      requestHash: sha,
      responseHash: sha,
      startedAt: time,
      finishedAt: time,
      elapsedMs: 0,
      status: "completed",
      usage: null,
      acceptedIds: [],
      rejectedCount: 0,
      rejectedCountKnown: true,
      rejectionCodes: [],
      calls: 1,
      outputTokenLimit: 1024,
      timeoutMs: 20000,
      semanticRetries: 0,
    },
  };
};
describe("Skeptic empty completion and all-rejected audit semantics", () => {
  it("validates completed empty reviews with exactly one call, hashes and known zero rejections", () => {
    const r = emptyReview();
    expect(SkepticReviewSchema.parse(r)).toEqual(r);
  });
  it.each([
    { calls: 0 },
    { requestHash: null },
    { responseHash: null },
    { rejectedCount: 1 },
    { rejectionCodes: ["DUPLICATE"] },
    { rejectedCountKnown: false },
  ])("rejects inconsistent completed empty audit: %j", (patch) => {
    const r = emptyReview();
    expect(SkepticReviewSchema.safeParse({ ...r, audit: { ...r.audit, ...patch } }).success).toBe(
      false,
    );
  });
  it("validates all-rejected output with positive known rejection count and code", () => {
    const r = emptyReview();
    r.audit.status = "no-valid-output";
    r.audit.rejectedCount = 1;
    r.audit.rejectionCodes = ["UNAUTHORIZED_CLAIM"];
    expect(SkepticReviewSchema.parse(r)).toEqual(r);
  });
  it.each([
    { calls: 0 },
    { requestHash: null },
    { responseHash: null },
    { rejectedCount: 0 },
    { rejectionCodes: [] },
    { rejectedCountKnown: false },
  ])("rejects inconsistent no-valid-output audit: %j", (patch) => {
    const r = emptyReview();
    const audit = {
      ...r.audit,
      status: "no-valid-output",
      rejectedCount: 1,
      rejectionCodes: ["UNAUTHORIZED_CLAIM"],
      ...patch,
    };
    expect(SkepticReviewSchema.safeParse({ ...r, audit }).success).toBe(false);
  });
  it("rejects a zero-rejection no-valid-output review even with a rejection code", () => {
    const r = emptyReview();
    r.audit.status = "no-valid-output";
    r.audit.rejectionCodes = ["UNAUTHORIZED_CLAIM"];
    expect(SkepticReviewSchema.safeParse(r).success).toBe(false);
  });
  it("rejects accepted records in a no-valid-output review", () => {
    const r = emptyReview();
    r.challenges = [
      {
        challenge: {
          id: "CH-S-test",
          scanId: r.scanId,
          createdAt: r.audit.startedAt,
          raisedBy: "Skeptic",
          provenance: "INFERRED",
          status: "open",
          claimId: "C-parent",
          category: "collection-limitation",
          question: "Is the observation window sufficient?",
          evidenceIds: ["E-1"],
        },
        relatedChallengeIds: [],
      },
    ];
    r.audit.acceptedIds = ["CH-S-test"];
    r.audit.status = "no-valid-output";
    r.audit.rejectedCount = 1;
    r.audit.rejectionCodes = ["UNAUTHORIZED_CLAIM"];
    expect(SkepticReviewSchema.safeParse(r).success).toBe(false);
  });
});
