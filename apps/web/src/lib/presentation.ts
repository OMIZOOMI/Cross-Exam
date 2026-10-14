import type { Claim, Experiment, ScanReport, Verdict } from "@crossexam/contracts";

export const provenanceMeanings: Record<string, string> = {
  OBSERVED: "Directly collected under the recorded conditions.",
  DERIVED: "Calculated deterministically from cited observations.",
  INFERRED: "A hypothesis or interpretation, not an established fact.",
  SIMULATED: "Illustrative or test-only; not an observed result.",
};

export const verdictMeanings: Record<Verdict["status"], string> = {
  confirmed: "Supported under the admitted scope and evidence, not universally true.",
  contested: "Support remains, alongside an unresolved admitted challenge.",
  "insufficient-evidence": "Coverage or support is missing, incomplete, or requires reproduction.",
  rejected:
    "Requires an observed/derived or deterministic contradiction; missing support alone is not rejection.",
};

export function reportClaims(report: ScanReport): Claim[] {
  const claims = new Map<string, Claim>();
  for (const claim of report.claims) claims.set(claim.id, claim);
  for (const claim of report.tribunalRuns.flatMap((run) => run.claims)) claims.set(claim.id, claim);
  return [...claims.values()];
}

/** Display only. Never promotes the demo's legacy experiment to a Stage 16 receipt. */
export function experimentLabel(experiment: Experiment | undefined) {
  if (!experiment) return "None recorded";
  return {
    completed: "Simulated/test-only · not reproduced",
    planned: "Planned-only · not run",
    inconclusive: "Inconclusive · no accepted result",
    blocked: "Blocked · no accepted result",
  }[experiment.status];
}
