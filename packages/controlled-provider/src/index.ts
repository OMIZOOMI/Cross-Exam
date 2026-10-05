import path from "node:path";
import {
  createTribunalSession,
  type ProviderConfiguration,
  type RoleCheckpoint,
  RoleCheckpointSchema,
  reportFromCheckpoints,
} from "@crossexam/agents";
import { type ScanReport, ScanReportSchema } from "@crossexam/contracts";
import { authorizeDispatch, BoundaryError, hash, immutable } from "../../agents/src/provider";
import { type ControlledRelease, PROFILE, RUN_LIMITS, validateAdmission } from "./release";
import { type Ledger, RunStore, StoreError } from "./storage";

export type { ControlledRelease } from "./release";
export { createControlledRelease, ownedNumericFixture } from "./release";
export type RecoveryReceipt = Readonly<{
  releaseId: string;
  status: "not-dispatched" | "outcome-unknown" | "interrupted" | "completed";
  explorer?: RoleCheckpoint;
  breaker?: RoleCheckpoint;
  report?: ScanReport;
  resultHash?: string;
}>;
type Options = { directory?: string; signal?: AbortSignal };
const defaultDirectory = () => path.join(process.cwd(), ".crossexam", "provider-runs");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function checkpointValid(
  cp: RoleCheckpoint,
  role: "Explorer" | "Breaker",
  report: ScanReport,
  ledger: Ledger,
) {
  const a = cp.audit;
  const records = role === "Explorer" ? cp.claims : cp.challenges;
  const authorized = new Set(cp.authorizedEvidenceIds);
  if (
    a.role !== role ||
    a.scanId !== report.summary.id ||
    cp.scanId !== report.summary.id ||
    a.provider !== "openai-responses" ||
    a.model !== "gpt-6-luna" ||
    a.executionProfile !== PROFILE ||
    !same(a.reasoning, { effort: "none", mode: "standard" }) ||
    (a.calls === 1 && a.requestHash !== ledger.roles[role].dispatchHash) ||
    (a.calls === 0 && ledger.roles[role].dispatchHash !== null) ||
    (a.calls === 0 && records.length) ||
    a.acceptedIds.length !== records.length ||
    a.acceptedIds.some((id) => !records.some((r) => r.id === id)) ||
    (role === "Explorer" && cp.challenges.length) ||
    records.some(
      (r) =>
        r.scanId !== cp.scanId ||
        r.provenance !== "INFERRED" ||
        r.evidenceIds.some((id) => !authorized.has(id)),
    ) ||
    cp.authorizedEvidenceIds.some(
      (id) =>
        !report.evidence.some((e) => e.id === id && ["OBSERVED", "DERIVED"].includes(e.provenance)),
    )
  )
    throw new StoreError("STORE_CORRUPT");
  if (!["completed", "partial-rejection"].includes(a.status) && records.length)
    throw new StoreError("STORE_CORRUPT");
}

async function recoverLocked(
  store: RunStore,
  dir: string,
  release: ControlledRelease,
): Promise<RecoveryReceipt> {
  const ledger = await store.ledger(dir);
  if (!same(ledger.release, release) || ledger.inputHash !== release.snapshotHash)
    throw new StoreError("STORE_CORRUPT");
  const rawInput = await store.read(dir, "input.json", RUN_LIMITS.inputBytes);
  if (hash(rawInput as string) !== ledger.inputHash) throw new StoreError("STORE_CORRUPT");
  const { report } = validateAdmission(JSON.parse(rawInput as string), release);
  const checkpoints: Partial<Record<"Explorer" | "Breaker", RoleCheckpoint>> = {};
  for (const role of ["Explorer", "Breaker"] as const) {
    const raw = await store.read(dir, `${role}.json`, RUN_LIMITS.checkpointBytes, true);
    if (raw === null) {
      if (ledger.roles[role].checkpointHash) throw new StoreError("STORE_CORRUPT");
      continue;
    }
    const cp = RoleCheckpointSchema.parse(JSON.parse(raw));
    checkpointValid(cp, role, report, ledger);
    const digest = hash(raw);
    if (ledger.roles[role].checkpointHash && ledger.roles[role].checkpointHash !== digest)
      throw new StoreError("STORE_CORRUPT");
    // Atomic checkpoint publication may precede its ledger hash. Reconcile locally only.
    ledger.roles[role].checkpointHash = digest;
    checkpoints[role] = cp;
  }
  const e = checkpoints.Explorer;
  const b = checkpoints.Breaker;
  if (b && !e) throw new StoreError("STORE_CORRUPT");
  const rawFinal = await store.read(dir, "result.json", RUN_LIMITS.resultBytes, true);
  if (rawFinal !== null) {
    if (!e || !b) throw new StoreError("STORE_CORRUPT");
    const result = ScanReportSchema.parse(JSON.parse(rawFinal));
    const expected = reportFromCheckpoints(report, e, b);
    const digest = hash(rawFinal);
    if (!same(result, expected) || (ledger.resultHash && ledger.resultHash !== digest))
      throw new StoreError("STORE_CORRUPT");
    ledger.resultHash = digest;
    ledger.complete = true;
    await store.saveLedger(dir, ledger);
    return immutable({
      releaseId: release.releaseId,
      status: "completed",
      report: result,
      resultHash: digest,
    });
  }
  if (ledger.complete || ledger.resultHash) throw new StoreError("STORE_CORRUPT");
  if (e && b) {
    const result = reportFromCheckpoints(report, e, b);
    await store.publish(dir, "result.json", result, RUN_LIMITS.resultBytes);
    ledger.resultHash = hash(JSON.stringify(result));
    ledger.complete = true;
    await store.saveLedger(dir, ledger);
    return immutable({
      releaseId: release.releaseId,
      status: "completed",
      report: result,
      resultHash: ledger.resultHash,
    });
  }
  await store.saveLedger(dir, ledger);
  const unknown = (["Explorer", "Breaker"] as const).some(
    (role) => ledger.roles[role].dispatchHash && !checkpoints[role],
  );
  if (unknown)
    return immutable({
      releaseId: release.releaseId,
      status: "outcome-unknown",
      ...(e ? { explorer: e } : {}),
    });
  if (e) return immutable({ releaseId: release.releaseId, status: "interrupted", explorer: e });
  return immutable({ releaseId: release.releaseId, status: "not-dispatched" });
}

/** Owned fixture host entry only; not imported by web/scanner/public launcher. */
export async function runControlledProvider(
  input: unknown,
  releaseInput: unknown,
  config: ProviderConfiguration,
  options: Options = {},
): Promise<RecoveryReceipt> {
  return runWithStore(
    input,
    releaseInput,
    config,
    new RunStore(options.directory ?? defaultDirectory()),
    options.signal,
  );
}
/** Separate recovery entry has no adapter parameter and cannot make provider calls. */
export async function recoverControlledProvider(
  input: unknown,
  releaseInput: unknown,
  options: Pick<Options, "directory"> = {},
): Promise<RecoveryReceipt> {
  const { report, release } = validateAdmission(input, releaseInput);
  const store = new RunStore(options.directory ?? defaultDirectory());
  const owned = await store.openRun(release, report);
  try {
    return await recoverLocked(store, owned.dir, release);
  } catch {
    throw new StoreError("STORE_CORRUPT");
  } finally {
    await owned.unlock();
  }
}

/** Internal fault injection exercises actual durable filesystem operations, never exposed to a provider. */
export async function runWithStore(
  input: unknown,
  releaseInput: unknown,
  config: ProviderConfiguration,
  store: RunStore,
  signal?: AbortSignal,
): Promise<RecoveryReceipt> {
  const { report, release } = validateAdmission(input, releaseInput);
  if (
    config.provider !== "openai-responses" ||
    config.model !== "gpt-6-luna" ||
    config.executionProfile !== PROFILE ||
    !same(config.reasoning, { effort: "none", mode: "standard" }) ||
    !config.adapter?.prepare ||
    Object.keys(config).some(
      (k) => !["provider", "model", "adapter", "executionProfile", "reasoning"].includes(k),
    )
  )
    throw new Error("PROVIDER_CONFIGURATION_DENIED");
  const owned = await store.openRun(release, report);
  try {
    if (!owned.created) return await recoverLocked(store, owned.dir, release);
    const wrapped: ProviderConfiguration = {
      ...config,
      adapter: {
        run: config.adapter.run.bind(config.adapter),
        prepare(request) {
          const prepared = config.adapter?.prepare?.(request);
          if (
            !prepared ||
            !Number.isSafeInteger(prepared.requestBytes) ||
            prepared.requestBytes > RUN_LIMITS.outboundBytes ||
            !/^[a-f0-9]{64}$/.test(prepared.requestHash) ||
            prepared.requestBytes <= 0
          )
            throw new BoundaryError("RESPONSE_LIMIT");
          return prepared;
        },
      },
    };
    const result = await createTribunalSession(
      report,
      { Explorer: wrapped, Breaker: wrapped },
      {
        async beforeDispatch(role, requestHash) {
          const ledger = await store.ledger(owned.dir);
          if (ledger.roles[role].dispatchHash) throw new StoreError("SLOT_CONSUMED");
          if (role === "Breaker" && !ledger.roles.Explorer.checkpointHash)
            throw new StoreError("STORE_CORRUPT");
          ledger.roles[role].dispatchHash = requestHash;
          await store.saveLedger(owned.dir, ledger);
          await store.point(`${role}:dispatch-consumed`);
          return authorizeDispatch(requestHash);
        },
        async checkpoint(value) {
          const cp = RoleCheckpointSchema.parse(value);
          const ledger = await store.ledger(owned.dir);
          const role = cp.audit.role;
          checkpointValid(cp, role, report, ledger);
          if (ledger.roles[role].checkpointHash) throw new StoreError("STORE_CORRUPT");
          await store.publish(owned.dir, `${role}.json`, cp, RUN_LIMITS.checkpointBytes);
          ledger.roles[role].checkpointHash = hash(JSON.stringify(cp));
          await store.saveLedger(owned.dir, ledger);
          await store.point(`${role}:checkpoint-durable`);
        },
      },
    ).run({ signal });
    // Recovery path also validates canonical replay before publishing; no raw output is stored.
    await store.point("before-final-publication");
    const validated = ScanReportSchema.parse(result);
    await store.publish(owned.dir, "result.json", validated, RUN_LIMITS.resultBytes);
    const ledger = await store.ledger(owned.dir);
    ledger.resultHash = hash(JSON.stringify(validated));
    await store.saveLedger(owned.dir, ledger);
    await store.point("result-durable");
    ledger.complete = true;
    await store.saveLedger(owned.dir, ledger);
    await store.point("completed");
    return immutable({
      releaseId: release.releaseId,
      status: "completed",
      report: validated,
      resultHash: ledger.resultHash,
    });
  } catch {
    throw new StoreError("STORE_IO");
  } finally {
    await owned.unlock();
  }
}
