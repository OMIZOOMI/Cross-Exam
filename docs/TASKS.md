# Week-one roadmap

Status: `[x]` done, `[ ]` pending. Days are sequencing guidance, not delivery promises. Keep each task independently reviewable.

## Day 1 — foundation

1. [x] Inspect workspace; create isolated `crossexam` directory without changing other projects.
2. [x] Create product/architecture/protocol/security/decision/workflow docs.
3. [x] Scaffold pnpm apps and shared TypeScript packages.
4. [x] Define Zod schemas and validate report references, identity, and source.
5. [x] Build landing page with URL syntax feedback and honest unavailable state.
6. [x] Build fixture report, graph, findings, evidence, proposed solutions, and simulated activity.
7. [x] Add scanner and provider-neutral agent interfaces without external execution.
8. [x] Complete lint, unit, browser, production-build checks and record final results (25 unit tests; 10 browser checks on development and production servers).

## Day 2 — safe deterministic collection

9. [x] Implement the URL/egress safety gate: shared early input policy, conservative IPv4/IPv6 classification, complete A/AAAA validation, literal-address-pinned Node HTTP(S), manual redirect checks, structured denials, request limits, and deterministic/TLS tests. This protects the HTTP primitive; it does not constrain Chromium.
9a. [x] **COMPLETE for the controlled Linux harness:** Run 37196847138 passed preparation, exact AppArmor allowance/attachment, network/filesystem/PID/browser/TLS/memory/timeout/proxy-down, internal namespace/renderer-seccomp proof, cleanup and zero sentinel hits. All outer controls and global AppArmor restriction remained enabled. Public launch still fails closed with ISOLATION_UNAVAILABLE; production deployment and Stage 11 collector remain separate.
10. [x] **Stage 11 COMPLETE for controlled fixtures:** bounded Playwright page collector behind the existing proxy/Linux boundary. Fixed owned fixtures only; versioned observed navigation/console/errors/network/rendered DOM, privacy/retention and cleanup/cancellation tests. Run 37227469796 passed schema, sandbox, all security stages, cleanup and zero sentinel hits. Public admission stays DISABLED.
11. [x] Persist schema-validated local HTTP reports with IDs, timestamps, compact evidence, redaction, retention, and size bounds. Public storage/access control remains deferred.

## Day 3 — crawl and measurements

12. [x] Add bounded final-origin HTTP route discovery: eight page attempts, depth two, sequential requests, byte/deadline limits, conservative robots policy and sitemap hints.
13. [ ] Add browser performance lab measurements and rendered accessibility checks after 9a/10. HTML metadata, declared resource references, and passive response headers are collected now; cookies are not retained.
14. [x] Generate narrow deterministic HTTP/HTML claims/findings with evidence references, conservative wording, and positive/negative rule tests. No AI execution.

## Day 4 — connect the product

15. [x] Connect URL submission through a bounded local Node adapter to real HTTP scans, honest waiting/cancellation/failure feedback, and persisted results. Durable jobs/streamed progress remain future work.
16. [x] Render validated LIVE INVESTIGATION reports separately from the unchanged fixture route, including partial/empty states and no fabricated browser or agent data.

## Day 5 — bounded tribunal

17. [ ] Implement provider adapters and runtime-validated role outputs with missing-key fallback and cost/time limits.
18. [ ] Implement bounded challenge/reproduction/judging over structured state with deterministic action authorization.

## Day 6 — useful conclusions

19. [x] Connect deterministic findings to recommendations and explicit recheck procedures. Demo contested/insufficient states remain; no automatic fixes or causal verification are claimed.
20. [ ] Add robust empty/error/partial states, accessibility checks, and regression cases for hostile sites and malformed provider output.

## Day 7 — portfolio finish

21. [ ] Run full local product validation, capture an honest demo, and update documentation with measured limits.
22. [ ] Review deployment/storage needs only after the local pipeline works. Deployment requires a separate scoped task.

Deferred: WhatIf architecture simulation, distributed jobs, managed database, authentication, billing, offensive testing (out of scope).

## Milestone validation and delivery

- [x] Recover the interrupted collector without discarding existing work; install the existing Cheerio dependency through the normal workspace workflow.
- [x] Deterministic collector tests cover malicious discovery, redirect scope, bounded parsing/crawling, partial failures, evidence provenance, every implemented rule, and actual graph relationships.
- [x] Add local API/storage tests and desktop/mobile live-report tests without contacting public targets in CI.
- [x] Record permanent commit/push workflow in AGENTS.md and AI_WORKFLOW.md.
- Final commands, manual result, and Git delivery are recorded in CURRENT_STATE.md.

The real HTTP investigation deliberately precedes tasks 9a/10. The controlled Linux isolation boundary is verified; browser scanning remains disabled pending separately authorized collection and deployment work.

## Task 10A — active systemd/cgroup verification

- [x] Reproduce the post-completion/default-property defect with ordered lifecycle tests before changing the backend.
- [x] Hold probe input until active identity, direct kernel values, PID membership and identity confirmation pass; preserve all requested security properties.
- [x] Separate active enforcement evidence from terminal outcome and captured-cgroup cleanup; add malformed/missing value, startup, timeout and real-child barrier regressions.
- [x] Active enforcement verified by run 36863325955 and retained in later runs; cleanup was separately corrected. See CURRENT_STATE for the latest milestone.

## Task 10B — cleanup verification

- [x] Represent kill/stop/final-state/captured-cgroup/reset-failed evidence separately from the final cleanup boolean.
- [x] Treat successful transient-unit unload and absent captured cgroup as valid teardown proof; preserve fail-closed behavior for active units, populated descendants, malformed paths, permission/read errors and timeouts.
- [x] Add focused regression coverage for cleanup semantics and actual captured-cgroup usage.
- [x] Successful and failed completed probes retained captured-cgroup cleanup proof in runs 37007052278 and 37194515782; full suite still pending.

## Task 10C-B — prepared root and proc/filesystem isolation

- [x] Add deterministic prepared-root inventory, immutable manifest validation, dependency parsing and identity/group tests.
- [x] Add systemd 255 `RootDirectory`, `ProtectProc=invisible`, `ProcSubset=pid` (filesystem probe only; `/proc/net` stays readable for the network probe), empty capabilities/ambient/supplementary groups and narrow proxy-socket bind.
- [x] Replace the invalid PID1-root filesystem assertion with owned sentinel, socket, proc, capability, identity and runtime-layout probes.
- [x] Add owned host fixture positive controls (sentinels outside PrivateTmp coverage) and structured errno classification.
- [x] Prepared-root/network/filesystem/PID checks passed in runs 37007052278 and 37194515782; Chromium failed sandbox initialization.

## Task 10D-B — Chromium sandbox diagnosis

- [x] Preserve diagnostic work, use one bounded Linux run and identify the AppArmor namespace restriction without weakening controls.
- [x] Verify exact Playwright/Chromium artifact, helper metadata, kernel/sysctls, namespace failure errno and Chromium failure. Run 37194515782 is the evidence record.

## Task 10D-C — exact-executable AppArmor userns enablement

- [x] Render one immutable-artifact attachment with only userns, validate root/manifest/revision/identity, install/load/verify/remove through privileged provisioning, and fail closed on policy errors.
- [x] Preserve all outer controls and unprofiled negative-control diagnostics; add bounded attached-profile/ID-map/namespace/renderer-seccomp observation and regression tests.
- [x] Required local checks passed. Run 37196267078 loaded/attached the profile and passed the browser fixture, then stopped on the process-title observer defect.
- [x] Validate the narrow process-title parsing regression; second run 37196847138 passed. Exactly two Linux runs used; no third run.
- [x] All required stages, cleanup, zero sentinel hits, unchanged restriction and internal namespace/renderer-seccomp proof passed; mark 9a complete for controlled Linux validation.
- Historical next task from 10D-C: **Stage 11 Browser Evidence Collector**, now completed for controlled fixtures on its separate feature branch. Arbitrary public scanning stays disabled.

## Stage 11 — Real Browser Evidence Collector

- [x] Preserve the exact validated source branch and create `feature/browser-evidence-collector` from 0799927720d3a7fc693335b0238b094b4371cb59.
- [x] Implement an internal fixed-fixture collector, versioned OBSERVED contracts, bounded/sanitized event and DOM retention, and distinct BROWSER_* Evidence records.
- [x] Add unit and controlled Chromium coverage plus a fixed Linux collector probe using the accepted proxy/systemd/root/AppArmor/cgroup/sandbox observer.
- [x] Complete full local validation, privacy/security diff review and feature-branch delivery. Exactly one bounded Linux run used; no correction or second run needed.
- [x] Record actual Linux schema/sandbox/proxy/cleanup/sentinel acceptance; run 37227469796 passed all stages, nine captured-cgroup removals and zero sentinel hits. Public admission/deployment remains separate.
- Exactly one next task: **Stage 12 Performance + Runtime Analysis.** Do not begin it here.
