# Current state

Updated 2026-10-01. Task: **First real deterministic website investigation — validated locally**.

## Recovered state

The interrupted implementation already contained the bounded HTTP/HTML scanner, safe-request integration, deterministic evidence/rules, local scan API and report store, live report UI, observed-link graph, and tests. No implementation was restarted. The previous CURRENT_STATE described the older security-only milestone and was stale.

Git was initialized on main with no commits, all project files untracked, and no remote. The canonical remote `https://github.com/OMIZOOMI/Cross-Exam.git` was added and fetched; it advertised no refs/history. This delivery therefore includes the existing foundation as an initial commit, not just the scanner delta. There is no committed baseline with which to independently prove earlier fixture changes; the resumed work did not edit the demo module or route, and all demo checks passed.

The only functional configuration correction during recovery was excluding generated `.crossexam` reports from Biome. The first lint run attempted to format an existing ignored report; final lint passes with real reports still present. No application source, dependencies, design, security policy or tests were changed during recovery.
Staged whitespace validation also found surplus EOF blank lines in `.nvmrc`, PRODUCT.md and ARCHITECTURE.md; these were removed without changing their content.

## PEM fixture privacy review

Only the two explicitly authorized PEM files were inspected. `packages/engine/src/security/fixtures/test-cert.pem` is self-signed, with matching issuer/subject `CN=example.com, O=CrossExam TEST FIXTURE` and SAN `DNS:example.com`; valid 2026-10-01 through 2036-09-28. Its self-signature verifies. `test-key.pem` matches that certificate's public key.

The only code references are in `transport.integration.test.ts`: an ephemeral loopback HTTPS server and a test-scoped TLS mock add explicit fixture trust. Negative cases reject untrusted TLS, hostname mismatch and the actual loopback peer. Production transport retains standard certificate verification and has no custom CA/dialer override. The fixture README already identifies both files as public disposable test data. Local/remote history was empty, so historical provenance cannot be established from Git. Current source/configuration provides no production use or external trust.

**Safe to commit publicly: YES**, as disposable test data, never as a credential for any real service or globally trusted CA. Do not reuse or install this key/certificate outside the controlled tests. No PEM contents or raw private inputs are reproduced in documentation. Filename-only preflight found no other secret-like project files; generated reports/build output remain ignored.

## Run locally

Requires Node.js 24 and pnpm 11.19.0; no accounts, keys, cloud services or database.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:3000`. Production preview: `pnpm build`, then `pnpm start` with port 3000 free. A temporary loopback production preview was started for this validation. Routes: `/`, `/report/demo`, and `/report/<id>`; local `POST /api/scans` runs the investigation. Reports under `apps/web/.crossexam/reports` expire after 24 hours and are not committed.

## One live verification

One new submission through the actual local production landing form targeted **https://example.com** at 2026-10-01T08:17:01.174Z. No mocked scan response or direct target browser navigation was used. Existing Playwright was used only to exercise the local application; target HTTP requests came from the production scanner through `safeRequest`.

- API returned 201; source `live`, status `completed`, duration 373 ms.
- Report ID: `819b6099-6414-4283-8d6a-294ff9a9199b`.
- Local report: `http://127.0.0.1:3000/report/819b6099-6414-4283-8d6a-294ff9a9199b`.
- One page: `/`, title `Example Domain`, HTTP 200, `text/html; charset=utf-8`, 713 body bytes, 158 ms fetch duration, zero redirects.
- Three safe-request operations: entry page plus robots.txt and sitemap.xml; both metadata endpoints returned 404. Completed response bodies totalled 2,139 bytes.
- Seven OBSERVED live evidence records: HTTP status, response headers, document metadata, structure, declared resources, robots and sitemap observations.
- Two DERIVED findings: missing meta description (E-003) and absent Content-Security-Policy response header (E-002). These are narrow rule matches, not vulnerability or ranking conclusions.
- Observed zero internal links and one external IANA link. The map correctly showed one node and zero edges; no third-party navigation occurred. A declared script reference was recorded but never fetched/executed.
- Stored report loaded and exported through the UI. Evidence references were intact; metrics, agent runs, challenges and experiments were empty; no acme.example fixture data leaked.
- Desktop 1440px and mobile 390px rendering passed, with no document overflow, page errors or outbound browser requests. `/report/demo` returned 200 with its explicit fixture disclosure and eight nodes.

No second live scan was required. Automated tests use controlled responses/local TLS fixtures rather than public target requests.

## Validation

Executed on Node.js 24.18.1 / pnpm 11.19.0, macOS, 2026-10-01:

| Command/check | Actual result |
| --- | --- |
| `pnpm lint` | PASS; 76 files; initial generated-report inclusion failure corrected and rerun after live/E2E validation |
| `pnpm test:security` | PASS; 288 tests, 6 files, including 4 real local TLS tests |
| `pnpm test:scanner` | PASS; 94 tests, 4 files |
| `pnpm test` | PASS; 420 tests, 14 files |
| `pnpm build` | PASS; root and all 5 workspace typechecks, optimized Next.js production build |
| `pnpm scanner:smoke` | PASS; 1 selected controlled-response test, 33 intentionally filtered tests |
| `E2E_PRODUCTION=1 pnpm test:e2e` | PASS; all 22 desktop/mobile checks against the freshly built/restarted production server |
| Live form → API → collector → storage → report/export | PASS; one real example.com investigation, desktop/mobile, demo regression |

## Capabilities and limitations

The existing URL/DNS/all-answer IP policy, literal-address-pinned HTTP(S) transport, peer/TLS checks and redirect revalidation protect every scanner request. Collection is bounded to 8 page attempts, depth 2, sequential requests, final entry origin, 1 MiB/page, 10 operations and 45 seconds. Query/action/account navigation is skipped. No forms are submitted. Cheerio parses returned bytes; no target resources or scripts execute. See SECURITY.md for exact budgets, conservative robots behavior and network assumptions.

The local adapter has same-origin/loopback admission controls and bounded schema-validated file storage. The report reuses the approved design for real evidence, findings, recommendations and observed relationships. The separate synthetic demo remains available. Missing reports return HTTP 404.

Still unavailable: target browser scanning/egress proxy/worker isolation, Lighthouse, browser axe execution, browser performance/runtime observations, AI/provider execution, authentication, billing, cloud deployment/AWS, WhatIf and automatic fixes. Existing Playwright/Chromium is solely application test infrastructure. This HTTP gate is not an OS firewall or independent security audit. Storage/admission are local single-process features, not a public multi-tenant service or durable queue. Partial scans and conservative policy exclusions are intentional.

## Delivery

Publication review covered 97 staged project files (the entire previously uncommitted foundation/milestone). Filename and content-pattern checks found no additional credentials or machine-specific paths. The two reviewed disposable PEM fixtures are the only approved private-key material. Build/cache output, screenshots/test results, dependencies and local investigation reports are excluded; staged whitespace validation passes. The recovery made no unrelated application changes.

The permanent validation → privacy/scope review → documentation → commit → fetch/preserve history → push workflow already exists in AGENTS.md and AI_WORKFLOW.md; it was verified rather than duplicated. Delivery targets origin/main without force. The final handoff supplies the actual commit SHA and push receipt; a commit cannot contain its own resulting SHA. No validation blocker remains; Git publication is verified separately after committing.

## Single recommended next task

**Task 9a: implement and verify an enforcing browser egress proxy plus worker network isolation using controlled adversarial fixtures**, including direct TCP/UDP/IPv6 and proxy-bypass checks. Keep arbitrary target browsing disabled until that boundary passes. This task was not started.
