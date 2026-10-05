import { randomUUID } from "node:crypto";
import {
  type AgentRunAudit,
  BreakerProposalSchema,
  type Challenge,
  type Claim,
  ExplorerProposalSchema,
  TRIBUNAL_LIMITS as L,
  ProviderReceiptSchema,
  ProviderRequestSchema,
  type RoleView,
  type ScanReport,
  ScanReportSchema,
  TRIBUNAL_INSTRUCTIONS,
  TribunalIdSchema,
  tribunalWireSchemas,
} from "@crossexam/contracts";
import {
  HostPersistenceError,
  RoleCheckpointSchema,
  reportFromCheckpoints,
  type TribunalHostHooks,
} from "./checkpoint";
import { evidenceCatalog, roleView } from "./evidence-digest";
import { challengeKey, exportableText, normalize } from "./proposal-safety";
import {
  BoundaryError,
  type DispatchAuthorization,
  decodePayload,
  hash,
  immutable,
  type ProviderConfiguration,
  type ProviderRequest,
} from "./provider";

type Role = AgentRunAudit["role"];
type Code = AgentRunAudit["rejectionCodes"][number];
const wireSchemas = tribunalWireSchemas();
const schemaHashes = {
  request: hash(JSON.stringify(wireSchemas.request)),
  Explorer: hash(JSON.stringify(wireSchemas.Explorer)),
  Breaker: hash(JSON.stringify(wireSchemas.Breaker)),
};
const failureStatus = {
  "missing-configuration": "configuration-failure",
  unavailable: "provider-unavailable",
  "transport-error": "transport-failure",
  timeout: "timeout",
  abort: "aborted",
  "rate-limit": "rate-limited",
  quota: "quota-blocked",
  refusal: "provider-refusal",
  incomplete: "incomplete-output",
  limit: "limit-exceeded",
  "schema-error": "schema-failure",
  "usage-error": "limit-exceeded",
} as const;
const claimKey = (c: { statement: string; evidenceIds: string[] }) =>
  hash(JSON.stringify([normalize(c.statement), [...c.evidenceIds].sort()]));
function fields(value: unknown, allowed: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new BoundaryError("INVALID_PROVIDER_RESULT");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length)
    throw new BoundaryError("INVALID_PROVIDER_RESULT");
  if (Object.keys(descriptors).some((key) => !allowed.includes(key)))
    throw new BoundaryError("INVALID_PROVIDER_RESULT");
  const result: Record<string, unknown> = {};
  for (const [key, d] of Object.entries(descriptors)) {
    if (!("value" in d) || !d.enumerable) throw new BoundaryError("INVALID_PROVIDER_RESULT");
    result[key] = d.value;
  }
  return result;
}
function usage(value: unknown, cap: number): AgentRunAudit["usage"] {
  if (value === undefined) return { inputTokens: null, outputTokens: null };
  const v = fields(value, ["inputTokens", "outputTokens", "reasoningTokens"]);
  const valid = (n: unknown, max: number) =>
    n === null || (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max);
  if (!valid(v.inputTokens, 32768) || !valid(v.outputTokens, cap)) throw new Error("USAGE_LIMIT");
  if (
    v.reasoningTokens !== undefined &&
    (!valid(v.reasoningTokens, cap) ||
      (typeof v.reasoningTokens === "number" &&
        typeof v.outputTokens === "number" &&
        v.reasoningTokens > v.outputTokens))
  )
    throw new Error("USAGE_LIMIT");
  return v as AgentRunAudit["usage"];
}
function proposalCount(value: unknown, role: Role) {
  if (value && typeof value === "object") {
    const candidates = (value as Record<string, unknown>)[
      role === "Explorer" ? "claims" : "challenges"
    ];
    if (Array.isArray(candidates)) return Math.min(candidates.length, L.responseBytes);
  }
  return null;
}

/** The snapshot and one-run overlay are host owned. Replays never call providers again. */
export function createTribunalSession(
  input: unknown,
  providers: Readonly<Record<Role, ProviderConfiguration>>,
  hooks?: TribunalHostHooks,
) {
  const snapshot = immutable(ScanReportSchema.parse(input));
  TribunalIdSchema.parse(snapshot.summary.id);
  const configuration = {
    Explorer: { ...providers.Explorer },
    Breaker: { ...providers.Breaker },
  };
  for (const config of Object.values(configuration)) {
    TribunalIdSchema.parse(config.provider);
    TribunalIdSchema.parse(config.model);
    Object.freeze(config);
  }
  let once: Promise<ScanReport> | undefined;
  const execute = async (signal?: AbortSignal): Promise<ScanReport> => {
    if (snapshot.tribunalRuns.length) return snapshot;
    const start = performance.now();
    const startedAt = new Date().toISOString();
    const scanId = snapshot.summary.id;
    const catalog = evidenceCatalog(snapshot);
    const authorized = new Set(catalog.evidence.map((e) => e.id));
    const occupied = new Set(
      [
        ...snapshot.pages,
        ...snapshot.metrics,
        ...snapshot.evidence,
        ...snapshot.claims,
        ...snapshot.challenges,
        ...snapshot.experiments,
        ...snapshot.verdicts,
        ...snapshot.findings,
        ...snapshot.agentRuns,
      ].map((r) => r.id),
    );
    const id = (prefix: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const value = `${prefix}-${randomUUID()}`;
        if (!occupied.has(value)) {
          occupied.add(value);
          return value;
        }
      }
      throw new Error("Host identity allocation failed");
    };
    const runId = id("TR");
    const claims: Claim[] = [];
    const challenges: Challenge[] = [];
    const claimKeys = new Set(snapshot.claims.map(claimKey));
    const challengeKeys = new Set<string>();
    async function runRole(role: Role): Promise<AgentRunAudit> {
      const roleStart = performance.now();
      const audit: AgentRunAudit = {
        id: id("AR"),
        scanId,
        role,
        provider: configuration[role].provider,
        model: configuration[role].model,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        elapsedMs: 0,
        requestSchemaVersion: 1,
        responseSchemaVersion: 1,
        requestSchemaHash: schemaHashes.request,
        responseSchemaHash: schemaHashes[role],
        requestHash: null,
        responseHash: null,
        status: "skipped",
        usage: { inputTokens: null, outputTokens: null },
        acceptedIds: [],
        rejectedCount: 0,
        rejectedCountKnown: true,
        rejectionCodes: [],
        calls: 0,
        outputTokenLimit: role === "Explorer" ? 768 : 1024,
        timeoutMs: 20000,
        semanticRetries: 0,
      };
      if (configuration[role].executionProfile)
        audit.executionProfile = configuration[role].executionProfile;
      if (configuration[role].reasoning) audit.reasoning = { ...configuration[role].reasoning };
      const reject = (code: Code, n = 1) => {
        audit.rejectedCount = Math.min(L.responseBytes, audit.rejectedCount + n);
        if (!audit.rejectionCodes.includes(code)) audit.rejectionCodes.push(code);
      };
      try {
        if (signal?.aborted) {
          audit.status = "aborted";
          reject("CANCELLED", 0);
          return audit;
        }
        if (performance.now() - start >= L.totalMs) {
          audit.status = "timeout";
          reject("DEADLINE", 0);
          return audit;
        }
        if (!authorized.size || (role === "Breaker" && !claims.length)) {
          reject(role === "Explorer" ? "NO_EVIDENCE" : "NO_CLAIMS", 0);
          return audit;
        }
        const view: RoleView = roleView(snapshot, role, catalog, claims);
        const request: ProviderRequest = immutable(
          ProviderRequestSchema.parse({
            schemaVersion: 1,
            role,
            instructions: TRIBUNAL_INSTRUCTIONS,
            view,
            maxOutputTokens: audit.outputTokenLimit,
            timeoutMs: 20000,
            semanticRetries: 0,
          }),
        );
        const serialized = JSON.stringify(request);
        if (Buffer.byteLength(serialized) > L.viewBytes) {
          audit.status = "limit-exceeded";
          reject("RESPONSE_LIMIT", 0);
          return audit;
        }
        audit.requestHash = hash(serialized);
        const adapter = configuration[role].adapter;
        if (!adapter) {
          audit.status = "configuration-failure";
          reject("PROVIDER_FAILURE", 0);
          return audit;
        }
        if (configuration[role].executionProfile) audit.requestHash = null;
        const prepared = adapter.prepare?.(request);
        if (prepared) {
          audit.requestHash = prepared.requestHash;
          audit.requestSchemaHash = prepared.requestSchemaHash;
          audit.responseSchemaHash = prepared.responseSchemaHash;
        }
        let authorization: DispatchAuthorization | undefined;
        if (hooks) {
          // Await storage ownership before starting dispatch; never leave a late writer after timeout.
          try {
            authorization =
              (await hooks.beforeDispatch(role, audit.requestHash as string)) || undefined;
          } catch {
            throw new HostPersistenceError();
          }
          if (
            signal?.aborted ||
            performance.now() - roleStart >= L.roleMs ||
            performance.now() - start >= L.totalMs
          )
            throw new HostPersistenceError();
        }
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let aborted: (() => void) | undefined;
        const remaining = Math.min(
          L.roleMs - (performance.now() - roleStart),
          L.totalMs - (performance.now() - start),
        );
        if (remaining <= 0) {
          audit.status = "timeout";
          reject("DEADLINE", 0);
          return audit;
        }
        const stop = new Promise<unknown>((resolve) => {
          aborted = () => {
            controller.abort();
            resolve({ kind: "failure", category: "abort" });
          };
          signal?.addEventListener("abort", aborted, { once: true });
          timer = setTimeout(
            () => {
              controller.abort();
              resolve({ kind: "failure", category: "timeout" });
            },
            Math.max(0, remaining),
          );
        });
        let untrusted: unknown;
        try {
          untrusted = await Promise.race([
            Promise.resolve().then(async () => {
              if (controller.signal.aborted || signal?.aborted)
                return { kind: "failure", category: "abort" };
              if (
                performance.now() - roleStart >= L.roleMs ||
                performance.now() - start >= L.totalMs
              )
                return { kind: "failure", category: "timeout" };
              audit.calls = 1;
              const options = Object.freeze({ signal: controller.signal, authorization });
              return prepared ? prepared.dispatch(options) : adapter.run(request, options);
            }),
            stop,
          ]);
        } catch (error) {
          if (error instanceof HostPersistenceError) throw error;
          untrusted = { kind: "failure", category: "transport-error" };
        } finally {
          clearTimeout(timer);
          if (aborted) signal?.removeEventListener("abort", aborted);
          controller.abort();
        }
        if (signal?.aborted) {
          audit.status = "aborted";
          reject("CANCELLED", 0);
          return audit;
        }
        if (performance.now() - roleStart >= L.roleMs || performance.now() - start >= L.totalMs) {
          audit.status = "timeout";
          reject("DEADLINE", 0);
          return audit;
        }
        const envelope = fields(untrusted, ["kind", "payload", "usage", "category", "receipt"]);
        if (envelope.receipt !== undefined)
          audit.providerReceipt = ProviderReceiptSchema.parse(envelope.receipt);
        try {
          audit.usage = usage(envelope.usage, audit.outputTokenLimit);
        } catch {
          audit.status = "limit-exceeded";
          audit.rejectedCountKnown = false;
          reject("USAGE_LIMIT", 0);
          return audit;
        }
        if (envelope.kind === "failure") {
          if (
            Object.keys(envelope).some(
              (k) => !["kind", "category", "receipt", "usage"].includes(k),
            ) ||
            typeof envelope.category !== "string" ||
            !Object.hasOwn(failureStatus, envelope.category)
          )
            throw new BoundaryError("INVALID_PROVIDER_RESULT");
          audit.status = failureStatus[envelope.category as keyof typeof failureStatus];
          reject("PROVIDER_FAILURE", 0);
          return audit;
        }
        if (
          envelope.kind !== "response" ||
          !Object.hasOwn(envelope, "payload") ||
          Object.hasOwn(envelope, "category")
        )
          throw new BoundaryError("INVALID_PROVIDER_RESULT");
        const decoded = decodePayload(envelope.payload);
        audit.responseHash = decoded.responseHash;
        // Structure failures reject the entire response. Semantic failures reject individual proposals.
        if (role === "Explorer") {
          const parsed = ExplorerProposalSchema.safeParse(decoded.value);
          if (!parsed.success) {
            const limited = parsed.error.issues.some((i) => i.code === "too_big");
            audit.status = limited ? "limit-exceeded" : "schema-failure";
            const count = proposalCount(decoded.value, role);
            audit.rejectedCountKnown = count !== null;
            reject(limited ? "CANONICAL_LIMIT" : "SCHEMA_INVALID", count ?? 0);
            return audit;
          }
          for (const p of parsed.data.claims) {
            if (p.evidenceIds.some((e) => !authorized.has(e))) {
              reject("UNAUTHORIZED_EVIDENCE");
              continue;
            }
            if (!exportableText([p.statement, p.scope, p.falsifier])) {
              reject("TEXT_NOT_ALLOWED");
              continue;
            }
            const key = claimKey(p);
            if (claimKeys.has(key)) {
              reject("DUPLICATE");
              continue;
            }
            const canonical: Claim = {
              ...p,
              id: id("C"),
              scanId,
              proposedBy: "Explorer",
              provenance: "INFERRED",
              status: "proposed",
              createdAt: new Date().toISOString(),
            };
            claimKeys.add(key);
            claims.push(canonical);
            audit.acceptedIds.push(canonical.id);
          }
        } else {
          const parsed = BreakerProposalSchema.safeParse(decoded.value);
          if (!parsed.success) {
            const limited = parsed.error.issues.some(
              (i) => i.code === "too_big" || (i.code === "custom" && i.params?.limit === true),
            );
            audit.status = limited ? "limit-exceeded" : "schema-failure";
            const count = proposalCount(decoded.value, role);
            audit.rejectedCountKnown = count !== null;
            reject(limited ? "CANONICAL_LIMIT" : "SCHEMA_INVALID", count ?? 0);
            return audit;
          }
          for (const p of parsed.data.challenges) {
            if (!claims.some((c) => c.id === p.claimId)) {
              reject("UNAUTHORIZED_CLAIM");
              continue;
            }
            if (p.evidenceIds.some((e) => !authorized.has(e))) {
              reject("UNAUTHORIZED_EVIDENCE");
              continue;
            }
            if (!exportableText([p.question, p.missingEvidence ?? ""])) {
              reject("TEXT_NOT_ALLOWED");
              continue;
            }
            const key = challengeKey(p);
            if (challengeKeys.has(key)) {
              reject("DUPLICATE");
              continue;
            }
            const canonical: Challenge = {
              ...p,
              id: id("CH"),
              scanId,
              raisedBy: "Breaker",
              provenance: "INFERRED",
              status: "open",
              createdAt: new Date().toISOString(),
            };
            challengeKeys.add(key);
            challenges.push(canonical);
            audit.acceptedIds.push(canonical.id);
          }
        }
        audit.status = audit.acceptedIds.length
          ? audit.rejectedCount
            ? "partial-rejection"
            : "completed"
          : role === "Breaker" && !audit.rejectedCount
            ? "completed"
            : "no-valid-output";
        return audit;
      } catch (error) {
        if (error instanceof HostPersistenceError) throw error;
        const code: Code = error instanceof BoundaryError ? error.code : "INVALID_PROVIDER_RESULT";
        if (error instanceof BoundaryError && error.responseHash)
          audit.responseHash = error.responseHash;
        audit.status =
          code === "RESPONSE_LIMIT"
            ? "limit-exceeded"
            : code === "MALFORMED_JSON"
              ? "malformed-output"
              : "schema-failure";
        audit.rejectedCountKnown = false;
        reject(code, 0);
        return audit;
      } finally {
        audit.finishedAt = new Date().toISOString();
        audit.elapsedMs = Math.max(0, performance.now() - roleStart);
      }
    }
    const checkpoint = async (role: Role) => {
      const audit = await runRole(role);
      const value = immutable(
        RoleCheckpointSchema.parse({
          schemaVersion: 1,
          runId,
          scanId,
          startedAt,
          finishedAt: new Date().toISOString(),
          elapsedMs: Math.max(0, performance.now() - start),
          authorizedEvidenceIds: [...authorized],
          audit,
          claims: [...claims],
          challenges: [...challenges],
        }),
      );
      if (hooks) {
        try {
          await hooks.checkpoint(value);
        } catch {
          throw new HostPersistenceError();
        }
      }
      return value;
    };
    const explorer = await checkpoint("Explorer");
    const breaker = await checkpoint("Breaker");
    return reportFromCheckpoints(snapshot, explorer, breaker);
  };
  return Object.freeze({
    run: (options: { signal?: AbortSignal } = {}) => (once ??= execute(options.signal)),
  });
}
