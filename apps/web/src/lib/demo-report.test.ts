import { ScanReportSchema } from "@crossexam/contracts";
import { summarizeVerdicts } from "@crossexam/engine";
import { describe, expect, it } from "vitest";
import { demoReport } from "./demo-report";

describe("fixture report integrity", () => {
  it("validates and is explicitly synthetic", () => {
    expect(ScanReportSchema.safeParse(demoReport).success).toBe(true);
    expect(demoReport.summary.source).toBe("fixture");
    expect(demoReport.evidence.every((item) => item.source === "fixture")).toBe(true);
    expect(new URL(demoReport.summary.targetUrl).hostname).toBe("acme.example");
  });
  it("retains disagreement in the sample verdicts", () => {
    expect(summarizeVerdicts(demoReport)).toEqual({
      confirmed: 3,
      contested: 1,
      unresolved: 1,
      rejected: 0,
    });
  });
  it("rejects fixture evidence in a live report", () => {
    const report = structuredClone(demoReport);
    report.summary.source = "live";
    expect(ScanReportSchema.safeParse(report).success).toBe(false);
  });
  it("rejects dangling evidence references", () => {
    const report = structuredClone(demoReport);
    report.evidence = report.evidence.slice(1);
    report.summary.evidenceCount--;
    expect(ScanReportSchema.safeParse(report).success).toBe(false);
  });
  it("rejects duplicate IDs", () => {
    const report = structuredClone(demoReport);
    const first = demoReport.evidence[0];
    if (!first) throw new Error("Fixture must contain evidence");
    report.evidence.push({ ...first });
    report.summary.evidenceCount++;
    expect(ScanReportSchema.safeParse(report).success).toBe(false);
  });
  it("rejects cross-claim verdicts", () => {
    const report = structuredClone(demoReport);
    const first = report.findings[0];
    if (!first) throw new Error("Fixture must contain findings");
    first.verdictId = "V-002";
    expect(ScanReportSchema.safeParse(report).success).toBe(false);
  });
  it("rejects cross-claim experiment links", () => {
    const report = structuredClone(demoReport);
    const first = report.experiments[0];
    if (!first) throw new Error("Fixture must contain experiments");
    first.challengeId = "CH-002";
    expect(ScanReportSchema.safeParse(report).success).toBe(false);
  });
  it("rejects inaccurate summary counts", () => {
    const report = structuredClone(demoReport);
    report.summary.findingCount = 30;
    expect(ScanReportSchema.safeParse(report).success).toBe(false);
  });
  it("rejects cross-scan evidence", () => {
    const report = structuredClone(demoReport);
    const first = report.evidence[0];
    if (!first) throw new Error("Fixture must contain evidence");
    first.scanId = "another-scan";
    expect(ScanReportSchema.safeParse(report).success).toBe(false);
  });
});
