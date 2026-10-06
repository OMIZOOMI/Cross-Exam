# Current state

## Stage 16B.1 — offline real-path preparation; approval packet blocked

Started clean on exact local/remote Stage 16B source **0b2b0aa56e660bd5862a9b5f979a19e00f659984**; created only `feature/stage16b1-fixture-preflight`. Main remains **9bafdb5df0d97668abd66e09fa342610da323ace**; all accepted branches and fake-only Stage 16A/16B artifact/ledger semantics remain unchanged.

Separate real-path observation/release/run contracts, fixed disabled runner/configuration, pinned host input and operator stage/preview prepare durable pending-approval records. Same-process fixed fake planning and original-object attestation bind the exact parent/review/source/plan/request/policy/ref identities; restart preview/recovery never re-promotes serialized source data. A distinct real staging ledger preserves pending approval without automatic cancellation/expiry/dispatch, supports explicit terminal actions, and fault-tests approval/marker/hash-before-fake-dispatch, one-attempt unknown recovery and exact terminal reconciliation/replay. Real invocation and observation publication are unconditionally disabled; synthetic test-only terminal receipts are separate from execution-attested real runs. No full report or raw collection is retained. See [protocol](AGENT_PROTOCOL.md#stage-16b1-real-path-preparation-and-pending-intent) and [review packet](STAGE16B_REVIEW.md).

Local validation: `pnpm test:fixture-preflight` **164 PASS / two files** (93 staging, 71 contracts); `pnpm test:controlled-reproducer` **212 PASS / three files**; `pnpm test:tribunal` **491 PASS / eight files** (including Stage 16A/Skeptic); offline provider/ledger/operator regressions **167 PASS / five files**. `pnpm lint` PASS (188 files), root/all-nine-workspace `pnpm typecheck` PASS, `pnpm test` **1,664 PASS / 47 files**, `pnpm build` and `git diff --check` PASS. Full tests were repeated after the final host-binding check; both full passes succeeded. Local checks used the existing pnpm pre-run-verification override and local socket/IPC permission described in the historical Stage 16B record; CI used normal commands. The resumed delivery verified these prior actual results and did not rerun the full suite or change code.

Implementation **ad7fc46fb391f41dc86a7fbf6b16f397b8bb33e9** was committed/pushed only to `feature/stage16b1-fixture-preflight`, now tracking its same-named origin branch. [Ordinary offline Node CI run 37420818616](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37420818616), **attempt 1 PASS**, was verified on that exact SHA, including every job step: frozen install, lint/typecheck, Skeptic/Reproducer/controlled/preflight/combined agent-contract, provider/ledger/operator, full units and build. GitHub's branch run inventory contains only the Tribunal/Node workflow, with no Linux/browser run. Remote main and all prior accepted milestone heads remain unchanged. This final documentation-only receipt commit uses `[skip ci]`; validated implementation code is unchanged.

From that clean implementation commit, the existing non-dispatching operator stage was used **once** to create local intent **stage16b1-local-ad7fc46-001**. A fresh-process read-only preview reproduced identical packet bytes/receipt, with unchanged ledger files, modes and modification times. Raw release/receipt hashes were independently verified. Canonical receipt **3,662 bytes**, SHA-256 **d7bcf2e8a27006cdfc18752d0d08cd54f20752981044e277d34438c6bdadecff**; canonical full packet **7,263 bytes**, within 24 KiB. Private candidate metadata and ledger are outside Git under `/Users/Om/Om Projects/.crossexam-stage16b1-ad7fc46`, owner UID 503, directories 0700/files 0600. Only release/ledger/receipt exist in the intent namespace; approval/dispatch/result hashes are null. State is **pending-approval**, approvalReady=false. Exact identities/hashes/configuration, storage/retention and blockers are in [STAGE16B_REVIEW](STAGE16B_REVIEW.md). No owner approval was requested, no intent was cancelled/expired, and staging was not repeated. The local pending record is not a Linux dispatch capability.

A new operator-script import initially failed fresh-process preview and was corrected; an initial missing injected-fake mode in the Skeptic configuration was corrected by type checking. No security relaxation was used. Diff/privacy review confirms only new real-path host/contracts/tests, operator/package exports/scripts, ordinary Node workflow and four docs changed. Accepted fake code/ledger, dependencies, browser/proxy/Linux and Stage 14C code remain untouched. No generated reports, credentials, raw observations or browser assets are included. No browser, real fixture, Linux acceptance, provider/credential, owner approval, OBSERVED publication or paid release/call has run. Stage 14C, ScanReport, prior canonical artifacts, public routes/UI, proxy/Linux/AppArmor/cgroups, and free-for-all product policy remain unchanged.

**Blocker before any owner approval request:** the prepared Linux root manifest/Chromium binary identities and production owner-authority loader are not provisioned on this macOS host, and the fixed real runner remains disabled. The future packet must bind the intended Linux host's exact runtime/storage identities; local staging is not transferable authority. One next task is to resolve these pre-approval runtime/authority values offline and restage a coherent exact packet, without invoking the fixture. Owner approval precedes the later gated Linux run and its full result review. Observed Stage 16B acceptance and public browser admission remain DISABLED/pending.

## Stage 16B controlled Reproducer — COMPLETE offline, observed acceptance pending

Started clean on local/remote `feature/stage16-reproducer-offline` at exact **137771e8fb753cd237362c4dcfbbd341e8fb9ac8**; created only `feature/stage16b-controlled-reproducer-offline`. Main remains **9bafdb5df0d97668abd66e09fa342610da323ace** and accepted branches are preserved. Existing Stage 16A corrected snapshot/review bindings, original-object provenance and SIMULATED-only behavior remain unchanged.

Separate strict controlled intent/plan/release/dispatch/ledger/run contracts and `@crossexam/controlled-reproducer` now implement original-object promotion, exact parent/plan/request/policy/reference binding, new controlled plan/authorization identity, fixed private candidate descriptor and a same-host durable one-attempt ledger with injected fake execution only. Recovery/replay never redispatches: unmarked reservation becomes not-dispatched; consumed marker without final output becomes outcome-unknown; exact result-before-final-ledger reconciles; corruption fails closed. Controlled results are immutable lineage-only operation-proof receipts with claimTested/challengeResolved false, SIMULATED/test-only acknowledgements and **observation always null**. No report evidence/experiment mutation or real operation path exists. [Exact protocol](AGENT_PROTOCOL.md#stage-16b-offline-controlled-reproducer-boundary) and [owner review packet](STAGE16B_REVIEW.md) record bounds, manifest/hashes, privacy, storage assumptions and unresolved real-release values.

Local validation: `pnpm test:controlled-reproducer` **119 PASS / two files**, including 26 write/flush/publication interruption cases and interrupted recovery, missing dispatch-hash rejection, original/serialized admission, hashes, concurrent attempts, timeout/abort/late results and privacy. `pnpm test:tribunal` **420 PASS / seven files**, including all existing Stage 16A/Skeptic/tribunal tests; combined offline provider/ledger/operator regression **167 PASS / five files**. `pnpm lint`, root/all-nine-workspace `pnpm typecheck`, `pnpm test` **1,500 PASS / 45 files**, `pnpm build` and `git diff --check` PASS. One final full unit/build pass. Focused development found and fixed dispatch-ledger/result coherence before full validation. The first restricted provider regression had one existing tsx IPC listen EPERM failure; unchanged code passed with local socket/IPC permission, also used for the full unit/build pass. Local pnpm automatic pre-run dependency verification attempted a non-TTY reinstall; after normal frozen-lockfile installation, local checks used `pnpm_config_verify_deps_before_run=false` (no repository configuration or dependency-version change). CI uses ordinary unmodified pnpm commands and a frozen install.

Implementation **d1a41a71f21863298a1dd3c52be5329171e760c7** was committed/pushed only to `feature/stage16b-controlled-reproducer-offline`. [Ordinary offline Node CI run 37409928780](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37409928780), **attempt 1 PASS**, was verified on that exact implementation SHA: frozen install, lint, typecheck, Skeptic/Reproducer/controlled-Reproducer/combined agent-contract suites, provider/ledger/operator regressions, full unit suite and production build all passed. Run conclusion, head SHA and every job step were verified through GitHub's public API; counts above are local results. No retry or code correction was needed. Only the ordinary Tribunal/Node workflow ran for this branch; the Linux/browser fixture workflow has no trigger for it. Manifest/policy hashes in the owner packet were also recomputed from the pure private metadata module and matched exactly, without invoking the fixture.

Stage 16B is **COMPLETE only for the offline boundary**; real observed behavior is not accepted. This final receipt is a separate documentation-only `[skip ci]` commit with validated code unchanged. No provider, credential, paid/controlled real release, Chromium, fixture operation or Linux acceptance has run. Browser/isolation/proxy/cgroup/AppArmor controls, Stage 14C, public routes/UI and billing remain unchanged. Public arbitrary browser scanning remains DISABLED and CrossExam stays free for all users.

Final privacy/security diff review: only the new controlled package/contracts/tests, one call-free internal Stage 16A attestation export, package exports/script/lockfile importer, ordinary offline workflow and four docs changed. No secrets, raw collections, generated artifacts, browser/egress/isolation files, public routes or Stage 14C files changed. No fixture selector, real operation, observation publisher, network adapter or admission widening was added. Same-host storage/OS-account integrity and cooperative cancellation remain explicit limitations; offline fakes establish no actual sandbox or process cleanup.

**One next task:** owner review and approval of the exact fixture manifest/release, parent context, retained fields and one-attempt policy in the packet, before separately implementing/running a gated Linux fixture proof. Offline completion alone is not observed Stage 16B acceptance or deployment readiness. The first real run and its full result review are later separate gates.

## Stage 16A offline Reproducer — COMPLETE for injected fakes with corrected snapshot binding

**Acceptance correction (2026-10-06):** Started clean on the existing local/remote `feature/stage16-reproducer-offline` at exact **561ac9ad40fd20ae4ad01c4324fa15269005280a**. The initial delivery used a composite report/review digest in `parent.snapshotHash`; this contradicted its specified report-only identity. The correction is now validated locally and in ordinary offline Node CI. Prior implementation/CI results are retained below as historical pre-correction results.

The corrected `run.parent.snapshotHash` equals shared Skeptic admission's exact normalized report hash. Optional `skepticReviewId`/`skepticReviewHash` remain a matching admitted immutable review's ID and existing deterministic serialization hash, or null/null. Authorization's `parentSnapshotHash` equals the report hash; new required nullable `parentSkepticReviewHash` equals the separate review hash, enforced by run cross-field validation. `bindingHash` remains the composite over both parent hashes, run/session/plan identity, canonical plan hash and operation-policy hash. Corrected binding semantics change the policy identity. Complete-parent/request/schema/policy/provider/model replay still rejects report changes, review-only changes and review addition/removal; only matching original immutable objects replay without calls. No ScanReport/Tribunal/Skeptic migration, operation implementation or serialized recovery was added.

Correction local validation: `pnpm test:reproducer` **136 PASS / two files**; `pnpm test:skeptic` **133 PASS / two files**; `pnpm test:tribunal` **388 PASS / six files**; `pnpm lint`, root/all-eight-workspace `pnpm typecheck`, `pnpm test` **1,381 PASS / 43 files**, `pnpm build` and `git diff --check` PASS. Thirteen new focused cases cover independent report/review identities, required nullable metadata and null-pair/mismatch rejection, authorization invalidation with other identities fixed, and review addition/removal/change replay rejection without redispatch. Existing empty/all-rejected, one-use, cancellation/late-result and consumed outcome-unknown regressions pass. Initial lint required formatting two new assertions, fixed before validation. The first restricted full-unit attempt had 36 failures plus two unhandled socket errors: local loopback/Unix socket/tsx IPC listen EPERM, including two socket-fixture timeouts. The unchanged code passed all 1,381 tests when rerun with local socket/IPC permission, followed by one successful production build; no product security control was relaxed.

Correction implementation **c041a3247ac4913cbcf102037f64d647d235f7c6** was committed/pushed only to `feature/stage16-reproducer-offline`. [Ordinary offline Ubuntu Node CI run 37393286885](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37393286885), **attempt 1 PASS** on that exact SHA: frozen install, lint, typecheck, Skeptic/Reproducer/combined agent-contract tests, provider/ledger/operator tests, full unit suite and production build all completed successfully. Exact head SHA, run/attempt conclusion and every job step were verified through GitHub's status API; test counts above are the local results. No CI retry or new Linux/browser run. Stage 16A is COMPLETE for offline injected fakes with the corrected binding; no real reproduction is proven. This final receipt is a separate documentation-only `[skip ci]` commit with validated code unchanged.

Diff/privacy review: only three Reproducer host/authorization/contract files, their two focused test files and these three project docs changed. No secrets, new data export, generated artifacts, real operation implementation or Stage 14C/browser/engine/web/UI/public-admission change. Main and all previous accepted branch heads remain unchanged; no new branch, merge, PR or force-push. Stage 14C paid acceptance remains owner-deferred; public arbitrary browser scanning remains DISABLED. CrossExam stays free for all users. No credential, paid release/provider call, real fixture/browser operation, Stage 16B work, browser/Linux acceptance or previous-branch change is authorized or performed by this correction.

### Historical initial Stage 16A delivery (before binding correction)

Started clean on local/remote feature/stage15-skeptic-offline at exact **bd150e0f91cb86815299f81d90b34a142ea1a476**; created only feature/stage16-reproducer-offline. Main remains **9bafdb5df0d97668abd66e09fa342610da323ace**; prior accepted branches are preserved. Stage 15's corrected empty semantics remain accepted. Sections below are historical milestone records.

Separate strict Reproducer request/proposal/plan/run/authorization-metadata/audit contracts and a fake-only session implement zero-or-one planning, parent/reference/privacy checks, a fixed operation-ID interface without implementation, synchronous one-use in-process authorization, fake execution, deadline/cancellation/late-result rejection and original-object replay. No ScanReport.experiments, Tribunal two-role tuple or parent artifact mutation. Optional Skeptic admission reuses existing exact-snapshot replay checks without a Skeptic call. See [protocol and exact guarantees](AGENT_PROTOCOL.md#stage-16a-offline-reproducer-planning-and-authorization).

Valid empty planning completes with zero plans/rejections and no authorization/execution; one accepted plan completes; one semantic rejection is no-valid-output with exactly one known rejection; multiple plans/malformed structure fail wholly. No Reproducer partial-rejection status. Accepted fake output is only SIMULATED/test-only; consumed authorization without validated final result is outcome-unknown. Neither planning nor fake execution establishes reproduction, agreement, safety, truth, Findings or verdicts. Only original frozen run objects issued in this process replay without calls. No serialized recovery, durable storage, crash/restart guarantee or external at-most-once claim.

Bounds: request/planner-envelope/executor-envelope/run 128/24/1/32 KiB; one plan/six references; one planner call/768 requested output tokens/20 seconds, one fake executor attempt/5 seconds, whole-session acceptance 25 seconds, zero retries. Numeric/presence-only projection, conservative text guard, browser/proxy/SSRF/AppArmor/root/cgroup/worker deadlines and public fail-closed launcher are unchanged. Injected functions are trusted, not sandboxed; abort prevents late acceptance but cannot terminate uncooperative code.

Final local validation: `pnpm test:reproducer` **123 PASS / two files**; `pnpm test:skeptic` **133 PASS**; focused `pnpm test:tribunal` **374 PASS** before the final added response-classification regression (all **375** combined tests pass in the final full suite); `pnpm test:provider` **66 PASS**; `pnpm test:provider-ledger` **72 PASS**; `pnpm test:provider-operator` **29 PASS**. `pnpm lint`, root/all-workspace `pnpm typecheck`, `pnpm test` **1,368 PASS / 43 files**, `pnpm build` and `git diff --check` PASS. One final full suite/build pass. Early focused development exposed three test fixture/assertion mistakes and literal/mock types; corrected before final validation. Review found and corrected one envelope classification edge case (valid usage alongside invalid structure is schema-failure), with a regression. No final local failures remain.

Implementation **ec737a24ff59ae4199816c93b102fd92f91eb9b8** was committed/pushed only to feature/stage16-reproducer-offline. [Ordinary offline Ubuntu Node CI run 37365200055](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37365200055), attempt 1: workflow FAILURE / job CANCELLED before acquiring a runner, with zero validation steps executed. GitHub's annotation: "The job was not acquired by Runner of type hosted even after multiple attempts". One retry of that same job/commit, **attempt 2 PASS**: frozen install, lint, root/workspace typecheck, **133 Skeptic / 123 Reproducer / 375 combined agent-contract / 66 provider / 72 ledger / 29 operator / 1,368 full unit tests (43 files)** and production build all passed. Logs and the successful run's exact implementation SHA were verified. No Linux/browser run, code correction, new implementation commit or security change was made for the retry. Stage 16A is **COMPLETE for offline injected fakes**, with no real reproduction proven. This final evidence receipt is a separate documentation-only [skip ci] commit; validated code is unchanged. Main and prior accepted branches remain frozen; no merge, PR or force-push.

Diff/privacy review: only new Reproducer contracts/session/authorization/tests, one call-free internal Skeptic admission export, package exports/test script, offline Node workflow and these three docs changed. Existing Stage 14C package/operator/fixture/acceptance packet, provider-safe projection, tribunal/Skeptic contracts, web/UI/scanner/browser/engine/Linux code remain unchanged. No credentials, generated reports/artifacts, provider data, public targets, new storage or isolation changes are included. No browser/Linux acceptance is needed for contracts/fakes; no real fixture operation, actual credential, paid release or provider call is authorized or run. Stage 14C remains **offline implemented, real-provider acceptance pending**, explicitly deferred by the owner. CrossExam stays free for all users, with no billing/paywall change. Public arbitrary browser scanning remains DISABLED.

Recommended next task after Stage 16A acceptance: **separately reviewed controlled-fixture Reproducer operation and observed-result acceptance**, using the verified isolation/proxy/lifecycle and fixed host admission, without public targets or real provider calls.

## Stage 15 offline Skeptic — COMPLETE with corrected empty-response semantics

**Empty-response correction (2026-10-05):** GPT-6 Astra Max clarified that valid challenges: [] is completed, with one call, request/response hashes and known zero accepted/rejected items. no-valid-output requires one or more proposals all rejected by semantic/reference/privacy checks, a positive known rejection count and at least one code. Neither state establishes agreement, safety, truth or a verdict. Existing parent binding, limits, privacy, cancellation and matching replay are unchanged. This correction starts clean at `a8e381d5cb7b3b2059ae5dbde32d9d8b5179655f` on the existing Stage 15 branch; no new branch, Stage 14C, public/browser/Linux, billing or provider execution change. The clarified rule is now validated locally and in ordinary offline Node CI. Stage 15 is COMPLETE for injected fake providers with this correction; Stage 16 was not started. Prior implementation results below are historical pre-correction results.


Correction validation: `pnpm test:skeptic` **133 PASS / two files**; `pnpm test:tribunal` **252 PASS / four files**; `pnpm lint` PASS; `pnpm typecheck` PASS (root/all eight workspaces); `pnpm test` **1,245 PASS / 41 files**; `pnpm build` PASS. No local check failed. Added regression tests cover completed empty metadata, positive semantic/reference/privacy rejection counts, invalid completed/no-valid-output audit states and matching immutable replay of both valid states with zero new calls. Diff/privacy review and `git diff --check` passed; only the Skeptic host/contracts, their two test files, agent protocol and this Stage 15 record changed. No new browser/Linux acceptance is needed or run. Correction implementation **21e582dd63a3292b2ff5b51a8cb9474bf3040657** was committed/pushed only to `feature/stage15-skeptic-offline`. [Ordinary offline Ubuntu Node CI run 37302394450](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37302394450) **PASS** on that exact SHA: frozen install, lint, root/workspace typecheck, 133 Skeptic / 252 tribunal-contract / 66 provider / 72 ledger / 29 operator tests and 1,245 full units / 41 files. One normal run with no failures, correction retry, real provider call or new browser/Linux run. Final receipt documentation is a separate `[skip ci]` commit; validated executable code is unchanged. Main, Stage 14C and all prior accepted branches remain unchanged; no new branch, merge, PR or force-push.

Started clean from `feature/stage14c-controlled-provider` at exact `e942e8e0faf2d77029edaef3956b8198e2a898db`; created only `feature/stage15-skeptic-offline`. Main remains `9bafdb5df0d97668abd66e09fa342610da323ace`. A separate `SkepticReview` v1 and `createSkepticSession` admit finalized fixture parents, project immutable allowlisted evidence/accepted claim/challenge views, validate one fake response and publish host-owned INFERRED/open challenges beside same-claim Breaker links. Snapshot-bound replay returns original audit/records without another call. No report v2/tribunal v1/two-role audit/canonical Challenge migration, Stage 14C release/operator/provider integration or public route.

Implemented request/response/artifact caps 128/24/64 KiB, six total/two-per-claim proposals, six evidence/three related references, 20-second separate deadline, 1,024 requested output tokens and zero retries. Shared existing text/privacy/deduplication behavior is unchanged. Missing/unsafe/mixed parents or unavailable cited evidence fail before invocation; failed/aborted/no-claim parents skip. A failed/empty Breaker can still be reviewed with its actual status exposed. Immutable outputs/audit include parent snapshot hash and current schema/policy identities; no raw outputs/reasoning/errors or generic report/page content export.

Final local validation: `pnpm lint` PASS; `pnpm typecheck` PASS (root/all eight workspaces); `pnpm test:skeptic` **114 PASS / two files**; `pnpm test:tribunal` **233 PASS (119 existing + 114 new)**; `pnpm test:provider` **66 PASS**; `pnpm test:provider-ledger` **72 PASS**; `pnpm test:provider-operator` **29 PASS**; `pnpm test` **1,226 PASS / 41 files**; `pnpm build` PASS; `pnpm scanner:smoke` **1 PASS / 33 intentionally skipped**; `pnpm test:e2e` **22 PASS** on final run. Full units/build ran once after focused development. The first lint gate needed export ordering; it was corrected before full tests. The initial restricted operator CLI test hit tsx pipe EPERM and passed with local IPC permission. Initial E2E was 21/22: the mobile demo evidence button did not switch views once; it passed the focused rerun (1/1) and subsequent full run (22/22). Exact transient UI cause is unproven; no UI/test changes or automatic retries were added. Next's generated dev type-reference edits were excluded from delivery. Ordinary offline Node CI passed on the implementation SHA below; Stage 15 is COMPLETE for injected fake providers only.

Independent keyless preview verification: owned fixture snapshot **c418e840c4d0ea98cca6554fe008d41612423202e86e008c43e5088c1ee7c7ad**, exact Explorer body **3,540 UTF-8 bytes**, SHA-256 **426a10b6b1b54ac683fa8427ba228e8f8ccd444149763d650a0840d4ccf130c4**. Body matches the unchanged acceptance packet byte for byte; Breaker remains conditional with no invented body. The Stage 15 prompt accidentally repeated the final hash suffix; the actual 64-character packet/hash is authoritative. No acceptance execute or paid call was run.

Privacy/security diff review passed: separate contracts/session/tests, existing helper extraction, package exports/test command, normal Node workflow and five project docs only. Stage 14C provider/controlled-host/operator/packet/fixture source and original tribunal schema are unchanged. No web/UI/scanner/browser/engine/isolation/public-admission changes or generated report/profile/trace/screenshot/credential files are included. Main and all prior remote milestones were verified unchanged before push.

**Stage 14C: offline implemented, real-provider acceptance pending. The owner explicitly deferred the paid API test.** No actual credential, paid release, provider execution, account setting, web/UI or user billing change. Public arbitrary browser scanning remains DISABLED. No browser/engine/proxy/Linux/AppArmor/root/cgroup/deadline/cleanup changes, so no new Linux acceptance run is required. In-process injected adapters remain trusted host code, not sandboxed; replay is offline snapshot validation, not authenticated storage or paid/distributed idempotency. Validation does not establish the truth of an objection.

Implementation **3e7018a82e0b89177ef1e1904f91072c12318081** was committed/pushed only to `feature/stage15-skeptic-offline`. [Ordinary Ubuntu Node CI run 37299244957](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37299244957) **PASS** on that exact SHA: frozen install, lint, root/workspace typecheck, 114 Skeptic / 233 tribunal-contract / 66 provider / 72 ledger / 29 operator tests and 1,226 full units / 41 files. One normal run; no CI retry, new Linux run, paid call or public target. The local build/smoke/final E2E passed as recorded above. Final receipt documentation is a separate `[skip ci]` commit with validated implementation unchanged. Main and prior accepted branches remain frozen; no merge/PR/force-push.

Recommended next task after Stage 15 acceptance: **design the offline Reproducer trust boundary**, separately authorized before implementation.

## Previous Stage 14C acceptance preparation

Updated 2026-10-05. Current task: **Stage 14C — prepare controlled acceptance, no real call**.

Started clean on local/remote `feature/stage14c-controlled-provider` at exactly `366b425d84c8f605847b3fd2604979d5d2334b1d`; prior validated offline implementation `8eecd805f44e0b763b68d72978a3c9ae10e60e00`. Main remains `9bafdb5df0d97668abd66e09fa342610da323ace`. One coding agent, no delegation; only the existing authorized feature branch is modified.

Operator entrypoint: `pnpm provider:acceptance preview` / `execute --release-id <explicit ID>`, in `scripts/provider-acceptance.ts` and its helper. Preview never reads a key, creates a release, calls network or writes the controlled store. It shows the exact immutable fixture/hash and the **3,540-byte Explorer body** below the 16 KiB limit; Breaker shows fixed export fields/limits with no invented claims. Execute is wired to `CROSSEXAM_OPENAI_API_KEY` supplied only by trusted runtime bootstrap, and reuses the unchanged profile/host admission/durable dispatch/recovery API. No report/model/endpoint/key-file override, default release ID or retry. stdout is bounded host receipt metadata, errors are stable codes, SIGINT/SIGTERM uses existing cancellation. No application route imports this entrypoint.

[Owner acceptance packet](STAGE14C_ACCEPTANCE.md): exact fixture snapshot SHA-256 `c418e840c4d0ea98cca6554fe008d41612423202e86e008c43e5088c1ee7c7ad`, complete Explorer body/hash, conditional Breaker policy, deadlines/token caps/two-call maximum, private storage/recovery limitations, project/model/data-policy checks, later placeholder command and current official pricing with an illustrative estimate rather than a cash ceiling. **No actual credential was read, no billed release was created, and no real call was made.** Only keyless preview was run; synthetic execution tests use fake transport in temporary stores. CrossExam remains free for users; no subscriptions, paid tiers, paywalls or user billing.

Focused operator tests: **29 PASS**, including packet/body identity, no preview key/network/release/write, missing/invalid arguments/configuration, fixed-profile one-call-per-role, sanitized failures, cancellation, repeated/interrupted-release recovery and no synthetic key/reasoning persistence. One complete required local validation pass: `pnpm lint` PASS, `pnpm typecheck` PASS (root/all eight workspaces), `pnpm test:tribunal` 119 PASS, `pnpm test:provider` 66 PASS, `pnpm test:provider-ledger` 72 PASS, `pnpm test:provider-operator` 29 PASS, `pnpm test` **1,112 PASS / 39 files**, `pnpm build` PASS. No repeated full suite or build/config workaround.

Operator implementation **b57403546d5cb69395db8836e60cf49843a7ffd9** was pushed only to `feature/stage14c-controlled-provider`. [Normal Ubuntu Node CI run 37263234119](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37263234119) **PASS** on that exact commit: frozen install, lint, root/all workspace typecheck, 119 tribunal / 66 provider / 72 ledger / 29 operator tests, and 1,112 full tests / 39 files. One normal run, no CI correction/retry or Linux isolation run. Final evidence docs are a separate `[skip ci]` commit; implementation remains unchanged. Main and all other accepted branches remain frozen, no PR/merge/force-push. **Acceptance preparation is delivered; paid acceptance is still NOT AUTHORIZED / NOT RUN.**

Privacy/security diff review passed: changes are limited to the operator script/helper/tests, package test/entry scripts, test inclusion, one keyless workflow step and accurate documentation/packet. Existing provider/controlled-host/contracts/fixtures and all web/scanner/browser/proxy/SSRF/AppArmor/root/cgroup/cleanup/public-launcher source remain unchanged. No secrets, actual credentials, reports, profiles or captured provider data are committed; the intentional packet contains only the non-secret hand-authored fixture projection. No subscriptions/paywalls/user billing and no API/account-setting operation. No new Linux run is required.

Recommended next task: **separately owner-authorized controlled paid acceptance**, after exact packet/release, API project, data policy and spending allowance approval. Preparation does not authorize that step or fully accept Stage 14C; real-provider behavior/access/billing and account policy remain unverified.

## Previously delivered Stage 14C offline implementation

**Offline implementation, full local validation and normal Ubuntu Node CI passed. Paid acceptance NOT performed; Stage 14C is not fully accepted.** Started clean at accepted `576e718bee50f01ddaf91a6b8f793bea69a82f55` (implementation parent `784d053`), created only `feature/stage14c-controlled-provider`. Main/origin/main and accepted source branches remain frozen.

Official OpenAI SDK 7.28.0 is isolated in `packages/provider-openai`; provider-neutral host hooks/external projection and private `packages/controlled-provider` release ledger preserve Stage 14B authority. Owned numeric fixture only, exact outbound hash/capability, durable single-use slots, canonical checkpoints and provider-free recovery. Report v2 is unchanged; audit extensions are optional. No credentials/real API calls, UI, browser/proxy/isolation/public-admission changes. See [Stage 14C boundary and limitations](STAGE14C_PROVIDER.md).

Full required local validation, one final pass: `pnpm lint` PASS; `pnpm typecheck` PASS (root/all eight workspaces); `pnpm test:tribunal` **119 PASS**; `pnpm test:provider` **66 PASS**; `pnpm test:provider-ledger` **72 PASS**; `pnpm test` **1,083 PASS / 38 files**; `pnpm build` PASS. The generated Turbopack cache was preserved outside the repository before this one fresh-cache build, following the previously verified local cache issue; no product/build configuration changed. Focused implementation checks preceded this complete pass.

The 138 new offline tests include exact request/export keys, fixed SDK settings, nullable wire semantics, incomplete/refusal/error/usage handling, streaming byte bounds, timeout/abort/late rejection, single-use dispatch authorization, fixture admission, all role/checkpoint/result interruption stages, corrupt/missing/private artifacts, capacity, concurrency and actual child-process crashes. Recovery preserves original records and never calls transport. Prior 119 tribunal regressions pass. A private same-host local store is not distributed storage or hostile same-user containment; ambiguous/corrupt locks fail closed and may need operator maintenance.

Full diff/privacy review: SDK is isolated, no credential lookup/paid API call, raw provider persistence or generic report/evidence export. No web/scanner/UI, browser-worker, engine/proxy/SSRF, AppArmor/root/cgroup/cleanup or public-launcher files changed; no generated reports/profiles/credentials committed. No new Linux run is required. Normal offline Node workflow covers the new feature branch with no API key or provider call.

Implementation commit **8eecd805f44e0b763b68d72978a3c9ae10e60e00** was pushed only to `feature/stage14c-controlled-provider`. [Normal Ubuntu Node CI run 37261315387](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37261315387) passed on that exact SHA: frozen install, lint, root/all workspace typecheck, 119 tribunal tests, 66 provider tests, 72 ledger tests and 1,083 full tests / 38 files. One normal run; no CI fix/retry, paid API call or new Linux-isolation run. The production build passed locally. Final evidence documentation is a separate `[skip ci]` commit with accepted implementation unchanged. Main and all prior accepted local/remote branch heads remain frozen; no PR, merge or force-push.

Recommended next task: **separately owner-approved controlled paid acceptance**, bound to the exact fixture/release, API project, data policy and spending allowance. Real provider access/behavior/billing remain unverified; Stage 14C is not fully accepted on offline evidence.

## Previously accepted Stage 14B

Updated 2026-10-05. Task: **Stage 14B — Explorer + Breaker trust boundary**.

**Stage 14B is COMPLETE for injected deterministic fake providers. Local validation and normal Ubuntu Node CI passed. No real provider invocation or public/browser admission is implemented.** Task 9a and Stages 11/12/13 remain accepted for owned controlled fixtures. Public arbitrary browser scanning remains DISABLED; no isolation, browser launch, proxy, AppArmor, cgroup, worker deadline, admission or UI policy changes.

## Stage 14B implementation and delivery

Started clean on accepted source `feature/rendered-accessibility-analysis`, local/remote HEAD exactly `5e510479ac3f44bcfe173b1d926a8a339f83b799`. Created `feature/stage14-explorer-breaker` from that commit. Main/origin/main remain `9bafdb5df0d97668abd66e09fa342610da323ace`. Prior validated branches are frozen. One coding agent; no delegation.

- Strict ExplorerProposal/BreakerProposal v1 reject unknown authority fields and enforce scope/falsifier/reference/category/cardinality/text rules. Host converts accepted proposals into INFERRED Explorer claims and Breaker challenges with host IDs, scan linkage, timestamps/status; no evidence/findings/verdict creation or mutation.
- ScanReport **v2** requires essential claim/challenge fields and zero-or-one TribunalRun overlay. Deterministic producer and demo/live fixtures explicitly migrated. Existing deterministic findings/verdicts and narrative demo activity remain separate. Deterministic claims preserve up to 96 references; agent claims retain the six-reference/480-character cap. Ephemeral persisted v1 reports require recollection, with no invented compatibility fields.
- Separate allowlisted provider projection exports only known collector/code numeric/presence facts, original OBSERVED/DERIVED provenance, host labels/time/IDs, opaque document ordinals and completeness. No website strings, URL strings, header values, DOM/axe data, bodies, infrastructure or generic Evidence.data. SIMULATED/INFERRED/unknown collectors excluded. <=256 candidates, <=96 digests, <=4 KiB per digest, <=96 KiB catalog inside <=128 KiB complete role requests.
- Explorer has no deterministic Findings/base claims. Breaker sees only accepted Explorer claims and the authorized catalog. Deep-frozen role requests separate static instructions from structured untrusted data. No mutation callback, browser/network/shell/filesystem tools or secrets.
- One sequential call per role, 20s each, 45s overall, requested 768/1024 output tokens, no retries. Response <=24 KiB before parsing; hostile object serialization/usage/envelope validation. Categorized failure/skipped/no-valid-output/partial-rejection audits retain IDs, versions, schema/payload hashes, times, budgets, bounded usage/acceptance/rejection codes. No invalid raw output/errors/chain-of-thought. Late responses cannot mutate state; repeated/concurrent/persisted-overlay replay never calls again.
- Fake injected providers only. Adapter code is trusted; timeout cannot terminate an adapter ignoring abort. Reported usage or null does not attest real token consumption. Real providers, SDKs, network, authenticated admission/persistence and later roles/actions are deferred. Public Chromium remains ISOLATION_UNAVAILABLE.
- Focused command `pnpm test:tribunal`: **119 PASS** (106 new boundary tests + 13 existing contracts), including exact oversized-proposal counts, explicit unknown counts for undecodable output, schema-limit statuses, empty Breaker completion and mandatory v2 fields. Root/workspace typecheck PASS. No new Linux run is requested; completed Linux implementation files remain unchanged.

## Stage 14B local validation

| Command | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS; root/all workspaces |
| `pnpm test:tribunal` | PASS; 119 tests / 2 files (106 new boundary cases) |
| `pnpm test:security` | PASS; 288 tests / 6 files |
| `pnpm test:scanner` | PASS; 94 tests / 4 files |
| `pnpm test` | PASS; final 945 tests / 34 files (initial full pass 942, then three audit-fidelity regressions) |
| `pnpm build` | PASS; production routes compiled/generated |
| `pnpm test:browser-security` | PASS; 419 units / 19 files + 47 controlled browser tests |
| `pnpm test:browser-collector` | PASS; 29 units + 8 browser tests |
| `pnpm test:performance` | PASS; 18 units + 6 browser tests |
| `pnpm test:accessibility` | PASS; 34 units + 8 browser tests |
| `pnpm test:e2e` | PASS; 22 tests |
| `pnpm scanner:smoke` | PASS; 1 selected / 33 skipped |

Two cached Turbopack build attempts recorded a local EPERM listener error. Local IPv4/IPv6/default/bundled-Node listeners and E2E were independently successful. Preserving the generated Turbopack cache outside the repository and doing a fresh-cache build passed without product/config/security changes. Final host audit review preserves exact oversized proposal counts and marks uncountable rejected counts explicitly; focused tests, root/workspace typecheck, affected full units (945) and production build were rerun afterward. No repeated full browser suite.

Diff review: no credentials/generated artifacts/UI redesign, provider SDK/network/tool integration or raw data export. Browser worker, proxy/SSRF, prepared root, AppArmor, cgroup/timeout/cleanup and public launcher source are unchanged. Feature-only Node workflow checks lint/typecheck/focused/full units; Linux isolation workflow is unchanged. Implementation commit **784d053f0240b73c6ec2151bd2c0e1b3dd2d69a0** was pushed only to `feature/stage14-explorer-breaker`. [Normal Node CI run 37240933259](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37240933259) passed on that exact SHA: frozen install, lint, root/all workspace typecheck, 119 focused tests and 945 full units / 34 files. One normal run; no CI fix/retry or new Linux-isolation run. Final evidence documentation is a separate `[skip ci]` commit with accepted implementation unchanged. Main and prior source branch refs remain frozen; no PR or merge.

Recommended next task: **Stage 14C — reviewed real-provider adapter boundary**.

## Accepted prior milestones (historical handoffs)

The sections below retain earlier milestone evidence and their then-next tasks. The controlled acceptance preparation section above is the current state.

## Stage 13 implementation

Started clean on `feature/performance-runtime-analysis` and its remote at exactly `4ebe2d72a87103a6fd37303000adf3b703d71bb2`. Created `feature/rendered-accessibility-analysis` from that SHA. Main/origin/main remain `9bafdb5df0d97668abd66e09fa342610da323ace`. Earlier validated branches remain frozen.

- Official `axe-core` **4.12.1**, exact dependency, MPL-2.0; no wrapper, production dependency tree or CDN. Unmodified engine source is included in the existing esbuild probe bundle and sealed manifest. Its upstream license notice is retained by the bundle. Engine upgrades require explicit contract/version and fixture review.
- `accessibility-collector.ts` analyzes the same page after the existing 300 ms post-load wait, performance observer drainage and DOM summary. Runtime observations stop before engine work. Default pinned rules run with `noHtml`, `elementRef`, `iframes:false`, `preload:false`, and selector/ancestry/xpath output disabled. Main-world DevTools evaluation of locally bundled source does not disable page CSP; a strict CSP fixture proves inline target scripts still fail. No engine-driven remote preload or second browser.
- `BrowserAccessibilityEvidenceSchema` v1 composes optional/null accessibility into collection v1. Rendered snapshot facts are OBSERVED; rule results and aggregates are DERIVED. Violations, incomplete/manual-review checks, pass summaries and inapplicable summaries remain distinct. Failed/unsupported/timed-out/cancelled/DOM-limit analysis has null observations/results, never a zero-violation verdict. Navigation failure leaves analysis null.
- Privacy: raw axe output stays inside Chromium. Only engine-registry rule IDs/tags (tags normalized lowercase), engine impact enums, counts and structural locations leave the renderer. No HTML, check messages/data, failureSummary, axe selectors, IDs/classes/custom-element names, visible text, form values or arbitrary DOM attributes are copied into accessibility output. Previous Stage 11 sanitized document-summary fields remain as previously contracted.
- Locators use built-in tag names, nth-of-type ancestry, an explicit open-shadow boundary and deterministic document-local index. Up to ten ancestors/256 characters, three representative nodes per rule. Partial/deep/custom-ancestor/unindexed locations are marked; these are approximate snapshot locations, not durable replay selectors. Open shadow roots are tested; closed shadow roots and iframe documents are explicitly excluded. Iframe traffic still follows existing policy.
- Bounds: 12 violation rules, 8 incomplete rules, 3 nodes/rule, 16 tags/rule (64 characters each), 5 impact buckets and 32 tag aggregate buckets, 128 pass/inapplicable rule IDs each, 10,000 inspected elements. Alphabetical rule and document-index node ordering; complete rule/node totals with explicit dropped counts. Accessibility <=8 KiB, evicted **before IPC** and revalidated afterward. Combined Stage 11/12/13 JSON remains <=32 KiB; no resource limits increased.
- Engine analysis is capped at 2,500 ms or the smaller remaining operational budget. Timeout closes the existing worker via its idempotent lifecycle; the whole worker/service limits are unchanged. Performance measurements are frozen before analysis, so engine work is outside the LAB observation window.
- Evidence adapter appends separate OBSERVED `BROWSER_ACCESSIBILITY_OBSERVATION` and DERIVED `BROWSER_ACCESSIBILITY_RULES`. No HTTP evidence replacement, findings, AI, score, remediation or compliance claim.
- Owned fixtures exercise correct/missing accessible names and labels, document language, headings, landmarks, valid/invalid ARIA, dynamic violation, rendered failing/passing contrast and gradient contrast requiring manual review, hidden content, open/closed shadow roots, excluded iframe, CSP, volume, DOM limit and cancellation. Duplicate IDs are present but no unsupported violation assertion is invented; pinned default engine behavior is the fixture oracle. Local esbuild/CJS execution tests the actual bundled engine/serialized projection.

## Stage 13 validation

Focused accessibility: **34 units + 8 real-browser tests PASS**. Stage 11 regression: **29 units + 8 browser checks PASS**. Stage 12 regression: **18 units + 6 browser checks PASS**. A test-only literal type was corrected before completing the local pass; the bundled MPL notice assertion uses its canonical license URL rather than assuming adjacent text across comment line breaks.

| Command | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS; root/all workspaces |
| `pnpm test:security` | PASS; 288 tests / 6 files |
| `pnpm test:scanner` | PASS; 94 tests / 4 files |
| `pnpm test` | PASS; 839 tests / 33 files |
| `pnpm build` | PASS |
| `pnpm test:browser-security` | PASS; 419 units / 19 files + 47 browser checks |
| `pnpm test:browser-collector` | PASS; 29 units + 8 browser checks |
| `pnpm test:performance` | PASS; 18 units + 6 browser checks |
| `pnpm test:accessibility` | PASS; 34 units + 8 browser checks |
| `pnpm test:e2e` | PASS; 22 desktop/mobile checks |
| `pnpm scanner:smoke` | PASS; 1 selected check, 33 intentionally skipped |
| Exact Linux probe esbuild bundle | PASS; 2.2 MiB, retained MPL notice |
| `git diff --check` | PASS |

No shell script changed. Local esbuild execution proves the engine and serialized projection operate after bundling. Full diff/privacy review excludes generated outputs, secrets, screenshots, browser state and unrelated UI changes. Existing sandbox/AppArmor/proxy/root/proc/cgroup/public-launcher files are unchanged. E2E regenerates development type references; the installed Next.js declaration generator restores production references without manual editing. The required full build passed; a subsequent optional restoration build encountered a local port-binding permission error, so no further build loop was used. Linux acceptance is independently recorded below; macOS browser checks alone do not establish Linux confinement.

## Stage 13 Linux acceptance and delivery — one run

Implementation commit `13a82b528d28b204b23c700ca3e069cdf8824281` was pushed only to `feature/rendered-accessibility-analysis`. [Linux run 37233296257](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37233296257), isolation job `111527325289`, completed **successfully**. Exactly one new Linux run; Run 2 is not permitted/needed because no integration defect occurred. Final documentation uses `[skip ci]`, leaving accepted code identical. No PR, merge, source-branch rewrite or main modification.

| Evidence | Verified result |
| --- | --- |
| Preparation / sealed root | PASS; bundled pinned engine included in normal manifest closure |
| Stage 11 schema/runtime | PASS; actual navigation, console/page error, dynamic DOM, XHR and POST denial |
| Stage 12 schema/measurements | PASS; navigation, FCP 220 ms, finite LCP 336 ms, CLS 0.01877, one 90 ms long task, resource timing/bounds |
| Stage 13 schema/version | PASS; schema v1, axe-core 4.12.1, completed |
| Rule classes | PASS; five violation rules, one incomplete/manual-review rule, 17 pass rules; expected image/name violation, language/button pass and JS-inserted button located structurally |
| Bounds / privacy | PASS; accessibility 6,202 bytes, rich combined 20,064 bytes, bounded combined 32,748 bytes; 234 accessibility nodes omitted with accounting. No snippets/form marker; no disposable marker anywhere in job logs |
| Exact AppArmor | PASS; loaded and attached to accepted headless executable; enabled/restriction=1 before/after validation; temporary profile unloaded with restriction still 1 |
| Chromium internal sandbox | PASS; independent userns/UID/GID mapping/setgroups-deny, nested PID/network namespaces, renderer Seccomp=2 and 15 filters versus browser 14; outer effective/bounding capabilities empty |
| Outer probes | PASS; network, filesystem, pids, browser, collector, tls, memory (expected OOM kill), timeout (expected kill), proxy-down |
| Active cgroups | PASS; MainPID membership checked before release; memory 1 GiB, swap 0, pids 128, CPU `100000 100000` |
| Cleanup | PASS; all nine captured cgroups absent, all probes `finalCleaned=true` |
| Sentinels | PASS; zero TCP/UDP hits across seven owned addresses, zero unrelated Unix socket hits |

Public `launchBrowserWorker()` remains fail-closed with `ISOLATION_UNAVAILABLE`. This acceptance does not establish deployment readiness or arbitrary hostile-page measurement trust. No security control was changed/weakened.

## Stage 13 limitations

Automated checks cover only part of accessibility; pass/empty retained lists do not establish WCAG conformance or a human verdict. Analysis is a finite rendered snapshot, not eventual DOM stability. The controlled main world is not tamper-resistant against hostile scripts. No iframe/closed-shadow analysis, accessibility tree, raw DOM, image storage, auto-fixes, AI or public admission. Browser evidence is still fixture-only, not deployment-ready.

The next task is **Stage 14 Explorer + Breaker Agent Architecture**, only after Stage 13 Linux acceptance; it is not begun here.

---

## Previous accepted milestone — Stage 12

Updated 2026-10-05. Task: **Stage 12 — Performance + Runtime Analysis**.

**Stage 12 is COMPLETE for owned fixtures inside the verified Linux boundary. Public arbitrary browser scanning remains DISABLED.** Stage 11 and Task 9a remain accepted for controlled fixtures. No UI, public admission, browser launch configuration, AppArmor, proxy or outer isolation policy changed.

## Stage 12 implementation

Started clean on `feature/browser-evidence-collector` and its remote at `666d5d7836ca5a048cab087b6a674374ff0c6c44`. Created `feature/performance-runtime-analysis` from exactly that SHA. Main/origin/main remain `9bafdb5df0d97668abd66e09fa342610da323ace`; validated source branches are preserved.

- `performance-observer.ts` installs buffered top-document observers before fixture scripts, drains pending entries and disconnects at collection. It uses the existing fixture worker and unchanged 300 ms post-load window/whole-job deadlines. No networkidle, tracing, profiling or alternative browser launch.
- `BrowserPerformanceEvidenceSchema` v1 composes into Stage 11 collection v1 as optional/null `performance`; `collector: chromium-lab-v1`, `measurementKind: LAB`. Navigation, paint/LCP, numeric layout-shift/resource/long-task entries are OBSERVED. Explicit DERIVED sections hold timestamp differences, CLS, delivered/retained summaries and neutral runtime counts. No INFERRED data, field/RUM claims or score.
- Browser navigation fields include start/fetch, DNS/connection/TLS/request/response phases, DOM/load phases, size fields and redirect count. Derived DNS/connection/TLS/request-wait/download/DOM/load values identify source fields. Missing fields stay null; unfinished/reversed phases are unavailable/invalid, never substituted wall-clock estimates. Proxy-mediated phase timings do not establish target DNS or connection latency.
- FCP comes from paint entries. LCP is the latest delivered numeric candidate in this finite window, explicitly unfinalized; no element/text/URL attribution. CLS is the maximum session sum with consecutive gaps <1 s and span <5 s, excluding `hadRecentInput`; truncating shifts makes CLS null/insufficient-data. INP is not measured without an interaction protocol.
- Caps: 16 resource timings, 16 long tasks, 8 LCP candidates (first seven plus latest), 16 shifts, two paints. Performance JSON <=8 KiB and combined Stage 11+12 JSON <=32 KiB, unchanged. Tail eviction/entry loss is counted; latest LCP is preserved. Resource URL sanitation reuses Stage 11; no headers, bodies, storage or arbitrary attribution are read. Summaries distinguish all delivered entries from retained subsets, including zero/missing size counts and native buffer-loss flags.
- Owned rich/bounds/empty fixtures exercise delayed main response/CSS/script/image, a 130,000-byte XHR body (size only retained), delayed larger paint, layout shift, 90 ms task, failed resources, secrets/redaction and volume limits. Existing lifecycle/security probes remain authoritative. The fixed Linux collector mode checks both schemas and all new measurements; sandbox/proxy/cgroup/sentinel observer paths are reused.

## Stage 12 validation and delivery

Focused checks passed: 18 performance unit tests and six real Chromium performance tests; existing 29 collector units and eight browser checks passed. One full local validation pass succeeded:

| Command | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS; root/all workspaces |
| `pnpm test:security` | PASS; 288 / 6 files |
| `pnpm test:scanner` | PASS; 94 / 4 files |
| `pnpm test` | PASS; 805 / 32 files |
| `pnpm test:browser-security` | PASS; 385 units / 18 files plus 39 browser checks |
| `pnpm test:e2e` | PASS; 22 desktop/mobile checks |
| `pnpm build` | PASS |
| `pnpm scanner:smoke` | PASS; one selected check |
| Exact prepared-root esbuild probe bundle | PASS; 841.5 KiB |
| `git diff --check` | PASS |

No shell script changed. Reviewed diff contains no UI changes, .env/credentials, captured cookies/auth/bodies/storage, screenshots/traces/browser profiles/generated artifacts, public targets/admission or sandbox/AppArmor/proxy/cgroup/root weakening. Linux acceptance is independently established below, not inferred from macOS. The initial owned paint update was coalesced into one candidate; the fixture now separates two renders within the unchanged window. The Stage 11 form-value privacy assertion is scoped to forms so numeric metric `value` fields remain legitimate; schema-level form value rejection is retained.

Stage 12 limitations: finite top-document LAB window, controlled fixtures only, no field/RUM interpretation. Unavailable metrics remain null. Browser/cache/CORS privacy rules can expose resource size/timing zeros; these do not mean no expense. Aggregates cover delivered entries only, and zero/missing sizes and truncation are explicit. No iframe aggregation, interaction/INP, performance score, causal script attribution, accessibility, AI or public admission. Same-world Performance API collection is not an anti-tampering guarantee for hostile public pages.

## Stage 12 Linux acceptance and delivery — one run

Implementation commit `258c0c30905ff81a322783b5f7af692b901a3423` was pushed only to `feature/performance-runtime-analysis`. [Run 37230436777](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37230436777), isolation job 111518775157, completed successfully. Exactly one new Linux run was used; Run 2 is not permitted/needed because there was no integration defect. Final documentation uses `[skip ci]`; code remains identical to the accepted run. Main, validation/linux-isolation and the accepted Stage 11 branch remain unchanged; no PR/merge.

| Accepted Linux evidence | Actual result |
| --- | --- |
| preparation + exact AppArmor profile | PASS; immutable revision 1243, root:root 0555, artifact SHA256 ded93a9c9a53a1ae040f08124badcca95c938e9d5015ff340c3b5538c41bf39e unchanged |
| network / filesystem / pids / browser | PASS; existing boundary probes unchanged |
| collector / Stage 11 schema | PASS; redirect, rendered DOM, console, page error, XHR, denied POST and disposable-marker absence |
| Stage 12 schema/navigation | PASS; PerformanceNavigationTiming present; request-wait derived from 19.3/102.1 ms timestamps, no wall-clock substitution |
| FCP / LCP | PASS; FCP 188 ms; LCP candidates 188/372 ms, latest observed candidate only, not finalized |
| CLS | PASS; observed finite-window session maximum 0.017802242702907988, no recent-input shifts |
| long task | PASS; one delivered/retained 90 ms task; numeric start/duration only |
| resource timing | PASS; 10 delivered/retained entries; owned XHR decoded size 130,000 bytes; delivered decoded total 130,203 bytes |
| retention / privacy | PASS; rich performance 6,119 bytes, combined 13,771 bytes; bounded combined 32,739 bytes with 18 resource timings dropped, 68 console entries and 6 responses dropped. No disposable marker anywhere in CI logs |
| internal Chromium sandbox | PASS; exact profile attached, completed userns ID maps/setgroups deny, nested PID namespace; renderer Seccomp=2 with 15 filters versus worker/browser 14 |
| tls / memory / timeout / proxy-down | PASS; expected cgroup oom-kill and RuntimeMaxSec termination, failed outage navigation without DIRECT fallback |
| cleanup / sentinels | PASS; all nine captured cgroups absent/cleaned=true; zero TCP/UDP hits across seven owned addresses and zero unrelated Unix socket hits |
| global AppArmor policy | PASS; enabled, userns restriction 1 before/after validation and after temporary profile removal |

Collector worker PID 5427/browser PID 5443 remained non-root UID 999/GID 987 with NoNewPrivs=1 and empty effective/bounding host capabilities. Zygote/renderer maps were UID 999→999 / GID 987→987 (one ID each), setgroups=deny; renderer PID 5495 had nested PID IDs [5495,4,1]. Namespace-local bounding sets are not host capability grants. Cgroup kernel values remain memory.max=1073741824, memory.swap.max=0, pids.max=128 and cpu.max=100000 100000.

Exactly one next task: **Stage 13 Rendered Accessibility Analysis**. Public admission/deployment, AI and field performance collection remain unimplemented; do not begin Stage 13 in this task.

## Accepted Stage 11 record

Updated 2026-10-05. Task: **Stage 11 — Real Browser Evidence Collector**.

**Stage 11 is COMPLETE for owned fixtures inside the verified Linux boundary. Public arbitrary browser scanning remains DISABLED.** Task 9a remains COMPLETE for the verified controlled boundary. No UI, public admission, proxy policy, AppArmor allowance or outer isolation control has changed. This is not production/deployment readiness.

## Stage 11 implementation

Started clean on `validation/linux-isolation` at `0799927720d3a7fc693335b0238b094b4371cb59`, with main/origin/main at `9bafdb5df0d97668abd66e09fa342610da323ace`. Created `feature/browser-evidence-collector` from exactly that milestone. Only this feature branch may be pushed; no PR or merge.

- Internal `browser-collector.ts` admits only fixed owned fixture identifiers and uses the existing fixture worker, proxy and deadline/cleanup. Package/public launch remains fail-closed with ISOLATION_UNAVAILABLE. No web/scanner admission wiring.
- `BrowserEvidenceCollectionSchema` v1 captures actual navigation, warn/error console messages, uncaught error name/message, request/response metadata and bounded rendered DOM. OBSERVED provenance with `source: fixture` / `scope: controlled-fixture` distinguishes executed owned fixtures from simulated demo data. Wall-clock durations are collection timings, never performance metrics.
- Retention caps: requests 64, responses 32, console 32, page errors 16, redirect relationships 5, headings 20, links 40, forms 10, resources 40, input-type buckets 20, DOM elements 10,000, text/header 256 characters, URLs 1,024, nine allowed header names and final JSON 32 KiB. A fixed 300 ms post-load window stays inside the worker operational deadline. Dimension loss counts, string/URL/header omissions, DOM inspection and result-size flags expose incomplete coverage.
- Engine privacy helpers and a BROWSER_* Evidence adapter preserve browser identity without replacing HTTP evidence or creating findings. No request bodies/headers, auth/cookies, input names/values, storage, stacks, console arguments, screenshots or binary content are retained. Free-text redaction handles recognizable patterns, not arbitrary unlabelled secrets; public privacy/admission review is still required.
- Owned fixtures cover redirects, JS DOM changes, warnings/errors/exceptions, CSS/script/image/fetch/XHR, failed resources, denied POST/WS/private/mixed DNS attempts, disposable sensitive markers, console/request/response/DOM bounds, redirect loops, timeout/late requests and cancellation/proxy failure. No real public/private destination is contacted.
- Fixed Linux `collector` mode reuses prepared-root bundling and the existing sandbox observer, cgroup cleanup and sentinel checks. It returns schema-validated rich fixture output and verifies bounded fixture truncation. No new isolation primitive or privileged allowance.

## Stage 11 validation and delivery

`pnpm test:browser-collector` — PASS: 29 focused unit checks and 8 real Chromium checks. Collector/worker/backend focused regression run also passed 72 tests. The single full local validation pass completed successfully:

| Command | Actual result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS; root and all workspaces |
| `pnpm test:security` | PASS; 288 tests / 6 files |
| `pnpm test:scanner` | PASS; 94 tests / 4 files |
| `pnpm test` | PASS; 787 tests / 31 files |
| `pnpm test:browser-security` | PASS; 367 unit/integration tests and 33 browser checks |
| `pnpm test:e2e` | PASS; 22 desktop/mobile checks |
| `pnpm build` | PASS; typechecks and production build |
| `pnpm scanner:smoke` | PASS; 1 selected deterministic collector test |
| Fixed Linux probe bundle with esbuild | PASS; exact preparation bundling command |
| `git diff --check` | PASS |

No shell script changed. Reviewed diff contains no UI changes, public browser admission, AppArmor/proxy/cgroup/root/proc weakening, usable credentials, captured cookies/auth, browser profiles, screenshots or generated artifacts. Main and the validated source branch remain unchanged. Linux acceptance is independently established below, not inferred from macOS.

### Stage 11 Linux acceptance — one run

Implementation commit `a12e3245f94b651eb23f40ec4468a9ec866574e2` was pushed only to `feature/browser-evidence-collector`. [Run 37227469796](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37227469796), isolation job 111509999899, completed successfully. Exactly one Stage 11 Linux run was used. Run 2 was not permitted/needed because Run 1 revealed no integration defect. Final documentation is delivered with `[skip ci]`; collector/security code remains identical to the accepted run.

| Linux stage/evidence | Verified result |
| --- | --- |
| preparation + exact AppArmor provisioning | PASS; sealed root and revision 1243, immutable artifact hash unchanged |
| network / filesystem / pids | PASS; existing confinement and resource probes unchanged |
| browser | PASS; original controlled fixture and private/mixed DNS rejection |
| collector | PASS; rich and bounded fixtures inside the same unit/root/proxy boundary |
| tls | PASS; end-to-end trusted fixture handshake |
| memory | PASS; expected cgroup `oom-kill` |
| timeout | PASS; expected RuntimeMaxSec termination |
| proxy-down | PASS; navigation failed without DIRECT fallback |
| cleanup | PASS; all 9 completed captured cgroups absent and cleaned=true |
| sentinels | PASS; TCP 0, UDP 0 over 7 owned addresses, unrelated Unix socket 0 |
| AppArmor final + policy removal | PASS; enabled throughout, userns restriction 1 before/after removal |

Rich evidence was 7,635 bytes: navigation 200 with two chain entries, rendered title/description/headings/form/link/resource metadata, 12 observed requests, 9 responses, 8 warnings/errors and one TypeError. The POST request failed with ERR_BLOCKED_BY_CLIENT; private and mixed-answer requests failed. No disposable secret marker appeared in either collection or the complete diagnostic log. The bounded fixture returned 30,685 bytes and explicitly recorded 68 dropped console events and 3 dropped responses; heading/form truncation passed. Both outputs passed the versioned schema and 32 KiB ceiling.

The collector's independently observed worker PID was 5238. Browser/zygote/renderer carried `crossexam-chromium-userns (unconfined)`. Zygote/renderer had completed own-ID maps (UID 999/GID 987, one mapping each), setgroups=deny and user/PID namespaces distinct from the worker. Renderer PID namespace depth was 3, Seccomp mode 2 with 15 filters versus the worker/browser's 14. NoNewPrivileges remained 1; worker/browser effective and bounding capabilities remained zero. This establishes a real Chromium userns/renderer sandbox, not merely successful launch. All active probes retained memory.max=1073741824, memory.swap.max=0, pids.max=128, cpu.max=100000/100000 and verified MainPID membership before release.

Controlled scope limitations remain explicit: cached Playwright headers may omit fields, the 300 ms post-load window does not prove eventual behavior, counts stop after 10,000 DOM elements, free-text privacy filtering is not complete DLP, and crash behavior has focused event/lifecycle regression coverage rather than a newly induced real renderer crash. The outer memory/timeout/crash cleanup primitives remain independently tested. No public admission, persistent storage/deployment, performance analysis, accessibility, AI or screenshots were added.

## Previous validated milestone — Task 10D-C

**Task 9a is COMPLETE for the controlled Linux isolation harness. Task 10D-C passed full Linux acceptance. Arbitrary public browser scanning remains disabled.** The deterministic HTTP scanner, live reports, fixture demo and approved UI are unchanged.

## Starting state and verified diagnosis

Started clean on `validation/linux-isolation` at `8dc3b553333df7491e96e139aae305542699428c`. Main and origin/main remain `9bafdb5df0d97668abd66e09fa342610da323ace`; this task must not modify main or open a PR.

[Run 37007052278](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37007052278) passed preparation, network, filesystem and PID probes, then failed during Chromium sandbox initialization. [Diagnostic run 37194515782](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37194515782), at the starting commit, identified Ubuntu AppArmor's unprivileged-userns restriction: NEWUSER creation succeeded, but `/proc/self/setgroups` failed EACCES after transition to `unprivileged_userns (enforce)`. AppArmor denied namespace-scoped sys_admin; Chromium reported `No usable sandbox!`. Cleanup succeeded. This demonstrated no conflict requiring removal of the outer systemd controls.

That runner used Playwright 1.63.0, Chromium 153.0.8010.12/revision 1243, kernel 6.17.0-1022-azure and systemd 255.4-1ubuntu8.17. AppArmor was enabled, `kernel.unprivileged_userns_clone=1`, and `kernel.apparmor_restrict_unprivileged_userns=1`. The launched headless-shell executable has no sibling SUID sandbox helper. Preparation preserves no SUID path; the userns mechanism is required.

## Implemented and Linux-verified boundary

- `linux-apparmor.ts` renders exactly one profile, `crossexam-chromium-userns`, attached to `/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`, with `flags=(unconfined)` and only `userns,`. No wildcard, alternate attachment, caller path or global sysctl change is permitted.
- Privileged provisioning first validates the existing sealed prepared-root manifest/hashes, fixed Playwright/Chromium versions, root ownership, regular-file identity, immutable permissions and safe parents. The profile is exclusively created as root:root 0444, syntax-checked, loaded and verified. Parse/load/verification errors fail closed and roll back owned policy; conflicting pre-existing policy is never overwritten. CI unloads/removes its temporary policy and verifies the restriction remains enabled.
- The attachment follows systemd 255's mounted root and AppArmor's namespace-visible absolute path. Run 2 verified this exact attachment on browser, zygote and renderer processes. No alternate host path is granted speculatively.
- A bounded host observer reads only verified-unit cgroup members. Acceptance requires the exact attached browser, non-root identity, unchanged worker NoNewPrivileges/capability state, zygote and renderer user/PID namespaces distinct from the worker, completed own-ID UID/GID maps with setgroups denied, and renderer-added seccomp. Chromium emits bounded sandbox diagnostics. The inherited unprofiled helper remains a negative control and must still fail at setgroups with EACCES.
- The harness continues beyond browser to TLS, memory, timeout and proxy-down. Existing active limits, captured-cgroup cleanup and owned sentinel checks remain unchanged. No public launcher or collector is enabled.

## Validation and CI budget

Focused command: `pnpm exec vitest run apps/browser-worker/src/linux-apparmor.test.ts apps/browser-worker/src/linux-sandbox-evidence.test.ts apps/browser-worker/src/linux-lifecycle.test.ts apps/browser-worker/src/fixture-worker.test.ts` — **PASS, 135 tests / 4 files**.

| Command | Actual result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS; root and all workspaces |
| `pnpm test:security` | PASS; 288 tests / 6 files |
| `pnpm test:scanner` | PASS; 94 tests / 4 files |
| `pnpm test` | PASS; 758 tests / 30 files |
| `pnpm build` | PASS; typechecks and production build |
| `pnpm test:browser-security` | PASS; 338 unit/integration tests and 25 controlled browser checks |
| `pnpm test:e2e` | PASS; 22 desktop/mobile checks |
| `pnpm scanner:smoke` | PASS; 1 selected deterministic collector test |
| `bash -n scripts/prepare-linux-isolation.sh` | PASS |
| Fixed Linux probe bundle with esbuild | PASS |

macOS tests cannot prove Linux AppArmor enforcement. `apparmor_parser` is unavailable locally; Linux CI independently passed syntax/load/attachment and removal. Tests use closed owned fixtures; no public website/private infrastructure/metadata endpoint was probed.

[Run 1: 37196267078](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37196267078), commit `db49f565e4aee679208e5254963cc79d5e0ff021`, passed preparation, exact profile provisioning, network/filesystem/PID probes and the browser fixture (exit 0). All completed probes had captured cgroups absent and cleaned=true. The observer verified the attached browser but failed `MISSING_SANDBOXED_ZYGOTE`; it stopped the suite before TLS/memory/timeout/proxy-down. Chromium's own log reported renderer seccomp-bpf activation. Temporary policy cleanup passed and AppArmor/restriction remained enabled.

The failure exposed a concrete observer defect: [Chromium 153 rewrites child command lines into a single space-separated process title](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/base/process/set_process_title.cc), including [forked renderers](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/content/zygote/zygote_linux.cc). The observer's NUL-argv executable equality rejected these stable processes. The only integration correction accepts that exact-executable-prefixed representation with unchanged flag/role/profile/mapping/namespace/seccomp predicates and regression coverage. This meets the authorized narrow Run 2 condition; no allowance or outer control changes are included.

[Run 2: 37196847138](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37196847138), commit `8ad3758c09dc1f8296c9ad18c7d4c0d39a08cada`, **PASS**. The correction passed focused tests 135, all 758 unit/integration tests, lint, typechecks/build and browser-security 338+25 before push. The AppArmor policy and every outer control stayed unchanged. Exactly two new Linux runs were used; no third run occurred.

| Linux stage | Verified result |
| --- | --- |
| preparation | PASS; sealed manifest, fixed runtime closure and immutable artifact |
| AppArmor provision | PASS; exact profile loaded and restriction 1 |
| network | PASS; only loopback interfaces, no default routes, zero direct TCP connections |
| filesystem | PASS; repository/home/world/socket and unrelated proc sentinels ENOENT; intended proxy socket available; runtime immutable; worker capabilities/groups empty |
| pids | PASS; 121 children spawned, 39 EAGAIN failures, children cleaned |
| browser | PASS; navigation 200, title/resources/XHR/fetch matched, both private DNS targets denied |
| TLS | PASS; authorized matching identity, rejectUnauthorized=true, no TLS override |
| memory | PASS; expected cgroup oom-kill (probe exit 1) |
| timeout | PASS; RuntimeMaxSec terminated Chromium and stubborn descendant (probe exit 1, timedOut=true) |
| proxy-down | PASS; navigation failed with no direct fallback |
| cleanup | PASS; all 8 completed captured cgroups absent; final services inactive |
| sentinels | PASS; TCP 0, UDP 0 across 7 owned addresses, unrelated Unix socket 0 |
| AppArmor final/removal | PASS; profile verified before teardown, unloaded/removed afterward; enabled Y and restriction 1 afterward |

### Direct Chromium sandbox evidence

The prepared executable was root:root 0555, regular and non-symlink, SHA256 `ded93a9c9a53a1ae040f08124badcca95c938e9d5015ff340c3b5538c41bf39e`, linked to the validated manifest. The actual browser/zygote/renderer labels were `crossexam-chromium-userns (unconfined)`.

Host-view UID 999/GID 987 remained non-root throughout. Zygote and renderer had a user namespace distinct from the worker, `setgroups=deny`, UID map `999 999 1`, and GID map `987 987 1`. PID namespace depths were worker 1, zygote 2, renderer 3; the renderer occupied an additional PID namespace. Chromium also created a network namespace distinct from the outer worker's private namespace. These observed completed states establish the userns setup that previously failed and required nesting.

Worker and browser parent had NoNewPrivileges 1 and zero effective/bounding capabilities. Zygote/renderer retained NoNewPrivileges 1 and zero effective capabilities; their nonzero bounding set belongs to Chromium's new user namespace, not a host capability grant or systemd control change. Renderer Seccomp 2 had 15 filters versus worker/browser 14, corroborated by Chromium's own renderer seccomp activation log. Launch used chromiumSandbox=true and no sandbox-disabling flags. The unprofiled helper still entered `unprivileged_userns (enforce)` and failed setgroups EACCES 13, proving the global restriction was not disabled.

Every active unit independently retained memory.max=1073741824, memory.swap.max=0, pids.max=128, cpu.max=100000/100000 and verified MainPID membership before input release. Cleanup and sentinel proof cover the entire suite, including adverse termination modes.

Final evidence is recorded in a documentation-only `[skip ci]` commit to preserve the two-run budget; code remains identical to the successful run's commit. [GitHub documents this push-event skip behavior](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).

## Remaining boundary and next task

The profile is an exact pathname allowance, not a cryptographic kernel attachment. Immutable prepared-root validation links that pathname to the reviewed artifact under the trusted host provisioning model. Browser compromise gains namespace operations within the existing outer confinement; unprivileged kernel attack surface remains a security consideration. This is not a production deployment audit.

`launchBrowserWorker()` still always throws `ISOLATION_UNAVAILABLE`. Production deployment requires reviewed host provisioning and artifact/profile updates together. CONNECT does not inspect encrypted methods, paths or WSS. Stage 11 controlled-fixture collection is described above; production collection, scheduling and public admission remain unimplemented.

**Exactly one recommended next task: Stage 12 Performance + Runtime Analysis.** Do not begin it in Stage 11. Public scanning remains disabled until separately reviewed admission/deployment work.
