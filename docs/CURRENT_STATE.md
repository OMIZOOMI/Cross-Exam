# Current state

Updated 2026-10-04. Task: **10D-C — Exact-executable AppArmor userns enablement**.

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

`launchBrowserWorker()` still always throws `ISOLATION_UNAVAILABLE`. Production deployment requires reviewed host provisioning and artifact/profile updates together. CONNECT does not inspect encrypted methods, paths or WSS. Browser collection, scheduling and public admission remain unimplemented.

**Exactly one recommended next task: Stage 11 Browser Evidence Collector.** Do not begin it in this task. Public scanning remains disabled until separately authorized implementation and validation.
