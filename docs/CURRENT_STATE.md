# Current state

Updated 2026-10-01. Task: **10B — Cleanup verification**.

**Task 9a remains PARTIAL. Active enforcement and cleanup verification are fixed locally; the filesystem/PID confinement mismatch is explicitly unresolved. Public browser scanning remains disabled. This document is the pre-push snapshot for the single authorized Linux validation attempt, not a production-security sign-off.**

## Recovered baseline and scope

Started clean on `validation/linux-isolation` at `3b57c466c68050f113f566c27328f85e0529e51f`. Stable main and fetched origin/main remain `9bafdb5df0d97668abd66e09fa342610da323ace`. Preserved all 19 existing candidate commits. Read the state, security, architecture, decisions, tasks and workflow documentation and inspected the backend, cgroup helper, unit tests, harness, fixed probes, preparation script and workflow before edits.

Task 10B changes only cleanup verification evidence, captured-cgroup teardown classification, focused tests, harness diagnostics and candidate documentation. It preserves all systemd security properties, requested limits, proxy behavior and fixed probes. No UI, HTTP collector, shared contracts, browser collector, AI, dependencies or deployment changes. The separate filesystem/PID test has not been weakened or redesigned. Main must not be merged or pushed by this task.

## Linux failure diagnosed

The active-enforcement fix was validated by [Linux run 36863325955](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/36863325955): the probe was active under its unit-specific cgroup with the requested kernel limits, and the network probe passed. The run still reported `cleaned=false`. Its terminal evidence was `LoadState=not-found`, `ActiveState=inactive`, `Result=success`, `ExecMainCode=0`, and `ExecMainStatus=0`, proving the successful transient unit had already been unloaded.

The cleanup root cause was housekeeping status being treated as cleanup proof. For a successful transient unit already unloaded, `systemctl stop` and `systemctl reset-failed` can return the documented no-such-unit status, while `systemctl kill` is likewise unnecessary; the old code only accepted a narrow success/not-found set for stop/reset and collapsed all subchecks into one boolean. The cleanup path also required `TasksCurrent` to be present even though an unloaded unit may omit it. The security proof is instead the final inactive/not-active state plus the actual captured cgroup being absent or reporting `populated 0`; command statuses are retained as diagnostics.

## Task 10A implementation

- Split launcher startup from input release and completion. Stdin remains open and empty; the existing fixed probe reads through EOF before executing its operation.
- Require loaded/active state, positive MainPID, nonempty actual unit-specific ControlGroup and nonzero InvocationID within a bounded startup wait.
- `linux-cgroup.ts` validates the captured path and reads fixed, bounded cgroup-v2 files, rejecting traversal/symlinks/missing or malformed values. Require memory 1073741824 bytes, swap 0, 128 tasks, finite CPU quota equal to period, and MainPID membership in `cgroup.procs`.
- Reconfirm the same active PID/cgroup/invocation after the reads, then release JSON and close stdin. Terminal state is outcome evidence only; unloaded-success defaults cannot replace the retained active proof.
- Kill/stop on startup, verification or timeout failure. Cleanup checks the actual captured cgroup and descendant population; no `/system.slice/<unit>` fallback is invented. A startup failure without a captured group cannot claim proven cleanup.
- Cleanup now records kill, stop, final systemd query/state, captured cgroup state (`absent`, `empty`, `populated`, `error`), reset-failed status and final result. No-such-unit housekeeping outcomes after successful unload do not override proof that the service is inactive and the captured cgroup is gone/empty; timeouts, active state, populated descendants, malformed paths and read/permission errors still fail closed.
- Each completed probe logs active systemd identity, direct kernel values and cleanup before subsequent assertions. Verification exceptions retain the phase, bounded values and launcher diagnostics.

The lifecycle regression tests were run against the original backend first and reproduced incorrect ordering/guessed cleanup paths. The replacement passes fast-success/unload, activation waiting, invalid identity, changed invocation, startup failure/deadline, malformed/unlimited/mismatched kernel limits, missing PID membership, timeout and lingering-descendant cases. Three real local child-process checks verify the stdin barrier, timeout and exec failure without pretending macOS enforces Linux cgroups.

## Local validation

Executed on Node.js 24.18.1 / pnpm 11.19.0 with controlled fixture listeners and installed Chromium:

| Command | Actual result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm test:security` | PASS; 288 tests / 6 files |
| `pnpm test:scanner` | PASS; 94 tests / 4 files |
| `pnpm test` | PASS; 561 tests / 23 files |
| `pnpm build` | PASS; root/workspace typechecks and Next.js production build |
| `pnpm test:browser-security` | PASS; 124 unit/integration tests and 25 Chromium/protocol checks |
| `pnpm exec vitest run apps/browser-worker/src/linux-backend.test.ts apps/browser-worker/src/linux-cgroup.test.ts apps/browser-worker/src/linux-lifecycle.test.ts apps/browser-worker/src/linux-command.test.ts` | PASS; 91 tests / 4 files, including focused cleanup/cgroup regressions |

These local checks do not prove Linux OS confinement. No public website, private infrastructure or cloud metadata endpoint was probed. The existing deterministic HTTP live-report milestone and separate fixture demo remain unchanged.

## One permitted Linux run

The authorized delivery is exactly one descriptive commit and push to `validation/linux-isolation`, followed by read-only observation of the resulting Ubuntu 24.04 workflow. No PR is open for this branch, so its push is the single configured event. The new run cannot exist before this commit is pushed: its actual run ID/outcome and active cgroup observations belong to the commit's [Linux Actions record](https://github.com/OMIZOOMI/Cross-Exam/actions/workflows/linux-isolation.yml) and final Task 10A handoff. This pre-push document records **no new Linux success**. The mandatory stop-on-failure rule forbids a patch/retry or second run, including another documentation push; do not infer complete isolation from a resource-only pass.

## Remaining boundary and next task

Systemd's `ProtectSystem=strict` makes host paths read-only; it does not provide a filesystem allowlist or prohibit access to all filesystem AF_UNIX sockets. Removing bubblewrap left no replacement PID namespace/root confinement. The filesystem probe still assumes a confined PID 1 root via `/proc/1/root`; its assumptions and the backend do not match. Task 10A does not solve this gap, even if its active resource proof succeeds.

`launchBrowserWorker()` still always throws `ISOLATION_UNAVAILABLE`. All production browser collection remains disabled. The verified destination proxy and controlled Chromium checks do not establish complete process/filesystem/network isolation; CONNECT also cannot inspect encrypted URLs, methods or WebSockets. See SECURITY.md for the full boundary.

**Exactly one recommended next task: Resolve filesystem/PID confinement mismatch.** Do not begin browser collection or AI work.
