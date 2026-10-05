import { createHash } from "node:crypto";
import type { AgentRunAudit, RoleView } from "@crossexam/contracts";
import { TRIBUNAL_LIMITS } from "@crossexam/contracts";

export type ProviderFailure =
  | "missing-configuration"
  | "unavailable"
  | "transport-error"
  | "timeout"
  | "abort"
  | "rate-limit"
  | "quota"
  | "refusal"
  | "incomplete"
  | "limit"
  | "schema-error"
  | "usage-error";
export type UntrustedProviderResult =
  | {
      kind: "response";
      payload: unknown;
      usage?: unknown;
      receipt?: AgentRunAudit["providerReceipt"];
    }
  | {
      kind: "failure";
      category: ProviderFailure;
      receipt?: AgentRunAudit["providerReceipt"];
      usage?: unknown;
    };
export interface ProviderRequest {
  readonly schemaVersion: 1;
  readonly role: "Explorer" | "Breaker";
  readonly instructions: string;
  readonly view: RoleView;
  readonly maxOutputTokens: 768 | 1024;
  readonly timeoutMs: 20000;
  readonly semanticRetries: 0;
}
/** In-memory capability issued only by trusted durable-admission host code. */
export interface DispatchAuthorization {
  readonly kind: "durable-host-dispatch-v1";
}
const grants = new WeakMap<DispatchAuthorization, { hash: string; consumed: boolean }>();
export function authorizeDispatch(requestHash: string): DispatchAuthorization {
  const authorization = Object.freeze({ kind: "durable-host-dispatch-v1" as const });
  grants.set(authorization, { hash: requestHash, consumed: false });
  return authorization;
}
export function consumeDispatch(
  authorization: DispatchAuthorization | undefined,
  requestHash: string,
): boolean {
  const grant = authorization && grants.get(authorization);
  if (!grant || grant.consumed || grant.hash !== requestHash) return false;
  grant.consumed = true;
  return true;
}
/** Trusted adapter prepares exact non-secret wire identity without dispatching. */
export interface PreparedProviderCall {
  readonly requestHash: string;
  readonly requestBytes: number;
  readonly requestSchemaHash: string;
  readonly responseSchemaHash: string;
  dispatch(options: {
    readonly signal: AbortSignal;
    readonly authorization?: DispatchAuthorization;
  }): Promise<UntrustedProviderResult>;
}
export interface AgentProvider {
  prepare?(request: ProviderRequest): PreparedProviderCall;
  run(
    request: ProviderRequest,
    options: { readonly signal: AbortSignal; readonly authorization?: DispatchAuthorization },
  ): Promise<UntrustedProviderResult>;
}
/** Adapter identity comes from trusted host configuration, never from a response. */
export interface ProviderConfiguration {
  readonly provider: string;
  readonly model: string;
  readonly adapter?: AgentProvider;
  readonly executionProfile?: AgentRunAudit["executionProfile"];
  readonly reasoning?: AgentRunAudit["reasoning"];
}
export class BoundaryError extends Error {
  constructor(
    readonly code: "RESPONSE_LIMIT" | "INVALID_PROVIDER_RESULT" | "MALFORMED_JSON",
    readonly responseHash?: string,
  ) {
    super(code);
  }
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

/** No getters, toJSON, cycles, exotic objects, or unbounded serialization. */
export function boundedJson(value: unknown, maxBytes = TRIBUNAL_LIMITS.responseBytes): string {
  let bytes = 0;
  let nodes = 0;
  const pieces: string[] = [];
  const seen = new Set<object>();
  const add = (piece: string) => {
    bytes += Buffer.byteLength(piece);
    if (bytes > maxBytes) throw new BoundaryError("RESPONSE_LIMIT");
    pieces.push(piece);
  };
  const walk = (v: unknown, depth: number) => {
    if (++nodes > 4096 || depth > 12) throw new BoundaryError("RESPONSE_LIMIT");
    if (v === null || typeof v === "boolean") return add(JSON.stringify(v));
    if (typeof v === "number" && Number.isFinite(v)) return add(JSON.stringify(v));
    if (typeof v === "string") {
      if (Buffer.byteLength(v) > maxBytes) throw new BoundaryError("RESPONSE_LIMIT");
      return add(JSON.stringify(v));
    }
    if (typeof v !== "object") throw new BoundaryError("INVALID_PROVIDER_RESULT");
    if (seen.has(v)) throw new BoundaryError("INVALID_PROVIDER_RESULT");
    if (Object.getOwnPropertySymbols(v).length) throw new BoundaryError("INVALID_PROVIDER_RESULT");
    const array = Array.isArray(v);
    if (array && v.length > 128) throw new BoundaryError("RESPONSE_LIMIT");
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
      throw new BoundaryError("INVALID_PROVIDER_RESULT");
    seen.add(v);
    const entries = Object.entries(Object.getOwnPropertyDescriptors(v)).filter(
      ([key]) => !array || key !== "length",
    );
    if (entries.length > 128) throw new BoundaryError("RESPONSE_LIMIT");
    if (array && entries.length !== v.length) throw new BoundaryError("INVALID_PROVIDER_RESULT");
    add(array ? "[" : "{");
    entries.forEach(([key, descriptor], index) => {
      if (!descriptor.enumerable || !("value" in descriptor) || (array && key !== String(index)))
        throw new BoundaryError("INVALID_PROVIDER_RESULT");
      if (index) add(",");
      if (!array) {
        if (Buffer.byteLength(key) > maxBytes) throw new BoundaryError("RESPONSE_LIMIT");
        add(JSON.stringify(key));
        add(":");
      }
      walk(descriptor.value, depth + 1);
    });
    add(array ? "]" : "}");
    seen.delete(v);
  };
  walk(value, 0);
  return pieces.join("");
}
export function decodePayload(payload: unknown): { value: unknown; responseHash: string } {
  const serialized = typeof payload === "string" ? payload : boundedJson(payload);
  if (Buffer.byteLength(serialized) > TRIBUNAL_LIMITS.responseBytes)
    throw new BoundaryError("RESPONSE_LIMIT");
  try {
    return { value: JSON.parse(serialized), responseHash: hash(serialized) };
  } catch {
    throw new BoundaryError("MALFORMED_JSON", hash(serialized));
  }
}
