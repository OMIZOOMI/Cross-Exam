# Architecture

## Stage 11 controlled browser evidence boundary

`apps/browser-worker/src/browser-collector.ts` is an internal, direct-file controlled-fixture entry. It accepts a fixed fixture identifier, never a caller-supplied target or launch/network-policy override. It launches the existing fixture worker, subscribes before navigation, observes one page during a fixed 300 ms post-load window, extracts selected bounded DOM fields, and closes the existing context/browser on every exit. Worker enforcement constants now live in `worker-limits.ts` with identical values. The collector uses the worker's existing operational deadline, including its cleanup reserve; there is no second extended deadline.

`packages/contracts/src/browser-evidence.ts` versions and runtime-validates collection identity, OBSERVED provenance, safe metadata and retention bounds. `source: fixture` and `scope: controlled-fixture` identify owned targets even though observations come from actual Chromium execution; these are not SIMULATED demo artifacts or public live reports. `packages/engine/src/browser-evidence` supplies privacy filtering and an append-only adapter to existing Evidence records with distinct BROWSER_* codes and `chromium-runtime-v1`. It does not overwrite HTTP evidence, generate findings or change report/UI admission.

The existing Linux probe has a fixed `collector` mode. It collects rich and bounded owned fixture evidence through the same Unix relay/enforcing proxy, systemd unit, sealed root, exact AppArmor profile and cgroup controls. The host independently validates its output and applies the existing Chromium namespace/renderer-seccomp observer and captured-cgroup/sentinel checks. Local Chromium tests prove collector semantics, not Linux confinement. Public `launchBrowserWorker()` remains fail-closed; reviewed admission and production provisioning remain separate work.

## Current runtime

```text
Browser → apps/web → local POST /api/scans → DeterministicScanRunner
              ├─ /report/demo: synthetic fixture
              ├─ /report/[id]: validated local live report
              └─ shared browser-safe early URL policy

Local CLI → apps/scanner → safeRequest → bounded HTTP/HTML investigation
                                ↓
                   compact evidence + deterministic rules → ScanReport
packages/agents → contracts (interfaces only; no provider)
```

This is a pnpm workspace with two product application boundaries and an internal gated browser-worker package, not a deployed microservice fleet. Node.js 24, TypeScript 5.9, Next.js 16, React 19, Tailwind CSS 4, React Flow, Recharts, and Zod. Versions are exact in manifests and locked in `pnpm-lock.yaml`.

| Module | Responsibility | Forbidden coupling |
| --- | --- | --- |
| `contracts` | Runtime schemas, types, explicit data source/provenance, graph-reference checks | Browser, network, framework, provider SDKs |
| `engine` | ScanRunner/ScanOutcome, report helpers, isolated URL/egress security module | React, model-specific APIs; Node networking imports in browser-safe entry points |
| `agents` | Typed role outputs, bounded state snapshots, provider-neutral interface | Direct browser/network authority |
| `scanner` | Bounded HTTP/HTML collector, deterministic rules, CLI and typed runner | Fabricated live reports |
| `web` | Report display, local scan API and bounded local report storage | Executing scanners in browser/event handlers |
| `browser-worker` | Fail-closed public launch gate and internal controlled Chromium harness | Public scanning without verified OS/network isolation; product evidence extraction |

## Data boundary

`ScanReportSchema` validates schema version, source, counts, unique IDs per collection, evidence/claim scan identity, and claim/evidence/challenge/experiment/verdict/page references. `source: fixture | live` describes data origin; provenance describes the nature of an assertion. They are separate axes. Fixture records cannot be mixed into a report marked live. This is an integrity guard, not a cryptographic attestation: code can still falsify labels.

`demo-report.ts` is a separate, static fixture module parsed on import. It is never imported into the live collector. Live reports have random scan IDs and measured timestamps/durations; extraction and rule decisions are deterministic for the same responses. Internal packages export TypeScript source and are private to this workspace; Next transpiles them, and the scanner uses tsx. Production build emits the web application and type-checks all packages; standalone package publication is not needed yet.

## UI

Server-rendered landing and report entry pages; focused client components for the form and report interaction. Graph/chart libraries load dynamically in the report. Semantic HTML controls and small shared visual primitives keep dependencies minimal. CSS tokens implement the visual system; motion respects reduced-motion preferences. System fonts avoid build-time font downloads. Route inventory/select controls provide an alternative to graph interaction. Report views live in local state and reset to Overview on reload.

## Implemented outbound HTTP boundary

`packages/engine/src/security` separates responsibilities without adding a service:

- `url-policy.ts`: browser-safe, shared early parsing and V1 input policy; exported as `@crossexam/engine/url-policy`. Accepted syntax is never connection authority.
- `ip-policy.ts` and `local-addresses.ts`: strict IP parsing, explicit special-range classification, and the scanner's own public interface denial.
- `dns.ts`: bounded per-hop A/AAAA resolution, conservative all-answer validation, cancellation.
- `transport.ts`: one-use native Node HTTP(S) Agent; private socket creation pins a checked literal address and verifies peer/Host/SNI/TLS identity. No second DNS lookup, caller transport override, automatic redirects, pool reuse, or environment proxy.
- `request-core.ts`: whole-operation limits, structured outcomes, complete manual redirect revalidation. Its dependency seams are internal test tools, not exported application APIs.
- `index.ts`: the sole Node networking entry point, `@crossexam/engine/security` → `safeRequest(input, options)`. Runtime options allow only GET/HEAD, cancellation, reductions within fixed limits, and a restriction-only redirect callback.

```text
Scanner HTTP call → safeRequest → URL policy → A + AAAA → all-answer/IP policy
                                             ↓ approved literal IP + original hostname
                                  pinned TCP/TLS + peer verification → bounded response
                                             ↓ redirect
                                  repeat complete policy + fresh DNS
```

The default engine entry point remains browser-safe. The web form imports only the early policy subpath; Node DNS, sockets, and ipaddr.js never enter its client graph. Contracts remain syntax/data schemas so fixture URLs do not accidentally become network targets. The web form calls only the local application API. `DeterministicScanRunner` calls the HTTP primitive for every document and conventional metadata request; no arbitrary-target fetch exists elsewhere.

`safeRequest` returns an auditable success/failure union. Internal response/history records may contain sensitive URLs and headers; the collector exposes only compact whitelisted observations, never raw histories, DNS addresses, cookies or HTML. Each operation pins one address, without fallback or cross-operation cache. See `SECURITY.md` for exact ranges, deadlines, redirect handling, and deployment assumptions.

## Live document investigation

`apps/scanner/src/investigate.ts` coordinates sequential, bounded collection; `documents.ts` parses HTML/XML using Cheerio slim; `crawl-policy.ts` adds navigation scope/action restrictions to the existing destination gate; `report.ts` derives claims/findings from evidence. `limits.ts` is the scanner workload policy. No second SSRF implementation or browser handle exists.

The source is `live` and `investigation.mode` is `deterministic-http`. Compact typed evidence codes/data supplement existing Evidence records. Pages carry requested/final URLs, status, duration, size, redirects and depth. Claims/verdicts explicitly name `Deterministic rule`, with empty agent/challenge/experiment collections. Contract refinements retain source/reference integrity and disallow fabricated activity in this mode. Findings link to the exact observations used by each rule.

Same-origin means the final entry origin, including scheme and port. Redirect restrictions narrow the existing gate before each next-hop DNS lookup. Eight attempts, depth two, sequential requests, 45 seconds total, and 1 MiB/page keep collection small; robots/sitemap have separate smaller bounds. See SECURITY for exact behavior and limitations.

A bounded synchronous Node route is sufficient for this local HTTP milestone: input → real collector → validated report → atomic local save → report ID. The form displays honest waiting/cancellation/error states without fake percentages. One process admits one scan at a time. Reports are capped at 4 MiB, retained up to 20 files/24 hours, and ignored by Git. This is not a durable/distributed queue or public hosting architecture.

`ReportView` reuses the approved report sections. Source-specific copy, live overview data, graph positions, timing axes and empty/partial states replace fixture assumptions. LIVE INVESTIGATION never renders the demo's paint comparison, fake measurements, agent activity or fixture recommendations. The demo module and its route remain separate and intact. Reference values are escaped text, never embedded target resources.

## Browser boundary components (fixture-only launch)

The engine's independent Node-only `./browser-egress` subpath implements a loopback HTTP/CONNECT proxy. `core.ts` handles framing, budgets, privacy-safe audit records and HTTP redirects; `connect.ts` pins raw tunnel sockets using the same URL/DNS/IP policy as the deterministic scanner. Its public starter fixes all production dependencies. Internal test seams are not package exports. CONNECT preserves end-to-end TLS; the proxy cannot inspect encrypted methods, paths or WSS.

The new `apps/browser-worker` package has no web route or CLI. Its public `launchBrowserWorker()` refuses launches with `ISOLATION_UNAVAILABLE`. The direct-file fixture harness launches a fresh Chromium process/context through the proxy, blocks WebSockets/service workers/downloads and unsafe methods, removes implicit local bypass rules and bounds job/request activity. `tests/browser-security` uses controlled responses and local TCP/TLS/UDP sentinels to verify actual Chromium behavior. Root `test:browser-security` runs both proxy/worker unit tests and this isolated suite; ordinary UI E2E configuration is unchanged.

Future isolation backends must own the worker process tree, filesystem/resource limits and network namespace/firewall. The public launcher cannot accept a boolean assurance in place of enforcement. No public backend is enabled, so arbitrary browser browsing stays disabled. The main product flow remains the validated HTTP scanner; there are no changes to the UI, contracts, report store or collector.

The Linux backend is intentionally an execution harness rather than a public worker service. `LinuxIsolationBackend` validates a sealed manifest-rooted runtime and provisions one systemd transient unit around a fixed probe. Systemd configures `RootDirectory`, `ProtectProc=invisible`, private network/devices/tmp/IPC, empty capabilities and supplementary groups, protected mounts and cgroup limits. `ProcSubset=pid` is scoped to the filesystem probe because it hides `/proc/net`; the network probe must read the private namespace route files. Only the proxy socket inode is bind-mounted into the root; the host relay reaches the existing proxy. Probe modes are fixed and JSON-bounded. Runs 37007052278 and 37194515782 passed root/network/filesystem/PID checks but failed Chromium sandbox initialization. Task 10D-C run 37196847138 passed all required stages with the exact AppArmor allowance and unchanged outer controls. No public browser launch is enabled.

Task 10A splits process launch from stdin release. The fixed probe waits for input EOF while the backend captures loaded/active identity, then `linux-cgroup.ts` checks memory/swap/PID/CPU kernel values and MainPID membership at the actual validated ControlGroup. A second identity query must match before input is released. Task 10B keeps cleanup evidence separate: `inspectControlGroup()` distinguishes absent, empty, populated and read/path errors, while final systemd state proves the unit is inactive. Task 10C-B validates the prepared root manifest and probes actual filesystem/proc/capability/group invariants. Public launch still fails closed regardless of these internal tests.

Task 10D-C adds a host provisioning boundary, `linux-apparmor.ts` plus `scripts/provision-chromium-apparmor.ts`. It validates the sealed revision-1243 artifact before installing one exact namespace-visible Chromium profile that grants only userns. CI owns installation/removal outside the worker. Production must provision the reviewed policy on its host and update locked artifact/profile identity together; this is not a runtime caller permission switch. The outer service properties are unchanged. `linux-sandbox-evidence.ts` observes only the already verified unit's processes from the host and requires attached profile, completed ID maps, distinct user/PID namespaces and renderer seccomp beyond the worker baseline. The unprofiled helper must remain restricted. Run 37196847138 passed full controlled Linux acceptance, including completed ID maps, nested PID namespaces and renderer-added seccomp; launch alone is never the acceptance criterion. Task 9a is complete for this harness, while production hosting and the collector remain separate.

## Planned collector pipeline

Validated request → enforced browser proxy/network isolation using the destination policy → bounded Playwright collector → immutable evidence store → deterministic claims → optional tribunal → validated report. Start with in-process orchestration and local files. Add queue/storage abstractions only when a working pipeline needs them; never run a browser scan in a short-lived web request.

Playwright + Chromium support application tests and controlled browser-boundary fixtures. The destination proxy and controlled Linux OS-level egress/process/resource boundary are implemented and tested. Production host provisioning, browser collection, durable scheduling/storage and provider implementations remain unimplemented. Local HTTP collection, cancellation, limited report persistence and live rendering still work. No cloud service is required.
