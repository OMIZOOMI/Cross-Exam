# Stage 14C controlled provider boundary

This implementation is tested **offline only**. It does not establish paid-provider acceptance, deployment readiness, or public admission. No credential was accessed and no real API call was made. The owned numeric fixture is hand-authored test input, not a newly collected live website or a model acceptance result.

## Verified API and dependency

Official documentation checked on 2026-10-05: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) supports `none` effort; [reasoning modes](https://developers.openai.com/api/docs/guides/reasoning) distinguish standard/pro mode from effort; [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) requires every property and `additionalProperties:false`, with nullable unions for optional values. The installed official TypeScript SDK **openai 7.28.0**, Apache-2.0, includes these request types. The exact package and integrity are locked; its existing optional Zod peer is the same pinned workspace version. No wrapper framework is added.

The sole profile is `openai-responses-luna-none-v1`, provider `openai-responses`, model `gpt-6-luna`, endpoint `https://api.openai.com/v1/responses`. SDK retries are zero and logging is off. Reasoning `{effort:"none",mode:"standard"}`, service tier default, store/stream false and truncation disabled are fixed. Explorer/Breaker request 768/1024 **total generated** tokens, including non-visible tokens; these are caps, not quotas or billing guarantees. No tools, conversation/history, metadata, user identifiers, summaries, sampling overrides, or alternative endpoint/model are supplied. Redirect following is disabled and the transport verifies the exact fixed endpoint, method and prepared body.

## Modules and authority

- `packages/agents`: provider-neutral explicit external serializer, prepared-call identity, host-only pre-dispatch authorization and finalized checkpoint hook. Existing strict proposal validation, reference authorization, deduplication, canonical IDs, timestamps, INFERRED attribution and immutable report-v2 overlay remain authoritative.
- `packages/provider-openai`: SDK/wire schemas/bounded transport and stable error mapping. It prepares the exact non-secret JSON body and SHA-256 before dispatch. A one-use in-memory authorization bound to that hash is required; ordinary adapter/session invocation without the durable admission host cannot call the SDK. This is a trusted-host capability, not protection against arbitrary malicious JavaScript running as the host user.
- `packages/controlled-provider`: explicit release admission, owned numeric fixture, private durable reservation/checkpoints/results, and provider-free recovery. It has no SDK dependency in production modules. Test-only child processes use fake transport.
- `packages/contracts`: optional profile/reasoning/receipt/reasoning-token audit extensions preserve old fake reports; strict canonical role checkpoint v1. ScanReport remains **v2**, TribunalRun and proposals remain **v1**. No weakening of canonical fields or migration is needed.

No web/scanner/worker/public-launcher import connects this path to user submissions. The existing live-only web report store is unchanged. No browser/proxy/SSRF/AppArmor/cgroup/isolation source changes or new Linux acceptance run are required.

## External projection and response safety

Never serialize an internal report, role view, digest or generic Evidence.data. Select external keys and code-specific scalar facts explicitly. Fixed host labels replace internal labels; fixed limitations replace any supplied strings. Omit scan identity/source/target/timestamps and all website strings, headers, content, credentials, network addresses and paths. Opaque document ordinal/protocol associates observations without revealing a hostname/path. Breaker receives only accepted Explorer claim ID, statement, scope, falsifier, references and INFERRED provenance; host identity/status/time fields are excluded. These model strings remain untrusted JSON data under fixed instructions, with no tools or callbacks. The Stage 14B conservative output-text guard still applies; it is not universal DLP.

Provider-wire v1 is separate from the host Zod proposals. Every object is strict and all fields are required. Breaker requires `missingEvidence:string|null`; only null-to-absence normalization is allowed before original host semantic validation. Incomplete status is rejected before examining partial proposal text, even if parseable; refusal/manual filtering/empty output are not zero-claim success. Reasoning and encrypted items are discarded. No repair or retry.

Limits: complete request 160 KiB; controlled acceptance request **16 KiB**; decoded successful HTTP body 128 KiB; HTTP error body 8 KiB before parsing; proposal text 24 KiB before parsing. Stream reads enforce bytes independently of Content-Length. Error classification only uses bounded `error.code`/`error.type`, never message. Only host enums, status, validated request ID and integer Retry-After up to 3600 seconds can remain. [Official error codes](https://developers.openai.com/api/docs/guides/error-codes) and [spend limits](https://developers.openai.com/api/docs/guides/spend-limits) support the quota/rate mappings; specific quota codes precede generic rate types. No category retries.

The host retains 20-second role / 45-second tribunal acceptance deadlines. Adapter timeout is 18 seconds, including bounded body reads. Caller abort and late output cannot authorize state. Persistence does not reset these timers; delayed Explorer checkpointing can exhaust Breaker's available time. Filesystem operations are awaited for durability, not forcibly terminated: a stuck local disk can delay return, but cannot grant extra model acceptance time or restart a dispatch. Local abort cannot guarantee cancellation of remote computation or billing. Usage is provider-reported or null; optional reasoning counts must be nonnegative, bounded and no greater than known output usage.

## Release and durable order

Trusted bootstrap must explicitly supply a release ID. `stage14c-controlled-fixture-v1` binds `owned-numeric-tribunal-v1`, the exact validated fixture snapshot hash, report/proposal/export versions and fixed execution profile. Live reports, altered fixtures, empty catalogs, existing overlays, unknown keys/profiles and endpoint/model overrides are rejected before admission. No automatic release ID generation is permitted.

An operator-only `pnpm provider:acceptance preview` / `execute --release-id <explicit ID>` entrypoint now exists outside all application routes. Preview calls only pure fixture/wire preparation: no credential lookup, network, release or result-storage write. It displays the exact Explorer body/hash/UTF-8 bytes under 16 KiB and the conditional Breaker export policy without invented claims. Execute requires `CROSSEXAM_OPENAI_API_KEY` from trusted runtime bootstrap and delegates to the unchanged controlled host API; it accepts no report/target/model/endpoint/credential-file override. Only bounded host receipt metadata is printed, with stable sanitized errors, no raw envelopes/model text/reasoning/key. SIGINT/SIGTERM forwards cancellation through the existing lifecycle. Repeated releases invoke existing provider-free recovery. **Execute was not run against a real provider; no actual credential was read or billed release created.** See the [owner acceptance packet](STAGE14C_ACCEPTANCE.md) for the exact preview, later placeholder command, official pricing estimate and approval prerequisites. CrossExam remains free for users; no user billing or paywall is introduced.

`.crossexam/provider-runs/` is private local recovery storage, not a public endpoint. Directories 0700 and files 0600 on the tested POSIX platforms; non-private/symlink/nonregular/wrong-owner artifacts fail closed. Input/final report <=4 MiB each; finalized role checkpoint <=64 KiB; ledger <=16 KiB. Capacity is 20 admitted directories, with no expiry/pruning that would reopen consumed releases.

Exclusive global admission controls capacity, then an exclusive run owner spans dispatch through completion. Locks contain bounded local PID/host hash/nonce. They are never stolen by age. Dead-owner recovery requires same-host identity plus kernel `ESRCH`; a living/reused PID, EPERM, foreign host or malformed lock remains blocked. A separate exclusive reclamation file serializes dead-owner recovery. Corrupt locks or a crash during reclamation can require explicit operator maintenance; never delete locks merely to retry a paid run. This is a same-host local filesystem/PID model, not a distributed lease or hostile same-user containment system.

For each release/role there is one slot regardless of request hash or newly allocated canonical ID:

1. Reserve exclusively and durably publish validated input/bindings.
2. Immediately before SDK invocation, atomically publish and flush a consumed-slot marker with the exact outbound hash; only then issue its one-use dispatch authorization. Failure prevents invocation.
3. Dispatch once, validate/canonicalize within the existing deadlines, then durably checkpoint actual accepted records and finalized audit.
4. Breaker requires the durable Explorer checkpoint. The provider receives no persistence/mutation callback.
5. Validate and durably publish the final report, then ledger result identity, then completion. Return a stored result hash only after completion.

Same-directory unique temporary files, file fsync, rename publication and directory fsync are used. Failure is reported rather than silently ignored. Raw responses/proposals/envelopes, error bodies, reasoning, transcripts and keys are never written. Checkpoint/final hashes and schemas validate integrity and original canonical identities; hashes do not defend against malicious rewriting by the OS account owning the store.

## Recovery: zero provider calls

Recovery has no adapter argument and cannot dispatch. Repeated run commands for an existing release perform only recovery:

- No consumed marker: not-dispatched; do not silently start that release.
- Consumed marker without checkpoint: outcome-unknown, no replay; an existing Explorer checkpoint can still be returned.
- Explorer checkpoint only: interrupted receipt with actual Explorer records/audit; no invented Breaker record.
- Both checkpoints: reconstruct and validate the report locally with original IDs/times/usage/audits, then publish.
- Valid final result before completion marker: reconcile locally and return that same result.
- Completed: return original canonical result/hash.
- Missing expected/corrupt artifacts: fail closed.

Checkpoint publication can precede its ledger hash; recovery reconciles only a schema/identity/hash-consistent artifact. Outcome unknown is represented by the durable consumed marker with no finalized checkpoint, not a fabricated audit. At-most-once **host dispatch** does not attest exactly-once remote execution or recover a response lost before checkpointing. Changing request hashes, clock age, canonical IDs or process restart cannot reopen a slot.

## Separate paid acceptance prerequisites

Owner approval is still required for the exact fixture snapshot/release ID, the API project, permitted data export/retention policy and spending allowance. Trusted bootstrap/credential provisioning must be approved separately; no credential lookup or API call was performed here. Project access to the exact model/profile, real provider response behavior, billing, and actual paid end-to-end acceptance remain **unverified**. Review storage location/ownership/durability and existing consumed releases before that single controlled acceptance. No public provider/browser admission, later tribunal roles, experiments, verdicts or deployment follows from offline success.
