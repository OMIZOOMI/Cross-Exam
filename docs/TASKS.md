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
9a. [ ] **PARTIAL; LINUX CI PENDING:** Added a fixed systemd+cgroup v2 Linux backend, Unix-only proxy attachment, protected runtime preparation and focused probes for TCP/UDP/DNS/IPv4/IPv6/process/memory/timeout/filesystem/browser/TLS/proxy-down. Complete only after the supported Ubuntu 24.04 workflow actually passes. Current public launcher fails closed with ISOLATION_UNAVAILABLE; arbitrary browser scanning remains disabled.
10. [ ] After task 9a, add a bounded Playwright page collector behind the enforced proxy/network boundary; use controlled local fixtures with an explicit test-only policy. Capture navigation, headers, network/console observations, and cleanup/cancellation.
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

The real HTTP investigation deliberately precedes tasks 9a/10. Browser scanning remains disabled until its separate network isolation boundary is implemented and verified.
