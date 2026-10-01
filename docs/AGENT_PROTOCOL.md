# Agent protocol

## Record, not conversation

```text
Claim ── cites ──→ Evidence
  └─ Challenge ──→ Experiment ── produces ──→ Evidence
       └───────────────────────────────→ Verdict ──→ Finding
```

Each object has a stable ID. Claims reference a scan and nonempty evidence IDs. Challenges name a claim and a specific question. Experiments name both a claim and challenge, declare non-destructive intent, and retain method/status/evidence. Completed experiments require evidence. Verdicts state a decision and rationale with evidence and experiment references. Findings link back to their claim, verdict, and evidence.

## Roles

| Role | Duty | Output |
| --- | --- | --- |
| Explorer | Describe narrow, testable claims supported by collected evidence | Claims |
| Breaker | Seek counterexamples, transient failures, or scope errors | Challenges |
| Skeptic | Audit evidence quality and causal leaps; identify missing controls | Challenges |
| Reproducer | Propose bounded safe experiments; observe executor results | Experiments |
| Judge | Resolve only what evidence supports, retaining dissent and limitations | Verdicts |

The provider-neutral `AgentProvider.run` maps each role to its output type and accepts a small structured `TribunalState`. Providers receive an AbortSignal and no browser handle. Provider output must eventually be parsed against schemas and checked against permitted IDs before state mutation. This runtime provider layer is not implemented yet; TypeScript alone is not a trust boundary.

## Evidence labels

- **OBSERVED:** a directly collected measurement/artifact under stated conditions.
- **DERIVED:** a repeatable calculation from referenced observations; retain method and inputs.
- **INFERRED:** a hypothesis or interpretation; never silently promoted to observation.
- **SIMULATED:** an illustrative or modeled outcome, never evidence of actual behavior.

`source: fixture` applies to the entire demo regardless of these semantic labels. OBSERVED in the fixture illustrates what a future observation could look like; it is not an actual measurement. The UI labels the entire report and individual evidence records accordingly; activity is marked SIMULATED.

## Decision policy to implement

Verdicts: `confirmed`, `contested`, `insufficient-evidence`, `rejected`. Confirmation is scoped to the specific observation/conditions and requires relevant evidence plus resolution of material challenges. Reproducible claims need successful experiments; non-reproducible claims remain open. Confidence or model consensus cannot replace evidence. Missing-provider and failed-experiment states must be explicit.

Planned bounds: one initial proposal pass, at most two challenge/reproduction rounds, per-role time/token budgets, and a hard scan deadline. Stop rather than manufacture agreement. A deterministic executor must approve allowlisted read-only actions; the model cannot authorize network targets or arbitrary code. Website text, metadata, console strings, and provider text are untrusted data, never instructions.

Current scope: interfaces, schema integrity, and a hand-authored example of this chain. No agents are invoked and no consensus algorithm is implemented.


## Deterministic HTTP investigations

The HTTP collector now produces OBSERVED evidence and DERIVED claims/findings. `proposedBy` and `decidedBy` explicitly use `Deterministic rule`; they do not impersonate Explorer or Judge. A confirmed rule result means its predicate matches the recorded response/HTML, not independent reproduction or tribunal consensus. Live HTTP reports contain no agent runs, challenges, experiments, INFERRED results, or SIMULATED observations. Runtime report checks enforce this distinction for `investigation.mode: deterministic-http`.
