import { describe, expect, it } from "vitest";
import {
  EvidenceSchema,
  ExperimentSchema,
  FindingSchema,
  ScanInputSchema,
  TargetUrlSchema,
} from "./index";

describe("input syntax boundary (not an SSRF gate)", () => {
  it.each(["https://example.com/path", "http://example.com", " https://example.com "])(
    "accepts valid HTTP syntax: %s",
    (url) => {
      expect(TargetUrlSchema.safeParse(url).success).toBe(true);
    },
  );
  it.each([
    "file:///etc/passwd",
    "ftp://example.com",
    "javascript:alert(1)",
    "https://user:pass@example.com",
    "example.com",
    "",
  ])("rejects disallowed or invalid syntax: %s", (url) => {
    expect(TargetUrlSchema.safeParse(url).success).toBe(false);
  });
  it("defaults and bounds resource limits", () => {
    expect(ScanInputSchema.parse({ targetUrl: "https://example.com" })).toEqual({
      targetUrl: "https://example.com",
      maxPages: 8,
      timeoutMs: 30000,
    });
    expect(
      ScanInputSchema.safeParse({ targetUrl: "https://example.com", maxPages: 100 }).success,
    ).toBe(false);
    expect(
      ScanInputSchema.safeParse({ targetUrl: "https://example.com", timeoutMs: 0 }).success,
    ).toBe(false);
  });
});

describe("evidence discipline", () => {
  it("requires explicit evidence source and provenance", () => {
    expect(EvidenceSchema.safeParse({ id: "E-1", title: "unsupported assertion" }).success).toBe(
      false,
    );
  });
  it("does not allow findings without evidence", () => {
    expect(FindingSchema.shape.evidenceIds.safeParse([]).success).toBe(false);
  });
  it("requires evidence for completed experiments", () => {
    const experiment = {
      id: "X-1",
      claimId: "C-1",
      challengeId: "CH-1",
      method: "Read the public response",
      safety: "non-destructive",
      status: "completed",
      evidenceIds: [],
    };
    expect(ExperimentSchema.safeParse(experiment).success).toBe(false);
    expect(ExperimentSchema.safeParse({ ...experiment, evidenceIds: ["E-1"] }).success).toBe(true);
  });
});
