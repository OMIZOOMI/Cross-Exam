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
- The attachment follows systemd 255's mounted root and AppArmor's namespace-visible absolute path. Actual attachment must still be proven by the browser process's `/proc/<pid>/attr/current` in CI. No alternate host path is granted speculatively.
- A bounded host observer reads only verified-unit cgroup members. Acceptance requires the exact attached browser, non-root identity, unchanged worker NoNewPrivileges/capability state, zygote and renderer user/PID namespaces distinct from the worker, completed own-ID UID/GID maps with setgroups denied, and renderer-added seccomp. Chromium emits bounded sandbox diagnostics. The inherited unprofiled helper remains a negative control and must still fail at setgroups with EACCES.
- The harness continues beyond browser to TLS, memory, timeout and proxy-down. Existing active limits, captured-cgroup cleanup and owned sentinel checks remain unchanged. No public launcher or collector is enabled.

## Validation and CI budget

Focused command: `pnpm exec vitest run apps/browser-worker/src/linux-apparmor.test.ts apps/browser-worker/src/linux-sandbox-evidence.test.ts apps/browser-worker/src/linux-lifecycle.test.ts apps/browser-worker/src/fixture-worker.test.ts` — **PASS, 120 tests / 4 files**.

| Command | Actual result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS; root and all workspaces |
| `pnpm test:security` | PASS; 288 tests / 6 files |
| `pnpm test:scanner` | PASS; 94 tests / 4 files |
| `pnpm test` | PASS; 743 tests / 30 files |
| `pnpm build` | PASS; typechecks and production build |
| `pnpm test:browser-security` | PASS; 323 unit/integration tests and 25 controlled browser checks |
| `pnpm test:e2e` | PASS; 22 desktop/mobile checks |
| `pnpm scanner:smoke` | PASS; 1 selected deterministic collector test |
| `bash -n scripts/prepare-linux-isolation.sh` | PASS |
| Fixed Linux probe bundle with esbuild | PASS |

MacOS tests cannot prove Linux AppArmor enforcement. `apparmor_parser` is unavailable locally; syntax/load/attachment must be proven by Linux CI. Tests use closed owned fixtures; no public website/private infrastructure/metadata endpoint was probed.

No Task 10D-C Linux run has been used yet. Run 1 is allowed only after required local checks pass. Run 2 is allowed only for a directly evidenced, fully understood integration defect that needs no broader allowance or weakened control and receives regression coverage. No third run. Keep Task 9a partial until every required Linux stage, cleanup, sentinel and internal-sandbox proof passes.

## Remaining boundary and next task

The profile is an exact pathname allowance, not a cryptographic kernel attachment. Immutable prepared-root validation links that pathname to the reviewed artifact under the trusted host provisioning model. Browser compromise gains namespace operations within the existing outer confinement; unprivileged kernel attack surface remains a security consideration. This is not a production deployment audit.

`launchBrowserWorker()` still always throws `ISOLATION_UNAVAILABLE`. Production deployment requires reviewed host provisioning and artifact/profile updates together. CONNECT does not inspect encrypted methods, paths or WSS. Browser collection, scheduling and public admission remain unimplemented.

**Exactly one recommended next task: Complete Task 10D-C Linux acceptance.** Stage 11 Browser Evidence Collector may be recommended only if Task 9a becomes COMPLETE.
