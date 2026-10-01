import type { ScanInput, ScanReport } from "@crossexam/contracts";

export type ScanOutcome =
  | { status: "rejected"; code: "TARGET_NOT_ALLOWED"; message: string }
  | { status: "completed"; report: ScanReport }
  | { status: "failed"; code: "SCAN_FAILED" | "CANCELLED"; message: string }
  | { status: "unavailable"; code: "SCANNER_NOT_IMPLEMENTED"; message: string };

export interface ScanRunner {
  run(input: ScanInput, signal?: AbortSignal): Promise<ScanOutcome>;
}

export function summarizeVerdicts(report: ScanReport) {
  return {
    confirmed: report.verdicts.filter((item) => item.status === "confirmed").length,
    contested: report.verdicts.filter((item) => item.status === "contested").length,
    unresolved: report.verdicts.filter((item) => item.status === "insufficient-evidence").length,
    rejected: report.verdicts.filter((item) => item.status === "rejected").length,
  };
}
