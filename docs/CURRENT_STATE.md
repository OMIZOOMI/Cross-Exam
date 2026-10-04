# Current state

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
