# Current state

Updated 2026-10-01. Task: **Browser egress proxy and worker isolation**.

**Proxy and fixture worker validated; mandatory OS/network isolation unavailable. Arbitrary browser scanning remains disabled. Task 9a is partial, not a production-security sign-off.**

## Recovered baseline

Started with a clean working tree on main. HEAD and fetched origin/main both matched `1e04ce051c81090c3356e83ab370c5623d5140ed` (`feat: deliver safe deterministic website investigations`). Read the state/security/architecture/decisions/tasks/workflow and AGENTS instructions, inspected the shared destination gate, package structure and existing Playwright product tests before implementation. No UI redesign or changes to the deterministic scanner, contracts, demo, live report store/API or existing security policy were made.

The baseline's example.com verification remains historical: one fetched HTML page, seven real observations, two deterministic findings, and separate unchanged fixture demo. No new live public scan was performed for this task; all adversarial tests are controlled fixtures.

## Implemented

- `packages/engine/src/browser-egress`: bounded loopback HTTP/CONNECT proxy; reuses existing URL validation, all-answer DNS/IP validation and pinned HTTP transport. CONNECT adds literal TCP pinning and peer validation before acknowledging/forwarding. No TLS MITM or certificate verification bypass. Strict authority/port checks, HTTP redirect validation, upgrade/body/method rejection, cleanup and resource limits.
- Structured proxy audit decisions contain only allow/block, classification, reason and request type. Browser decisions add bounded sequencing/type/reason without target URLs, queries, headers or payloads.
- `apps/browser-worker`: public `launchBrowserWorker()` always fails closed with `ISOLATION_UNAVAILABLE`. Immutable status enumerates the missing external process/network/filesystem/resource enforcement. No public API/form browser execution was added.
- Internal direct-file fixture harness launches fresh sandbox-enabled Chromium with explicit proxy, subtractive `<-loopback>` bypass rule, no DIRECT fallback, browser DNS blocked, QUIC/non-proxied WebRTC UDP disabled, clean environment/context, no credentials or granted permissions, blocked service workers/downloads/WS/WSS, bounded page/request/deadline behavior.
- New `test:browser-security` suite combines proxy/worker unit/integration tests with a separate serial Chromium/protocol suite. Existing product E2E configuration remains unchanged. Existing Playwright version is reused; the lockfile adds only the new workspace importer.

Detailed enforcement boundaries, primary research references, exact budgets and limitations are in `docs/SECURITY.md`; component design is in `docs/ARCHITECTURE.md`; decisions 023–025 record the tradeoffs.

## Verification evidence

Playwright 1.63.0 / Chromium 153.0.8010.12 on macOS:

- Allowed public-style fixture HTML, scripts, fetch/XHR and frames load through the real local proxy. A closed fake resolver and response transport prevent all real target DNS/HTTP requests.
- Browser-created images/scripts/fetch/XHR/iframes to private-resolving names are blocked; mixed IPv4/IPv6 DNS answers fail closed. Redirect and window.location escapes are blocked.
- Owned IPv4/IPv6 loopback sentinels receive zero hits for proxy-bypass attempts (localhost, loopback, shorthand IPv4, ::1, mapped IPv6). A stopped proxy causes ERR_PROXY_CONNECTION_FAILED without direct fallback.
- WS/WSS and unsafe POST are denied by worker routing; cleartext upgrades are independently denied by proxy tests. Chromium rejects the self-signed test certificate through CONNECT; a separately scoped Node TLS test verifies an explicitly trusted fixture tunnel.
- A WebRTC data-channel ICE attempt sends zero packets to an owned UDP STUN sentinel. This is a bounded browser observation, not proof of general UDP containment.
- Private IPv4, unspecified, link-local, metadata, IPv6 loopback/ULA/link-local/mapped literals and non-default ports are tested as proxy HTTP/CONNECT input, never by probing real infrastructure.
- Fresh context state, ungranted geolocation, popup closure and deadline shutdown work in real Chromium. Configuration/unit tests cover service-worker/download blocking and request caps; full hostile secure-origin service-worker/download lifecycle tests remain a coverage gap.

## Validation

Executed 2026-10-01 on Node.js 24.18.1 / pnpm 11.19.0:

| Command | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; existing dependency versions reused |
| `pnpm lint` | PASS; 92 files |
| `pnpm test:security` | PASS; 288 tests / 6 files |
| `pnpm test:scanner` | PASS; 94 tests / 4 files |
| `pnpm test` | PASS; 470 tests / 19 files (all original 420 retained) |
| `pnpm build` | PASS; root + six workspace typechecks and Next.js production build |
| `pnpm scanner:smoke` | PASS; 1 selected test; 33 deliberately filtered |
| `pnpm test:browser-security` | PASS; 50 unit/integration tests plus 25 serial adversarial browser/protocol checks |
| `E2E_PRODUCTION=1 pnpm test:e2e` | PASS; 22 desktop/mobile product checks against freshly built production server |

The previous local production preview was deliberately terminated (SIGTERM/143) before E2E started the new build; this is not a validation failure. No public targets, real private services, cloud metadata services, model APIs, deployments or paid services were used.

## Run and limitations

Normal application workflow is unchanged: `pnpm dev` at `http://127.0.0.1:3000`; production preview is `pnpm build && pnpm start`. The form continues deterministic HTTP collection only. No browser worker HTTP endpoint, arbitrary URL CLI or feature-enable environment variable exists. Run `pnpm test:browser-security` for the controlled boundary checks with the already installed Chromium.

No Docker/Podman runtime exists on this macOS host; no container, namespace, firewall, hard memory/PID quota, disposable host filesystem or independently enforced process-tree cleanup was implemented/verified. Chromium sandbox/context isolation and proxy settings are not substitutes. Direct socket/UDP/IPv6 escape by other browser facilities or a compromised subprocess remains outside the proof. Proxy CONNECT cannot inspect encrypted methods/headers/URLs/WSS or public forwarding services; public IP pinning does not prevent deployment-specific DNAT. Worker cleanup is cooperative. All of this is why the arbitrary launch gate refuses execution even though fixture tests pass.

No full browser collector, Lighthouse, axe browser execution, AI agents/providers, authentication, billing, AWS, WhatIf, screenshots as product evidence or automatic fixes were implemented. No UI changes.

## Delivery and next task

The existing validated-task review/document/commit/fetch/push definition of done in AGENTS.md and AI_WORKFLOW.md was preserved. The final handoff reports the actual commit and remote verification; a commit cannot contain its own SHA. Generated reports, browser artifacts, caches and credentials must remain excluded. Reviewed public TLS fixture PEM files are reused unchanged in controlled tests only.

Final scope/privacy review: 26 changed/new source, test, manifest and documentation files; no new secret-like files or credential/machine-path pattern matches. Existing disposable PEM bytes are unchanged. Git confirms no changes under web, deterministic scanner, contracts, agents or product E2E configuration. Reports, `.next` and test output are ignored; whitespace validation and final lint pass. Fetched origin/main still matched the baseline before publication, so no unrelated remote history needed reconciliation.

**Exactly one recommended next task:** implement and verify the missing Linux process/network isolation backend for this proxy/worker, with external TCP/UDP/IPv6/DNS bypass tests and process/filesystem/resource confinement, before enabling any arbitrary-target browser collector. It was not started here.
