# Agent protocol

## Stage 14C controlled adapter extension

The Stage 14B semantics below remain authoritative. Stage 14C adds one isolated official Responses adapter and an explicit external export narrower than the internal role view: scan/source/time fields are removed, fixed labels/limitations and code-specific numeric/presence facts only. Breaker receives just accepted claim proposal content plus host ID/INFERRED attribution. Separate strict wire schemas normalize only `missingEvidence:null` to absence; original host validation follows.

A trusted host pre-dispatch hook durably consumes one release/role slot and issues a one-use exact-body authorization. A finalized-role checkpoint hook persists actual canonical records/audit before the next role. Neither hook is passed to a provider/model. Optional profile/reasoning/receipt/reasoning-token audit fields preserve old fake reports. Provider failures additionally distinguish quota/rate/refusal/incomplete/limit; raw errors and reasoning remain excluded. Recovery reconstructs only from actual finalized checkpoints, never fabricating an absent role audit or making a provider call. See [Stage 14C record](STAGE14C_PROVIDER.md). Public/live admission and paid acceptance remain disabled/unverified.

## Stage 14B: proposals cross a host trust boundary

```text
Collected Evidence → provider-safe digest → Explorer proposal
  → host validation → canonical Claim → Breaker proposal
  → host validation → canonical Challenge
```

Models and website content are untrusted. The host alone assigns IDs, scan linkage, timestamps, attribution, provenance, status, budgets and authorized references. Models cannot create evidence, canonical records, findings, experiments or verdicts. Stage 14B implements only Explorer and Breaker with injected deterministic fake adapters. There is no provider SDK, model network request, framework, agent tool or public submission integration.

`@crossexam/agents` exposes `createTribunalSession(report, { Explorer, Breaker })`. Its validated report snapshot and returned report are deeply frozen. `session.run({signal})` performs at most one call per role, sequentially, and publishes a complete validated overlay. Concurrent/repeated calls reuse the same promise and IDs; a persisted report containing an overlay is returned without new calls. This is snapshot-level idempotency, not distributed request deduplication or an authenticated persistence/admission API. The first call owns cancellation.

## Proposal v1

Strict Zod schemas reject unknown fields at every proposal level. Explorer returns at most five evidence-backed claims with statement, scope observation/conditions/limitations, falsifier and up to six unique evidence IDs. Bounds are 480/160/320 characters, four conditions and six limitations. Breaker returns at most eight challenges, three per accepted Explorer claim, with category, question, evidence IDs and conditional missingEvidence. Only missing-evidence may have no references; that case requires a nonempty description. Other categories prohibit missingEvidence and require a reference. The eight category names are fixed in `contracts/src/tribunal.ts`.

The host rejects unknown/fabricated/excluded references. Breaker cannot challenge deterministic base claims or another scan/session's claims. Structure failure rejects the entire response; semantic reference/privacy/duplicate failures reject individual proposals and mark partial-rejection. Canonical claims/challenges are INFERRED and attributed to Explorer/Breaker. Existing OBSERVED/DERIVED evidence never changes. Case/whitespace/Unicode-normalized statement plus sorted references deduplicate claims, including existing deterministic claims. Challenges deduplicate claim/category/question/references/missingEvidence. Hard cardinality caps also bound distinct paraphrases.

## Provider export v1

`evidence-digest.ts` is a separate allowlisted projection, not a generic serialization of Evidence.data. Only known code/collector pairs with OBSERVED or DERIVED provenance qualify. SIMULATED, INFERRED, unknown collectors and unprojectable records are excluded and counted. At most 256 candidate records are examined and 96 digests retained in input order. Each digest is <=4 KiB; the catalog reserves 32 KiB of the <=128 KiB complete request/view budget for the envelope and accepted claims.

V1 deliberately exports **no website text or URL string**. Titles/details are host-authored code labels; facts are code-specific numbers, booleans or explicit null. Header values become presence booleans. Browser JSON observations are size-checked, parsed and projected by code; console/error text, DOM attributes, axe data, URLs, bodies and generic nested objects are never copied. Location is protocol plus a document ordinal; host/path/query/fragment/userinfo and network addresses are absent. The ordinal associates observations of the same origin/path, ignoring query/fragment, but cannot locate/reproduce a page on its own. Host-owned scan/evidence IDs and captured time remain available. Completeness records omissions and available collection truncation; unknown completeness is null.

Explorer receives collection layers, fixed limitations and the evidence catalog, with no deterministic Findings or claims. Breaker receives the same catalog and only accepted canonical Explorer claims. Requests separate fixed instructions from structured untrusted data. Retained provider-generated text remains inert data with no tool authority; a conservative secondary guard rejects URL/IP/path/credential-assignment/key-pattern/HTML text before acceptance/export. This guard is not a universal DLP guarantee. Exporting website text in a future digest version requires separate privacy/injection review, not reuse of persistence sanitation.

## Calls, failure and audit

Explorer: one call, 20 seconds, requested output cap 768 tokens. Breaker: one call, 20 seconds, 1024 tokens. Whole tribunal: 45 seconds, no semantic retries. Breaker skips with no accepted claims. No exportable evidence skips both roles. Responses must be <=24 KiB UTF-8 **before JSON parsing**; object payload serialization rejects getters, toJSON, symbols, exotic/cyclic/sparse data, excessive nesting/cardinality and non-JSON values. Failure envelopes and usage metadata are separately checked. Input/output usage must be bounded integers or unavailable null; output usage above the role cap rejects the response.

`UntrustedProviderResult` contains unknown payload with optional bounded adapter-reported usage, or a categorized configuration/unavailable/transport/timeout/abort failure. Missing usage remains null, never fabricated zero. There is no tokenizer or real provider in this stage: token limits are request constraints plus reported-usage validation, not independent billing/token attestation. Future trusted adapters must enforce server-side token/transport-body limits and cancellation. Host timeouts stop acceptance and signal abort; late promises cannot mutate state. An adapter ignoring abort may continue its own work. In-process adapters are trusted host code, not a JavaScript/process sandbox; only model response data is untrusted. No adapter receives mutation callbacks or raw reports.

One TribunalRun v1 overlay contains two bounded AgentRun audit records, ordered Explorer then Breaker, including skipped/failure records. Host identities, scan/role/provider/model, start/finish/monotonic elapsed time, schema versions/structural JSON-schema hashes, request/response hashes, status, usage, accepted IDs, exact recognizable proposal rejection counts, explicit rejectedCountKnown (false for undecodable output), bounded codes and call/time/token budgets are retained. JSON-schema hashes identify structure; versioned host policy covers refinements/reference semantics. Invalid/oversized raw outputs, raw provider exceptions, credentials, chain-of-thought and reasoning traces are not retained. Oversized/unserializable responses have no response hash; bounded malformed JSON is hashed without persistence.

A valid empty Breaker response completes with no challenges; this is not a verdict or agreement. An empty Explorer response has no valid output and skips Breaker. Completion, partial rejection, no valid output, configuration/provider/transport failure, timeout, abort, malformed output, schema failure, limit exceeded and skipped are distinct. An authorized Explorer result may survive a later failed/aborted Breaker as a partial/aborted overlay; no half-authorized item or prior report mutation is published. The complete next report is schema-validated before return. Callers receive a new immutable report; there is no storage side effect.

## Report v2 migration

ScanReport v2 requires claim scope/falsifier/createdAt/status, challenge category/scanId/createdAt/provenance and `tribunalRuns` (zero or one). Deterministic producers and demo/live fixtures explicitly populate the new fields. Deterministic claims can retain up to 96 references and longer bounded statements; agent claims remain <=6 references/480 characters. The duplicate-title HTTP rule already cites eight pages, which must not be silently truncated to the model budget.

Base findings/verdicts/claims and the demo's legacy narrative agentRuns retain their existing meanings. New activity exists only in `tribunalRuns[].agentRuns`; the overlay adds no findings/verdicts or UI behavior. Deterministic HTTP report validation still prohibits invented base agent activity. V1 persisted local reports fail validation and must be recollected; required scope/authority fields are not invented by an automatic compatibility reader. The local report store is ephemeral, not a deployment migration system.

## Evidence and future roles

OBSERVED is directly collected; DERIVED is deterministic calculation; INFERRED is hypothesis; SIMULATED is illustration. Fixture source alone does not imply SIMULATED: owned browser fixture observations can be real. The hand-authored demo stays an explicitly labeled example, with no tribunal run.

Skeptic, Reproducer and Judge, experiments, verdict generation and real adapters are deferred. Existing deterministic HTTP findings confirm only predicates over returned responses/HTML, not reproduction, causality or AI consensus. Public Chromium launch remains fail-closed with ISOLATION_UNAVAILABLE. Stage 14C must separately review provider configuration, transport, token enforcement, cancellation and admission; Stage 14B grants no network, browser, shell, filesystem or action authority to models.
