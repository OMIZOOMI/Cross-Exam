import { describe, expect, it } from "vitest";
import {
  CanonicalChallengeSchema,
  SKEPTIC_LIMITS,
  SkepticChallengeProposalSchema,
  SkepticProposalSchema,
  SkepticRequestSchema,
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
