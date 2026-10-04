# Current state

Updated 2026-10-04. Task: **10D-C — Exact-executable AppArmor userns enablement**.

**Task 9a remains PARTIAL pending this task's Linux acceptance run. Arbitrary public browser scanning remains disabled.** The deterministic HTTP scanner, live reports, fixture demo and approved UI are unchanged.

## Starting state and verified diagnosis

Started clean on `validation/linux-isolation` at `8dc3b553333df7491e96e139aae305542699428c`. Main and origin/main remain `9bafdb5df0d97668abd66e09fa342610da323ace`; this task must not modify main or open a PR.

[Run 37007052278](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37007052278) passed preparation, network, filesystem and PID probes, then failed during Chromium sandbox initialization. [Diagnostic run 37194515782](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37194515782), at the starting commit, identified Ubuntu AppArmor's unprivileged-userns restriction: NEWUSER creation succeeded, but `/proc/self/setgroups` failed EACCES after transition to `unprivileged_userns (enforce)`. AppArmor denied namespace-scoped sys_admin; Chromium reported `No usable sandbox!`. Cleanup succeeded. This demonstrated no conflict requiring removal of the outer systemd controls.

That runner used Playwright 1.63.0, Chromium 153.0.8010.12/revision 1243, kernel 6.17.0-1022-azure and systemd 255.4-1ubuntu8.17. AppArmor was enabled, `kernel.unprivileged_userns_clone=1`, and `kernel.apparmor_restrict_unprivileged_userns=1`. The launched headless-shell executable has no sibling SUID sandbox helper. Preparation preserves no SUID path; the userns mechanism is required.

## Implementation awaiting Linux proof

- `linux-apparmor.ts` renders exactly one profile, `crossexam-chromium-userns`, attached to `/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`, with `flags=(unconfined)` and only `userns,`. No wildcard, alternate attachment, caller path or global sysctl change is permitted.
- Privileged provisioning first validates the existing sealed prepared-root manifest/hashes, fixed Playwright/Chromium versions, root ownership, regular-file identity, immutable permissions and safe parents. The profile is exclusively created as root:root 0444, syntax-checked, loaded and verified. Parse/load/verification errors fail closed and roll back owned policy; conflicting pre-existing policy is never overwritten. CI unloads/removes its temporary policy and verifies the restriction remains enabled.
- The attachment follows systemd 255's mounted root and AppArmor's namespace-visible absolute path. Run 1 verified the browser's attached profile; complete inner-sandbox evidence remains pending the corrected observer. No alternate host path is granted speculatively.
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

MacOS tests cannot prove Linux AppArmor enforcement. `apparmor_parser` is unavailable locally; syntax/load/attachment must be proven by Linux CI. Tests use closed owned fixtures; no public website/private infrastructure/metadata endpoint was probed.

[Run 1: 37196267078](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37196267078), commit `db49f565e4aee679208e5254963cc79d5e0ff021`, passed preparation, exact profile provisioning, network/filesystem/PID probes and the browser fixture (exit 0). All completed probes had captured cgroups absent and cleaned=true. The observer verified the attached browser but failed `MISSING_SANDBOXED_ZYGOTE`; it stopped the suite before TLS/memory/timeout/proxy-down. Chromium's own log reported renderer seccomp-bpf activation. Temporary policy cleanup passed and AppArmor/restriction remained enabled.

The failure exposed a concrete observer defect: [Chromium 153 rewrites child command lines into a single space-separated process title](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/base/process/set_process_title.cc), including [forked renderers](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/content/zygote/zygote_linux.cc). The observer's NUL-argv executable equality rejected these stable processes. The only integration correction accepts that exact-executable-prefixed representation with unchanged flag/role/profile/mapping/namespace/seccomp predicates and regression coverage. This meets the authorized narrow Run 2 condition; no allowance or outer control changes are included.

The correction passed focused tests (135), the full suite (758), lint, typechecks/build and browser-security (338+25). Run 2 is ready; the AppArmor policy and every outer control are unchanged. No third run is permitted. Task 9a remains partial until every required Linux stage, cleanup, sentinel and internal-sandbox proof passes.

## Remaining boundary and next task

The profile is an exact pathname allowance, not a cryptographic kernel attachment. Immutable prepared-root validation links that pathname to the reviewed artifact under the trusted host provisioning model. Browser compromise gains namespace operations within the existing outer confinement; unprivileged kernel attack surface remains a security consideration. This is not a production deployment audit.

`launchBrowserWorker()` still always throws `ISOLATION_UNAVAILABLE`. Production deployment requires reviewed host provisioning and artifact/profile updates together. CONNECT does not inspect encrypted methods, paths or WSS. Browser collection, scheduling and public admission remain unimplemented.

**Exactly one recommended next task: Complete Task 10D-C Linux acceptance.** Stage 11 Browser Evidence Collector may be recommended only if Task 9a becomes COMPLETE.
