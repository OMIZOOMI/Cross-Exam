# Current state

Updated 2026-10-02. Task: **10C-B — Prepared root and proc/filesystem isolation**.

**Task 9a remains PARTIAL. Active enforcement and cleanup verification remain preserved; Task 10C-B adds a prepared root and proc/capability/filesystem probes. The one authorized Linux validation run is still pending. Public browser scanning remains disabled.**

## Recovered baseline and scope

Started clean on `validation/linux-isolation` at `881e3bbaed1e6669fc5c95db51b37129a15c76ea`. Stable main and fetched origin/main remain `9bafdb5df0d97668abd66e09fa342610da323ace`. Preserved prior Task 10A/10B commits. Read the state, security, architecture, decisions, tasks and workflow documentation and inspected the backend, cgroup helper, unit tests, harness, fixed probes, preparation script and workflow before edits.

Task 10C-B changes only the prepared-root runtime, systemd proc/capability/identity controls, owned filesystem fixtures, probe diagnostics/tests and candidate documentation. It preserves Task 10A cgroup enforcement, Task 10B cleanup proof, network/proxy behavior and the fail-closed public launcher. No UI, HTTP collector, shared contracts, browser collector, AI, dependencies or deployment changes. Main must not be merged or pushed by this task.

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
| `pnpm lint` | PASS; no errors or warnings |
| `pnpm test:security` | PASS; 288 tests / 6 files |
| `pnpm test:scanner` | PASS; 94 tests / 4 files |
| `pnpm test` | PASS; 590 tests / 25 files |
| `pnpm build` | PASS; root/workspace typechecks and Next.js production build |
| `pnpm test:browser-security` | PASS; 170 unit/integration tests and 25 Chromium/protocol checks |
| `pnpm exec vitest run apps/browser-worker/src/linux-access.test.ts apps/browser-worker/src/linux-root.test.ts apps/browser-worker/src/linux-backend.test.ts apps/browser-worker/src/linux-cgroup.test.ts apps/browser-worker/src/linux-lifecycle.test.ts apps/browser-worker/src/linux-command.test.ts` | PASS; 120 tests / 6 files, including prepared-root, errno and cleanup regressions |
| `pnpm exec esbuild tests/linux-isolation/probe.ts --bundle …` (CI prepare step, bundle only) | PASS; bundle builds and loads |

These local checks do not prove Linux OS confinement. No public website, private infrastructure or cloud metadata endpoint was probed. The existing deterministic HTTP live-report milestone and separate fixture demo remain unchanged.

## One permitted Linux run

The authorized delivery is exactly one descriptive commit and push to `validation/linux-isolation`, followed by read-only observation of the resulting Ubuntu 24.04 workflow. No PR is open for this branch, so its push is the single configured event. The new run cannot exist before this commit is pushed: its actual run ID/outcome and active cgroup observations belong to the commit's [Linux Actions record](https://github.com/OMIZOOMI/Cross-Exam/actions/workflows/linux-isolation.yml) and final Task 10C-B handoff. This pre-push document records **no new Linux success**. The mandatory stop-on-failure rule forbids a patch/retry or second run, including another documentation push; do not infer complete isolation from a resource-only pass.

## Task 10C-B implementation

- The preparation script now builds `/var/lib/crossexam/root` as a sealed, manifest-validated root containing only copied probe/runtime/browser assets, required dynamic libraries (including Chromium's dlopen'd NSS/nspr set), minimal configuration/fonts and empty proc/dev/sys/tmp/run mount points. It dereferences/rejects symlinks, rejects sockets/unexpected entries, removes worker write bits, chowns the root to root and validates content hashes before launch. The prepared root itself is not committed.
- The transient unit uses `RootDirectory`, a single file bind for `/run/crossexam/proxy.sock`, `ProtectProc=invisible`, `PrivateIPC`, empty `CapabilityBoundingSet`, empty `AmbientCapabilities`, empty `SupplementaryGroups`, `NoNewPrivileges`, existing private network/device/tmp and existing cgroup/cleanup settings. `ProcSubset=pid` is applied only to the filesystem probe: it removes `/proc/net`, which the network probe must read to verify the private namespace routes, and which Chromium probes must not risk. The public browser launcher remains unavailable.
- The filesystem probe no longer requires `/proc/1/root` to match the worker root. It checks read-only `/app`, writable private `/tmp`, inaccessible owned repository/home/world-readable host sentinels and unrelated socket (owned fixtures live under `/opt/crossexam-fixtures`, outside `PrivateTmp` coverage, so only `RootDirectory` can hide them), operational intended proxy socket, own proc visibility, unrelated PID root/cwd/fd/environ/namespace denial, zero hex-parsed effective/bounding capabilities, empty supplementary groups, allowed root layout and sensitive environment absence. Denial errors must be `ENOENT`/`EACCES`/`EPERM`; unexpected I/O errors and successful access fail the probe.
- The adversarial-path input fields are required; missing sentinel fields now fail input validation instead of defaulting to a silently unreachable path. The shared errno classifier (`linux-access.ts`) is unit-tested directly.

Local validation is complete; the one Linux run is required to establish whether RootDirectory and real Chromium dependencies work on Ubuntu. No Linux result is claimed in this pre-push state.

## Remaining boundary and next task

The prepared root and proc restrictions are implemented but not yet Linux-verified. Chromium compatibility, exact namespace/proc visibility and all full-suite stages remain unknown until the single authorized run. A private PID namespace is intentionally not assumed; systemd 255 proc controls and RootDirectory are the tested boundary for this task.

`launchBrowserWorker()` still always throws `ISOLATION_UNAVAILABLE`. All production browser collection remains disabled. The verified destination proxy and controlled Chromium checks do not establish complete process/filesystem/network isolation; CONNECT also cannot inspect encrypted URLs, methods or WebSockets. See SECURITY.md for the full boundary.

**Exactly one recommended next task: Resolve filesystem/PID confinement mismatch.** Do not begin browser collection or AI work.
