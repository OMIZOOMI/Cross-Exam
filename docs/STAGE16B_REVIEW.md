# Stage 16B owner review packet — offline candidate only

No real fixture/browser operation, credential, provider call, paid release or controlled real release has been created or executed. This packet is **not approval**. Offline fake completion proves no observed navigation, reproduction, challenge resolution, deployment readiness or public admission. CrossExam remains free for all users; Stage 14C paid acceptance remains owner-deferred.

## Fixed candidate fixture manifest

Private authority is defined in `packages/controlled-reproducer/src/fixture-manifest.ts`, independently of the test-only collector table. There is no real-operation function, browser wrapper or generic selector. The existing owned response bytes are compared as source text in offline tests without invoking the fixture.

The descriptor's fields, in canonical serialization order, are:

| Field | Exact value |
| --- | --- |
| schemaVersion | 1 |
| fixtureKey | browser-empty-navigation-v1 |
| operationId | controlled-fixture-empty-navigation-v1 |
| method | GET |
| path | /collector/empty-performance |
| statusCode | 200 |
| contentType | text/html |
| bodySha256 | 5c6172ecdaf0408ad301e116bc5003d6ecbb84f44b93576a5a28d29e99841a3b |
| bodyBytes | 61 |
| titlePresent | true |
| redirects | 0 |
| subresources | 0 |
| workerTimeoutMs | 10000 |
| isolation | accepted-systemd-proxy-root-apparmor-chromium-v1 |

Manifest SHA-256 of `JSON.stringify(descriptor)`: **f7cf62e2d5414c0a341e35f5da1cbe572821988cd67fc061d2e21fc733fd638f**. Offline policy SHA-256: **c6b83a382af09d5150e61fe41d7471d9bbc5cba10350718ca09be17d8710e19c**. The latter binds original-object promotion, reproduction-gap, lineage-only, injected-fake-only/no-observation execution, authorization binding semantics, one attempt/zero retries and the five-second fake deadline. It does **not** authorize real execution; a future real policy/admission contract needs separate review.

## Intended parent and authorization

The owner must select an exact eligible report/optional matching Skeptic review and original frozen Stage 16A run in the same process. Planning must complete with exactly one accepted plan, an accepted Explorer claim, a same-claim accepted Breaker or Skeptic reproduction-gap challenge and one to six available parent-authorized OBSERVED/DERIVED evidence references. Clone/JSON/reconstructed/restarted promotion is prohibited. Fixture source metadata alone does not prove ownership.

`binding.parent.snapshotHash` is the exact normalized report-only hash. Optional admitted review ID/hash are a separate matching pair or null/null. Source run/plan/request/policy/provider/model identities are checked through Stage 16A's existing replay registry. New host-generated controlled run/plan/authorization IDs are distinct from source identities. Canonical controlled-plan hash and explicit intent hash join the source-run/report/review/manifest/policy hashes in the authorization binding; the full release hash binds the complete reservation. Source fake authorization or SIMULATED result never becomes controlled authority or evidence.

Claim/challenge/evidence IDs provide lineage only and select no URL, path, method, parameter or timeout. Every result remains `relation: "lineage-only"`, `claimTested: false`, `challengeResolved: false`.

## Retained future observation fields

A future fully validated real operation may retain only schemaVersion, fixed fixtureKey, source fixture, provenance OBSERVED, completed navigation outcome, HTTP status code, title-present boolean (never title text), redirectCount zero, durationMs from 0 through 10000, capturedAt timestamp, and completeness complete=true/truncated=false. Failed/inconclusive/aborted/timeout/outcome-unknown/not-dispatched or incomplete/raw output has no observed projection. Parsing this future shape alone is not attestation.

The current offline run schema requires observation null, even on completed; fake acknowledgement is explicitly SIMULATED/test-only. It cannot publish a future observation. A later real execution/publication schema must be reviewed separately. No URLs/paths, headers, bodies, HTML/DOM, text, form values, selectors, secrets, errors/stacks, screenshots, traces or raw collection may enter the projection. No record is appended to ScanReport evidence/experiments.

## One-attempt storage and recovery policy

An explicit host-supplied private directory, separate from Stage 14C, stores only bounded offline reservations/receipts today. It has no default production location. Owner/account checks, 0700 directories, 0600 single-link no-follow regular files, exclusive locks, file fsync/atomic rename/directory fsync and a maximum of 16 run directories are enforced. Release/result ceilings are 8/12 KiB; marker/ledger/fake envelope are 1 KiB each. Injected fake acceptance is five seconds, with no retries or deadline increase for Chromium/cgroups.

| Durable state | Recovery action |
| --- | --- |
| No/incomplete/corrupt reservation | Fail closed; no recovered authority |
| Reservation, no marker | Finalize not-dispatched; never retry in place |
| Marker, no valid terminal receipt | Finalize outcome-unknown; never redispatch |
| Matching receipt before final ledger | Reconcile exact identities/hashes, with marker consistency |
| Matching final receipt | Return immutable replay, no executor call |
| Mismatch/corruption | Fail closed; do not repair into new execution authority |

Marker and dispatch ledger must be durable before any fake attempt. Cancellation/failure after consumption conservatively produces outcome-unknown. A new attempt requires a new explicit intent and fresh original-object admission/new authorization. Recovery never promotes or dispatches. Same-host owner-death reclaim requires ESRCH; age, wrong host, live/reused/ambiguous PID never permits reclaim.

The guarantee is **at most one trusted-host dispatch attempt under trusted same-host storage assumptions**. It is not distributed/external at-most-once, authenticated storage against the owning account, or power-loss proof on every filesystem. Fault tests inject interruptions around write/flush/publication boundaries; they do not perform physical power-loss or browser/process cleanup tests. An injected executor is trusted code; cancellation prevents late acceptance, not arbitrary continued work by an uncooperative function.

## Proposed later gated Linux evidence — not enabled

After owner approval and a separately reviewed fixed-operation integration, one manually approval-gated owned-fixture Linux run should reuse the accepted systemd/private-network/sealed-root/exact-AppArmor/Chromium-userns/renderer-seccomp/proxy/cgroup/lifecycle boundary. No automated branch trigger, public target, proxy widening, new capability or security relaxation is authorized here.

The later proof should verify the exact approved manifest and parent/release bindings, marker-before-single-dispatch, real main-document status/title-presence/no redirects, strict complete bounded projection, sandbox/renderer seccomp, AppArmor restriction still enabled, enforcing proxy/no DIRECT fallback, cgroup enforcement and cleanup, zero sentinels, privacy, failure/timeout/cancellation handling and recovery without redispatch. Do not increase existing worker deadlines: candidate 10 seconds lies within the current 1–30-second worker limits and existing 45-second outer service limit. Full results must be reviewed before accepting observed behavior.

## Values unresolved before a real release

- Owner-approved real release/intent ID, approval record, approved real policy/admission version and exact private storage location/retention policy; none exists yet.
- Actual parent report/scan/Tribunal IDs and report snapshot hash, optional admitted Skeptic ID/hash (or explicit absence), original source-run/plan/request/policy hashes and provider/model identity, claim/challenge/evidence IDs, and new controlled run/plan/authorization identities.
- Selected accepted Linux runtime artifact/RootDirectory manifest, deployment/runner identity and gating configuration; no new prepared root or CI run was made.
- Actual dispatch/result timestamps, duration, navigation status, title presence, sandbox/proxy/cleanup/sentinel results and observed projection hash; these cannot be invented offline.

**One next task:** owner review/approval of the exact fixture manifest/release, parent context, retained fields and one-attempt policy. Then separately implement and authorize the first gated Linux fixture run, review its full results, and only then accept observed Stage 16B if every gate passes. No executable real-run command exists in this stage, and no real run is authorized by this packet.
