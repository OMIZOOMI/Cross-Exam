import type { ScanReport } from "@crossexam/contracts";
import { describe, expect, it } from "vitest";
import { demoReport } from "./demo-report";
import { experimentLabel, provenanceMeanings, reportClaims, verdictMeanings } from "./presentation";

describe("presentation does not create authority", () => {
  it("keeps base claims intact and does not infer a TribunalRun", () => {
    const before = JSON.stringify(demoReport);
    expect(reportClaims(demoReport)).toEqual(demoReport.claims);
    expect(demoReport.tribunalRuns).toEqual([]);
    expect(JSON.stringify(demoReport)).toBe(before);
  });
  it("includes overlay-only claims without counting the same ID twice", () => {
    // Only fields used by the pure display helper, not an admitted execution artifact.
    const base = demoReport.claims[0];
    if (!base) throw new Error("Missing test fixture");
    const report = {
      ...demoReport,
      tribunalRuns: [{ claims: [base, { ...base, id: "overlay-only" }] }],
    } as ScanReport;
    expect(reportClaims(report).map((claim) => claim.id)).toEqual([
      ...demoReport.claims.map((claim) => claim.id),
      "overlay-only",
    ]);
  });
  it("never calls a synthetic completed experiment observed reproduction", () => {
    const example = demoReport.experiments[0];
    if (!example) throw new Error("Missing test fixture");
    expect(experimentLabel(example)).toBe("Simulated/test-only · not reproduced");
    expect(experimentLabel({ ...example, status: "planned" })).toBe("Planned-only · not run");
    expect(experimentLabel({ ...example, status: "inconclusive" })).toContain("no accepted result");
    expect(experimentLabel({ ...example, status: "blocked" })).toContain("no accepted result");
    expect(experimentLabel(undefined)).toBe("None recorded");
  });
  it("retains all four verdict meanings, with scoped support and rejection requirements", () => {
    expect(Object.keys(verdictMeanings)).toEqual([
      "confirmed",
      "contested",
      "insufficient-evidence",
      "rejected",
    ]);
    expect(verdictMeanings.confirmed).toContain("not universally true");
    expect(verdictMeanings.rejected).toContain("missing support alone is not rejection");
    expect(provenanceMeanings.INFERRED).toContain("not an established fact");
    expect(provenanceMeanings.SIMULATED).toContain("not an observed result");
  });
});
