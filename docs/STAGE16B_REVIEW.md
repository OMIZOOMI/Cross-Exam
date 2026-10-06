# Stage 16B owner review packet — no approval or execution

## Stage 16B.2 — Linux preflight requirements; no selected-host packet

Stage 16B.2 adds a distinct static Linux packet/policy, not an approval-ready placeholder. **No operational Linux packet, Linux intent, owner signing key, owner approval or execution receipt has been created.** Real dispatch and the protected-key loader remain disabled. Ordinary offline Node CI is not the persistent host, and the production verifier rejects known GitHub Actions execution. No real fixture/browser/proxy/worker or Linux isolation harness runs in this stage.

The owner must choose all of the following before Linux staging:

1. A persistent, manually operated trusted **Ubuntu 24.04** host, with expected hostname/machine-id hashes and the exact clean implementation checkout. Persistence is an owner commitment, not inferred from OS metadata; the host/OS account/mount/storage remain trusted.
2. Exact independently provisioned sealed-root manifest and Chromium binary hashes, the pinned Playwright 1.63.0/Chromium 153.0.8010.12/revision 1243 executable, and expected disabled-wrapper source artifact hash. The verifier also independently hashes the prepared `/app/probe.cjs` and checks manifest linkage. It launches nothing, including no --version command. Read access to the existing sealed root is required; it grants no new capabilities or filesystem permissions.
3. Actual crossexam-worker UID/GID, separate trusted operator/storage-owner UID/GID, an already provisioned canonical private directory outside the checkout/prepared root with safe ancestors, explicit owner-removal retention and a same-host namespace. The new namespace is controlled-fixture-linux-v1. Storage is 0700/0600, bounded to 16 intents; hashes bind path, hostname, machine-id, worker and storage owners. Machine-id/hostname hashes are consistency bindings, not hardware attestation or distributed authority.
4. An owner-reviewed **host-local OS/TPM-protected signing mechanism** (or equivalently reviewed custody), key ID/public-key fingerprint and signature scheme, plus the trusted adapter implementation/manual launch procedure. No particular manager, signing algorithm or key provider has been chosen. Private key material must never enter argv/history/logs/repository/ledger. Only public identity, canonical signed metadata and bounded signature are retained. A plaintext key file or bare approved boolean is not this contract.

The read-only verifier rejects wrong platform, commit, manifest/binary/runner identity, locked executable/version metadata, worker UID/GID, storage ownership/location, hostname/machine-id and policy. It checks existing prepared-root closure with the accepted validator and hashes regular, non-symlink, root-owned, non-writable assets. Fixed source/configuration/schema/policy/fixture hashes pin the existing AppArmor/proxy/cgroup/deadline/cleanup requirements, including stop timeout 5 seconds. **Static configuration is not evidence those controls are enforced on a newly selected host.** Browser/fixture/proxy/worker invocation flags remain false, observation/attestation null. Key metadata in the selection does not prove protected custody; the unprovisioned loader cannot verify a real owner decision.

Future stage loads only the pinned host-owned numeric input and fixed injected fakes, promotes the live original Stage 16A run, binds verified non-null Linux artifact hashes, and durably creates a new pending intent/review in that selected host's private storage. Preview independently verifies identities again, uses no source replay registry, and reconstructs identical receipt/hash without writes. No-marker remains pending across restart/age; expiry/cancel/denial require explicit action. A change of host, artifacts, owner/key/configuration or reviewed loader/runner code requires a new coherent intent/packet; neither old fake records nor the macOS candidate are converted.

Approval v2 signs canonical schema-ordered bytes prefixed by `CrossExam/owner-controlled-fixture-decision/v2\n`. It binds decision ID, receipt/release/intent/Linux preflight hashes, implementation/proof/Linux policy, host/storage ownership, exact operation/key and expiry. Protected backend public identity and signature must match; validation is capped at two seconds, zero retries, with no late grant. Shape parsing, hashes, push/restart/CI and plain JSON do not supply authority. Real backend loading always fails OWNER_AUTHORITY_NOT_PROVISIONED; actual manual dispatch always fails REAL_DISPATCH_DISABLED. Synthetic signers are explicitly noncryptographic unit fakes and cannot verify production receipts or create observations.

Offline test-only consumption proves durable signed approval → one-attempt marker → matching ledger dispatchHash order before a synthetic consumption point, never a runner call. The decision ID is checked across the bounded namespace under a same-host lock. Interrupted approval without marker stays pending; it is not automatically resumed. Marker without a valid final receipt becomes outcome-unknown; exact result-before-final-ledger reconciles; corruption fails closed and terminal replay never redispatches. This is same-host trusted-storage consumption, not external/distributed at-most-once, runtime sandbox proof or physical power-loss acceptance.

No runnable owner-approved command or fabricated Linux values are provided here. The future operator supports verify/stage/preview with an explicit private metadata file; no approve/execute/sign command. The next gate is owner host/custody selection and reviewed adapter/provisioned artifact/storage identities, then **non-dispatching Linux verification/staging**, exact owner packet review, explicit owner approval, first separately implemented manually gated fixture run, complete result/security review, and observed acceptance only if every check passes.

The existing macOS candidate below remains unchanged: it was not copied, restaged, approved, cancelled, expired or dispatched. Its receipt hash stays d7bcf2e8a27006cdfc18752d0d08cd54f20752981044e277d34438c6bdadecff. Its old implementation/configuration bindings belong to the frozen Stage 16B.1 code and provide no Linux authority. No generated operational packet, ledger, key or report is committed. CrossExam remains free for all users; Stage 14C paid acceptance remains owner-deferred and public browser scanning DISABLED.

Delivery: implementation **066ef69d8ab81bbecb4fac9e690a7d2b67901696**, source **fa3442072d75490a09acc86336a900b9526164e1**, new branch `feature/stage16b2-linux-preflight`. [Offline Node CI 37442005422](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37442005422) attempt 1 PASS on the exact implementation SHA, all steps successful. Local checks: 139 new focused, 321 controlled, 164 previous preflight, 521 combined agent-contract, 167 provider/ledger/operator and 1,803 full units; lint/typecheck/build/diff check PASS. No Linux/browser job or selected-host verification ran. Read-only preservation checks confirmed all four old macOS candidate hashes/mtimes/UID/modes and its pending namespace unchanged. Main and prior accepted remote heads are unchanged.

Pure code identities recomputed from that clean implementation (not a selected-host packet or owner decision):

| Fixed code identity | SHA-256 |
| --- | --- |
| Disabled fixed-wrapper source artifact | `9e60bde2b22c64742b3d6d5d7ad7e176bbd176a14d8032ccae2bf9bf2c05389a` |
| Linux source closure | `c9134efbffe95409256395a1b4fb5c09c30813d4e2b7180dd3da29e221fe41d2` |
| Linux schema set | `09c3ec0d07374e3d8229647cd4b5f664f0609ab5c713a2f1efd15a06092c6626` |
| Distinct Linux policy | `b2d7ef188aa6c7ad04bca40e1e6b00971a62dcd33ab4530c3250576db228b281` |

Host-specific prepared-root manifest/binary/worker-bundle hashes, hostname/machine-id, worker/operator UID/GID, private storage and protected-key identity remain **UNKNOWN / NOT SELECTED**. They were not filled with synthetic test values. Future selection must name its exact clean checkout SHA, including any later reviewed loader changes; the documentation-only delivery receipt changes no code hash. No operational Linux packet is ready for approval.

## Stage 16B.1 concrete pre-dispatch staging

This section supersedes the old candidate-only preparation state below, without changing the accepted fake ledger. The real-path release/run/observation have separate artifact identities and schema/policy hashes. Operator stage and read-only preview exist; no approve/execute command, owner authority, browser invocation or observation publisher is enabled. A bare approved boolean or parsed approval file is not authority. The private real wrapper always fails closed; synthetic approvals and fake terminal receipts belong only to offline tests.

One concrete **unapproved local pending intent** was staged exactly once from the clean implementation commit below. A fresh-process read-only preview returned byte-for-byte identical packet text and identical receipt/hash; release/ledger/receipt contents, filenames, modes and modification times were unchanged. Raw receipt and release hashes were independently verified. The private namespace contains only release.json, ledger.json and receipt.json: no approval, dispatch marker or result. The ledger is nonterminal **pending-approval**, all approval/dispatch/result hashes are null, and approvalReady is false.

The canonical receipt is **3,662 bytes** (16 KiB cap); full canonical packet **7,263 bytes** (24 KiB cap), pretty operator output **8,640 bytes**. The generated packet and ledger stay outside Git at `/Users/Om/Om Projects/.crossexam-stage16b1-ad7fc46/pending-review-packet.json` and `/Users/Om/Om Projects/.crossexam-stage16b1-ad7fc46/controlled-fixture-v1/stage16b1-local-ad7fc46-001/`. Directories are 0700; files 0600; owner UID 503. Retention is owner-explicit-removal-no-auto-delete-v1; no cleanup, cancellation or expiry transition was performed. This local macOS record is not portable Linux authority. No actual owner approval was created or requested.

| Pre-approval identity/value | Exact local candidate |
| --- | --- |
| Implementation commit | `ad7fc46fb391f41dc86a7fbf6b16f397b8bb33e9` |
| Intent ID | `stage16b1-local-ad7fc46-001` |
| Intent hash | `ee3c04950571a1d37c06d37bef3772730a0253d5758d6eb23061a0df0dfbf0e8` |
| Release ID | `FL-c1d3c429-9e05-4c30-a2d9-2cb3c8b6b1b8` |
| Release hash | `0a5452e1caff6a9d9ea82983182045f45879f18c5b560a39acf7ea22e4c14284` |
| Review receipt hash | `d7bcf2e8a27006cdfc18752d0d08cd54f20752981044e277d34438c6bdadecff` |
| Controlled run ID | `FR-ed85d2ae-51ec-4582-92b1-8cf368b1da37` |
| Controlled plan ID | `FP-45e8c48e-c226-4515-8c18-eb49fc6c433a` |
| Controlled plan hash | `222b541e5b5d15fe24e561dac8add71e693329e7b5234dafd42c23f2f81715f0` |
| Authorization ID (metadata only) | `FA-53a2d87e-17bb-40b1-9e35-9a5df6ca6e1c` |
| Authorization binding hash (not approval) | `e21191be5c1c01e0813dd078e7bde7e498a4e9fbcd5d59db3b6c015aa6fe7245` |
| Scan ID | `scan-owned-numeric-tribunal-v1` |
| Base owned input snapshot hash | `c418e840c4d0ea98cca6554fe008d41612423202e86e008c43e5088c1ee7c7ad` |
| Exact normalized parent report hash | `e62dde399074d86751b91fe31d3ff1ed64897a1b69d89eba0f3ae9df782ecd5c` |
| Parent Tribunal run ID | `TR-3cbfdd5f-7bba-4974-a6e7-ee88b1cd337e` |
| Matching Skeptic review ID | `SR-45c68526-9069-48ae-8853-389632639376` |
| Matching Skeptic review hash | `75bf8a130b7f290457e767fd0c89a5d2649896140d0c49bdf838f11fc1470cd1` |
| Source Stage 16A run ID | `RR-5798b496-bb7f-4660-bcc1-0969dd38b062` |
| Source run hash | `2d2b3ebfe08252f10afb2bd1a7b13e6696a0398c235045331f1a9ff4733ba007` |
| Source plan ID | `RP-3d936742-c9c3-43ad-9b55-f9838b609fc6` |
| Source plan hash | `7c721d5b492c36d2a69504376a35d20d6b66f420d91c9b86246f03cfd1628950` |
| Source request hash | `f09732b4fa7cc5b49e0f03faed284779506dcba38141ac297965042ae87b01eb` |
| Source operation policy hash | `23774967fad01807922d311c99674946802d4e5078a8214c18a90ed4894602f9` |
| Fake source provider / model | `owned-fixture-preflight-fake / deterministic-v1` |
| Linked claim ID | `C-faae39c3-5af1-4915-9ec7-4fe1aeed6991` |
| Linked reproduction-gap challenge ID | `CH-3c79df64-56da-416c-9500-f04da50cde63` |
| Parent authorized evidence IDs | `E-owned-status, E-owned-structure` |
| Selected lineage evidence IDs | `E-owned-status` |
| Fixture manifest hash | `f7cf62e2d5414c0a341e35f5da1cbe572821988cd67fc061d2e21fc733fd638f` |
| Fixture body SHA-256 / bytes | `5c6172ecdaf0408ad301e116bc5003d6ecbb84f44b93576a5a28d29e99841a3b / 61` |
| Real-path schemas hash | `116fc0cd11c8b56533df4616ba60808045aae232ebce673f9e2b4a6d3fa52ef9` |
| Real-path policy hash | `70de49638dc942a634a54301c46a55fc29fcbd4886e1da311f4e097501bea74a` |
| Required future proof-policy hash | `c90549ab0110add7cd32126abb98519fbc20a7e496541aa0d8f687b209dd846f` |
| Fixed runner/configuration hash | `6fcd049acde0a3e6ea668130d07b585d5fd0941f800d699f9ae428bd0feb786d` |
| Local storage directory hash | `d20ebb6a56ea150882e533523fd089a55d01223b6daaca9bdd3271a6c5497575` |
| Local hostname consistency hash | `483a8737b5859b390188095346628c872bbb0a256e4314ca611e89810fb5b3e2` |
| Local owner UID | `503` |
| Prepared Linux root manifest hash | `null — NOT VERIFIED` |
| Actual Linux Chromium binary hash | `null — NOT VERIFIED` |
| Intent createdAt | `2026-10-06T05:53:21.926Z` |
| Intent expiresAt | `2026-10-07T05:53:21.926Z` |

The fixed input is a pinned **hand-authored** owned numeric snapshot, not a measurement of the empty browser page. Fixed injected Explorer/Breaker/Skeptic/Reproducer fakes generate lineage context in the same process. The normalized parent report hash above includes those newly generated canonical claims/challenges; it is separate from the unchanged base-input hash. Source fake authorization/SIMULATED results are ignored. Controlled authorization ID/hash are binding metadata, not an owner decision or executable capability. No raw report, Stage 16A artifact or provider output is persisted. The operation remains lineage-only, claimTested=false and challengeResolved=false; it does not test or resolve the linked claim/challenge.

Future review of this exact existing candidate is read-only and requires the repository root:

```sh
pnpm reproducer:preflight preview --intent-id 'stage16b1-local-ad7fc46-001' --directory '/Users/Om/Om Projects/.crossexam-stage16b1-ad7fc46'
```

Do not repeat stage for this ID. Preview never approves, dispatches, terminalizes or rewrites it. There is no approve/execute CLI command. The manual real-dispatch boundary always throws REAL_RUNNER_DISABLED; a trusted owner-authority loader is not provisioned. Only opaque, differently identified synthetic approvals inside fake tests exercise the durable approval → marker → ledger dispatchHash → fake attempt order. No automatic push/CI/restart path invokes it.

Future retained fields are only schema/artifact identity, fixed fixture key, fixture/OBSERVED provenance, completed navigation outcome, status code, title presence, zero redirects, bounded duration/time and explicit complete/nontruncated metadata. A final real run requires matching private trusted-host execution attestation; shape validation is insufficient. No paths/URLs/HTML/headers/text/forms/selectors/screenshots/secrets/raw collection enter observations. Cancel/expiry/denial and offline fake outcomes are distinct terminal staging receipts with observation null, never real-path runs.

No-marker state remains pending-approval across restart and age. Expiry is 24 hours and terminalizes only on an explicit validated expiry action. No automatic deletion; retention is owner-explicit-removal-no-auto-delete-v1. Under a future verified manual authority, approval must be durable before the one-attempt marker, then matching ledger dispatchHash must be durable before any worker call. Offline tests exercise that order with synthetic opaque authority and fake execution only. Marker/no result becomes unknown, result-before-final-ledger reconciles exactly, terminal replay never redispatches. Same-host trusted-storage host dispatch at most once is the limit; there is no distributed/external at-most-once or physical power-loss claim.

Fixed configuration is reviewable: owned `http://entry.crossexam-fixture.com` origin and `/collector/empty-performance` path, GET document, 61-byte body/hash below, 10-second worker/45-second outer deadline, 1-second cleanup reserve, 64 requests/96 decisions, non-root user/group crossexam-worker, sealed `/var/lib/crossexam/root`, Playwright 1.63.0/Chromium 153.0.8010.12/revision 1243. The exact executable and AppArmor attachment are `/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`; profile `crossexam-chromium-userns`, userns restriction 1. Required future proofs include Chromium sandbox/renderer seccomp, private network, enforcing `/run/crossexam/proxy.sock` with pinned DNS/no DIRECT, NoNewPrivileges/empty host capabilities, 1 GiB memory/no swap, 128 PIDs/100% CPU and existing cleanup/zero-sentinel receipts. Browser methods remain GET/HEAD; no WebSocket/QUIC/service-worker/download allowance. Source hashes in the private packet pin the existing collector/worker/backend/root/AppArmor/sandbox/proxy/pinned-transport/preparation/dependency files. These are required configuration/proof policy, not newly measured runtime facts. No browser or proxy code has changed.

**Not approval-ready:** prepared Linux root-manifest and actual Chromium binary hashes are unknown here. The disabled runner and unprovisioned trusted owner-authority loader are additional blockers. No actual execution attestation is invented in a pending release. Local pending storage is bound to its absolute namespace/path, UID and hostname hash; copying it to a different Linux host/UID cannot supply authority. The hostname hash is only a consistency check, not cryptographic machine attestation; host/OS-account storage integrity is trusted. The intended trusted Linux host must have exact verified artifact/storage identities and a coherent reviewed policy/authority mechanism before a new exact pending intent can be presented for approval. Do not ask the owner to approve this blocked packet.

Post-execution-only values are dispatch/start/finish/capture timestamps, measured duration/status/title presence, complete observation hash, sandbox/proxy/cgroup/cleanup/sentinel security receipts and actual execution attestation. No such value exists now. One next task is offline resolution of the pre-approval Linux artifact/storage and owner-authority blockers; then restage/review the exact packet before any owner approval, first gated Linux fixture run and full acceptance review.

Delivery verification: the implementation SHA in the table was pushed only to `feature/stage16b1-fixture-preflight`. [Ordinary offline Node run 37420818616](https://github.com/OMIZOOMI/Cross-Exam/actions/runs/37420818616) **attempt 1 PASS** on that exact SHA; every job step including frozen install, focused/regression/full units and build passed. No retry, fixture/browser/Linux/provider execution or owner approval. Local results: 164 focused, 212 controlled, 491 combined agent-contract, 167 provider/ledger/operator and 1,664 full units; lint/typecheck/build/diff check PASS. Counts are the recorded local results; CI step conclusions and implementation SHA were independently checked. The resumed delivery reused prior validation without repeating the full suite or staging. GitHub's branch inventory showed only the Tribunal/Node workflow; prior local/remote milestones remain unchanged. Final documentation receipt is `[skip ci]`, with executable code and this local candidate's bindings unchanged.

## Historical Stage 16B offline candidate packet

No real fixture/browser operation, credential, provider call, paid release or controlled real release has been created or executed. This packet is **not approval**. Offline fake completion proves no observed navigation, reproduction, challenge resolution, deployment readiness or public admission. CrossExam remains free for all users; Stage 14C paid acceptance remains owner-deferred.

## Fixed candidate fixture manifest

Private authority is defined in `packages/controlled-reproducer/src/fixture-manifest.ts`, independently of the test-only collector table. There is no real-operation function, browser wrapper or generic selector. The existing owned response bytes are compared as source text in offline tests without invoking the fixture.

The descriptor's fields, in canonical serialization order, are:

| Field | Exact value |
| --- | --- |
| schemaVersion | 1 |
| fixtureKey | browser-empty-navigation-v1 |
| operationId | controlled-fixture-empty-navigation-v1 |
| method | GET |
| path | /collector/empty-performance |
| statusCode | 200 |
| contentType | text/html |
| bodySha256 | 5c6172ecdaf0408ad301e116bc5003d6ecbb84f44b93576a5a28d29e99841a3b |
| bodyBytes | 61 |
| titlePresent | true |
| redirects | 0 |
| subresources | 0 |
| workerTimeoutMs | 10000 |
| isolation | accepted-systemd-proxy-root-apparmor-chromium-v1 |

Manifest SHA-256 of `JSON.stringify(descriptor)`: **f7cf62e2d5414c0a341e35f5da1cbe572821988cd67fc061d2e21fc733fd638f**. Offline policy SHA-256: **c6b83a382af09d5150e61fe41d7471d9bbc5cba10350718ca09be17d8710e19c**. The latter binds original-object promotion, reproduction-gap, lineage-only, injected-fake-only/no-observation execution, authorization binding semantics, one attempt/zero retries and the five-second fake deadline. It does **not** authorize real execution; a future real policy/admission contract needs separate review.

## Intended parent and authorization

The owner must select an exact eligible report/optional matching Skeptic review and original frozen Stage 16A run in the same process. Planning must complete with exactly one accepted plan, an accepted Explorer claim, a same-claim accepted Breaker or Skeptic reproduction-gap challenge and one to six available parent-authorized OBSERVED/DERIVED evidence references. Clone/JSON/reconstructed/restarted promotion is prohibited. Fixture source metadata alone does not prove ownership.

`binding.parent.snapshotHash` is the exact normalized report-only hash. Optional admitted review ID/hash are a separate matching pair or null/null. Source run/plan/request/policy/provider/model identities are checked through Stage 16A's existing replay registry. New host-generated controlled run/plan/authorization IDs are distinct from source identities. Canonical controlled-plan hash and explicit intent hash join the source-run/report/review/manifest/policy hashes in the authorization binding; the full release hash binds the complete reservation. Source fake authorization or SIMULATED result never becomes controlled authority or evidence.

Claim/challenge/evidence IDs provide lineage only and select no URL, path, method, parameter or timeout. Every result remains `relation: "lineage-only"`, `claimTested: false`, `challengeResolved: false`.

## Retained future observation fields

A future fully validated real operation may retain only schemaVersion, fixed fixtureKey, source fixture, provenance OBSERVED, completed navigation outcome, HTTP status code, title-present boolean (never title text), redirectCount zero, durationMs from 0 through 10000, capturedAt timestamp, and completeness complete=true/truncated=false. Failed/inconclusive/aborted/timeout/outcome-unknown/not-dispatched or incomplete/raw output has no observed projection. Parsing this future shape alone is not attestation.

The current offline run schema requires observation null, even on completed; fake acknowledgement is explicitly SIMULATED/test-only. It cannot publish a future observation. A later real execution/publication schema must be reviewed separately. No URLs/paths, headers, bodies, HTML/DOM, text, form values, selectors, secrets, errors/stacks, screenshots, traces or raw collection may enter the projection. No record is appended to ScanReport evidence/experiments.

## One-attempt storage and recovery policy

An explicit host-supplied private directory, separate from Stage 14C, stores only bounded offline reservations/receipts today. It has no default production location. Owner/account checks, 0700 directories, 0600 single-link no-follow regular files, exclusive locks, file fsync/atomic rename/directory fsync and a maximum of 16 run directories are enforced. Release/result ceilings are 8/12 KiB; marker/ledger/fake envelope are 1 KiB each. Injected fake acceptance is five seconds, with no retries or deadline increase for Chromium/cgroups.

| Durable state | Recovery action |
| --- | --- |
| No/incomplete/corrupt reservation | Fail closed; no recovered authority |
| Reservation, no marker | Finalize not-dispatched; never retry in place |
| Marker, no valid terminal receipt | Finalize outcome-unknown; never redispatch |
| Matching receipt before final ledger | Reconcile exact identities/hashes, with marker consistency |
| Matching final receipt | Return immutable replay, no executor call |
| Mismatch/corruption | Fail closed; do not repair into new execution authority |

Marker and dispatch ledger must be durable before any fake attempt. Cancellation/failure after consumption conservatively produces outcome-unknown. A new attempt requires a new explicit intent and fresh original-object admission/new authorization. Recovery never promotes or dispatches. Same-host owner-death reclaim requires ESRCH; age, wrong host, live/reused/ambiguous PID never permits reclaim.

The guarantee is **at most one trusted-host dispatch attempt under trusted same-host storage assumptions**. It is not distributed/external at-most-once, authenticated storage against the owning account, or power-loss proof on every filesystem. Fault tests inject interruptions around write/flush/publication boundaries; they do not perform physical power-loss or browser/process cleanup tests. An injected executor is trusted code; cancellation prevents late acceptance, not arbitrary continued work by an uncooperative function.

## Proposed later gated Linux evidence — not enabled

After owner approval and a separately reviewed fixed-operation integration, one manually approval-gated owned-fixture Linux run should reuse the accepted systemd/private-network/sealed-root/exact-AppArmor/Chromium-userns/renderer-seccomp/proxy/cgroup/lifecycle boundary. No automated branch trigger, public target, proxy widening, new capability or security relaxation is authorized here.

The later proof should verify the exact approved manifest and parent/release bindings, marker-before-single-dispatch, real main-document status/title-presence/no redirects, strict complete bounded projection, sandbox/renderer seccomp, AppArmor restriction still enabled, enforcing proxy/no DIRECT fallback, cgroup enforcement and cleanup, zero sentinels, privacy, failure/timeout/cancellation handling and recovery without redispatch. Do not increase existing worker deadlines: candidate 10 seconds lies within the current 1–30-second worker limits and existing 45-second outer service limit. Full results must be reviewed before accepting observed behavior.

## Values unresolved before a real release

- Owner-approved real release/intent ID, approval record, approved real policy/admission version and exact private storage location/retention policy; none exists yet.
- Actual parent report/scan/Tribunal IDs and report snapshot hash, optional admitted Skeptic ID/hash (or explicit absence), original source-run/plan/request/policy hashes and provider/model identity, claim/challenge/evidence IDs, and new controlled run/plan/authorization identities.
- Selected accepted Linux runtime artifact/RootDirectory manifest, deployment/runner identity and gating configuration; no new prepared root or CI run was made.
- Actual dispatch/result timestamps, duration, navigation status, title presence, sandbox/proxy/cleanup/sentinel results and observed projection hash; these cannot be invented offline.

**One next task:** owner review/approval of the exact fixture manifest/release, parent context, retained fields and one-attempt policy. Then separately implement and authorize the first gated Linux fixture run, review its full results, and only then accept observed Stage 16B if every gate passes. No executable real-run command exists in this stage, and no real run is authorized by this packet.
