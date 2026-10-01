import type {
  AgentRole,
  Challenge,
  Claim,
  Evidence,
  Experiment,
  Verdict,
} from "@crossexam/contracts";

/** Small snapshots of structured state; untrusted website text is data, never instructions. */
export interface TribunalState {
  scanId: string;
  evidence: readonly Evidence[];
  claims: readonly Claim[];
  challenges: readonly Challenge[];
  experiments: readonly Experiment[];
  verdicts: readonly Verdict[];
}

export interface RoleOutput {
  Explorer: { claims: Claim[] };
  Breaker: { challenges: Challenge[] };
  Skeptic: { challenges: Challenge[] };
  Reproducer: { experiments: Experiment[] };
  Judge: { verdicts: Verdict[] };
}

export interface AgentProvider {
  readonly id: string;
  run<R extends AgentRole>(request: {
    role: R;
    state: Readonly<TribunalState>;
    signal?: AbortSignal;
  }): Promise<RoleOutput[R]>;
}

// Reproducer proposals must go through a deterministic, allowlisted executor.
// A provider receives neither browser handles nor arbitrary network tools.
export const TRIBUNAL_STAGES = [
  "Explorer",
  "Breaker",
  "Skeptic",
  "Reproducer",
  "Judge",
] as const satisfies readonly AgentRole[];

export const ROLE_RESPONSIBILITIES: Record<AgentRole, string> = {
  Explorer: "Propose narrow claims grounded in collected evidence.",
  Breaker: "Find counterexamples and challenge the scope of claims.",
  Skeptic: "Check evidence quality, causal leaps, and alternative explanations.",
  Reproducer: "Propose bounded, non-destructive experiments for a safe executor.",
  Judge: "Weigh evidence and unresolved challenges; explicitly preserve uncertainty.",
};
