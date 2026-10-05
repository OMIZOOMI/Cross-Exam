import type {
  AgentProvider,
  ProviderConfiguration,
  UntrustedProviderResult,
} from "@crossexam/agents";
import { type AgentRunAudit, ProviderRequestSchema } from "@crossexam/contracts";
import OpenAI from "openai";
import { consumeDispatch, type DispatchAuthorization } from "../../agents/src/provider";
import { ENDPOINT, MODEL, normalizeWire, PROFILE, prepareWire, WIRE_LIMITS } from "./wire";

type Receipt = NonNullable<AgentRunAudit["providerReceipt"]>;
type Failure = Extract<UntrustedProviderResult, { kind: "failure" }>;
const receipt = (code: Receipt["code"], status: number | null = null): Receipt => ({
  code,
  httpStatus: status,
  requestId: null,
  retryAfterSeconds: null,
});
const failure = (category: Failure["category"], code: Receipt["code"]): Failure => ({
  kind: "failure",
  category,
  receipt: receipt(code),
});
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function classifyHttp(status: number, value: unknown, headers: Headers): Failure {
  const e = object(object(value).error);
  const code = typeof e.code === "string" && e.code.length <= 80 ? e.code : null;
  const type = typeof e.type === "string" && e.type.length <= 80 ? e.type : null;
  let category: Failure["category"] = [400, 401, 403, 404].includes(status)
    ? "missing-configuration"
    : status === 408
      ? "timeout"
      : "unavailable";
  let hostCode: Receipt["code"] =
    category === "missing-configuration"
      ? "HTTP_CONFIGURATION"
      : status === 408
        ? "HTTP_TIMEOUT"
        : "HTTP_UNAVAILABLE";
  if (status === 429) {
    const quotas: Record<string, Receipt["code"]> = {
      project_spend_limit_exceeded: "PROJECT_SPEND_LIMIT",
      organization_spend_limit_exceeded: "ORGANIZATION_SPEND_LIMIT",
      organization_usage_limit_exceeded: "ORGANIZATION_USAGE_LIMIT",
      credit_balance_exhausted: "CREDIT_BALANCE_EXHAUSTED",
      insufficient_quota: "QUOTA_UNSPECIFIED",
      usage_limit_exceeded: "QUOTA_UNSPECIFIED",
    };
    if ((code && Object.hasOwn(quotas, code)) || type === "insufficient_quota") {
      category = "quota";
      hostCode =
        code && Object.hasOwn(quotas, code)
          ? (quotas[code] as Receipt["code"])
          : "QUOTA_UNSPECIFIED";
    } else if (code === "slow_down") {
      category = "rate-limit";
      hostCode = "RATE_INCREASE_TOO_FAST";
    } else if (code === "rate_limit_exceeded") {
      category = "rate-limit";
      hostCode = "RATE_LIMIT_REACHED";
    } else if (type === "rate_limit_error" && code === null) {
      category = "rate-limit";
      hostCode = "RATE_LIMIT_UNSPECIFIED";
    } else {
      category = "unavailable";
      hostCode = "HTTP_429_UNCLASSIFIED";
    }
  }
  const r = receipt(hostCode, status);
  const id = headers.get("x-request-id");
  if (id && /^req_[A-Za-z0-9_-]{1,124}$/.test(id)) r.requestId = id;
  const retry = headers.get("retry-after");
  if (retry && /^\d{1,4}$/.test(retry) && Number(retry) <= 3600)
    r.retryAfterSeconds = Number(retry);
  return { kind: "failure", category, receipt: r };
}
/** Decoded transport bytes are bounded before SDK JSON parsing. */
export async function boundedBody(
  response: Response,
  cap: number,
  signal: AbortSignal,
): Promise<string> {
  if (Number(response.headers.get("content-length")) > cap) {
    await response.body?.cancel();
    throw new Error("BODY_LIMIT");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let aborted: (() => void) | undefined;
  const stop = new Promise<never>((_, reject) => {
    aborted = () => {
      void reader.cancel().catch(() => {});
      reject(new Error("CANCELLED"));
    };
    if (signal.aborted) aborted();
    else signal.addEventListener("abort", aborted, { once: true });
  });
  try {
    for (;;) {
      const result = await Promise.race([reader.read(), stop]);
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > cap) throw new Error("BODY_LIMIT");
      chunks.push(result.value);
    }
    if (signal.aborted) throw new Error("CANCELLED");
    return Buffer.concat(chunks, bytes).toString("utf8");
  } finally {
    if (aborted) signal.removeEventListener("abort", aborted);
    await reader.cancel().catch(() => {});
  }
}
/** Trusted bootstrap only. No credential lookup or endpoint/model overrides. */
export function createOpenAIProvider(
  options: { apiKey?: string; transport?: typeof fetch } = {},
): ProviderConfiguration {
  if (Object.keys(options).some((k) => !["apiKey", "transport"].includes(k)))
    throw new Error("CONFIGURATION_REJECTED");
  const key = options.apiKey;
  const transport = options.transport;
  const adapter: AgentProvider = {
    prepare(input) {
      const request = ProviderRequestSchema.parse(input);
      const wire = prepareWire(request);
      let dispatched = false;
      return Object.freeze({
        requestHash: wire.requestHash,
        requestBytes: wire.requestBytes,
        requestSchemaHash: wire.requestSchemaHash,
        responseSchemaHash: wire.responseSchemaHash,
        async dispatch({
          signal,
          authorization,
        }: {
          signal: AbortSignal;
          authorization?: DispatchAuthorization;
        }): Promise<UntrustedProviderResult> {
          if (dispatched) return failure("missing-configuration", "NO_CONFIGURATION");
          dispatched = true;
          if (!key && !transport) return failure("missing-configuration", "NO_CONFIGURATION");
          if (!consumeDispatch(authorization, wire.requestHash))
            return failure("missing-configuration", "NO_CONFIGURATION");
          if (signal.aborted) return failure("abort", "CANCELLED");
          const controller = new AbortController();
          const abort = () => controller.abort();
          signal.addEventListener("abort", abort, { once: true });
          const timer = setTimeout(abort, WIRE_LIMITS.timeoutMs);
          let transportFailure: Failure | undefined;
          let successReceipt: Receipt | undefined;
          const guardedFetch: typeof fetch = async (url, init) => {
            if (
              String(url) !== ENDPOINT ||
              init?.method !== "POST" ||
              init.body !== wire.json ||
              init.redirect !== "manual"
            ) {
              transportFailure = failure("missing-configuration", "NO_CONFIGURATION");
              throw new Error("TRANSPORT_POLICY");
            }
            if (controller.signal.aborted) throw new Error("CANCELLED");
            let onAbort: (() => void) | undefined;
            const stop = new Promise<never>((_, reject) => {
              onAbort = () => reject(new Error("CANCELLED"));
              controller.signal.addEventListener("abort", onAbort, { once: true });
            });
            const pending = (transport ?? globalThis.fetch)(ENDPOINT, {
              ...init,
              redirect: "manual",
              signal: controller.signal,
            });
            // A trusted fake transport can ignore abort. Never accept its eventual late body.
            void pending.then(
              (response) => {
                if (controller.signal.aborted) void response.body?.cancel().catch(() => {});
              },
              () => {},
            );
            let response: Response;
            try {
              response = await Promise.race([pending, stop]);
            } finally {
              if (onAbort) controller.signal.removeEventListener("abort", onAbort);
            }
            if (controller.signal.aborted) {
              await response.body?.cancel();
              throw new Error("CANCELLED");
            }
            let text: string;
            try {
              text = await boundedBody(
                response,
                response.ok ? WIRE_LIMITS.response : WIRE_LIMITS.error,
                controller.signal,
              );
            } catch {
              transportFailure = failure(
                controller.signal.aborted ? (signal.aborted ? "abort" : "timeout") : "limit",
                controller.signal.aborted
                  ? signal.aborted
                    ? "CANCELLED"
                    : "TRANSPORT_TIMEOUT"
                  : "BODY_LIMIT",
              );
              throw new Error("BOUNDED_TRANSPORT_FAILED");
            }
            if (!response.ok) {
              let parsed: unknown;
              try {
                parsed = JSON.parse(text);
              } catch {
                parsed = null;
              }
              transportFailure = classifyHttp(response.status, parsed, response.headers);
              return new Response('{"error":{"message":"PROVIDER_FAILURE"}}', {
                status: response.status,
                headers: { "content-type": "application/json" },
              });
            }
            successReceipt = classifyHttp(response.status, null, response.headers).receipt;
            if (successReceipt) successReceipt.code = null;
            return new Response(text, {
              status: response.status,
              headers: { "content-type": "application/json" },
            });
          };
          try {
            const client = new OpenAI({
              apiKey: key ?? "offline-uncredentialed",
              baseURL: "https://api.openai.com/v1",
              organization: null,
              project: null,
              maxRetries: 0,
              timeout: WIRE_LIMITS.timeoutMs,
              logLevel: "off",
              fetch: guardedFetch,
              fetchOptions: { redirect: "manual" },
            });
            const response: unknown = await client.responses.create(wire.body, {
              signal: controller.signal,
              maxRetries: 0,
              timeout: WIRE_LIMITS.timeoutMs,
            });
            if (controller.signal.aborted)
              return failure(
                signal.aborted ? "abort" : "timeout",
                signal.aborted ? "CANCELLED" : "TRANSPORT_TIMEOUT",
              );
            const r = object(response);
            if (r.usage != null && (typeof r.usage !== "object" || Array.isArray(r.usage)))
              return failure("usage-error", "USAGE_INVALID");
            const usage = object(r.usage);
            const resultUsage = {
              inputTokens: usage.input_tokens ?? null,
              outputTokens: usage.output_tokens ?? null,
              reasoningTokens: object(usage.output_tokens_details).reasoning_tokens ?? null,
            };
            const token = (n: unknown, cap: number) =>
              n === null ||
              (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= cap);
            if (
              !token(resultUsage.inputTokens, 32768) ||
              !token(resultUsage.outputTokens, request.maxOutputTokens) ||
              !token(resultUsage.reasoningTokens, request.maxOutputTokens) ||
              (typeof resultUsage.outputTokens === "number" &&
                typeof resultUsage.reasoningTokens === "number" &&
                resultUsage.reasoningTokens > resultUsage.outputTokens)
            )
              return failure("usage-error", "USAGE_INVALID");
            const observedFailure = (
              category: Failure["category"],
              code: Receipt["code"],
            ): Failure => ({ ...failure(category, code), usage: resultUsage });
            if (r.status === "incomplete")
              return observedFailure(
                "incomplete",
                object(r.incomplete_details).reason === "content_filter"
                  ? "CONTENT_FILTER"
                  : "INCOMPLETE",
              );
            if (r.status !== "completed" || !Array.isArray(r.output))
              return observedFailure("unavailable", "MALFORMED_RESPONSE");
            if (r.error != null) return observedFailure("unavailable", "MALFORMED_RESPONSE");
            let output = "";
            for (const item of r.output) {
              const message = object(item);
              if (message.type === "reasoning") continue;
              if (
                message.type !== "message" ||
                message.role !== "assistant" ||
                message.status !== "completed" ||
                !Array.isArray(message.content)
              )
                return failure("unavailable", "MALFORMED_RESPONSE");
              for (const c of message.content) {
                const part = object(c);
                if (part.type === "refusal") return observedFailure("refusal", "REFUSAL");
                if (part.type !== "output_text" || typeof part.text !== "string")
                  return failure("unavailable", "MALFORMED_RESPONSE");
                if (Buffer.byteLength(part.text) + Buffer.byteLength(output) > WIRE_LIMITS.output)
                  return failure("limit", "OUTPUT_LIMIT");
                output += part.text;
              }
            }
            if (!output.trim()) return observedFailure("incomplete", "EMPTY_OUTPUT");
            let parsed: unknown;
            try {
              parsed = JSON.parse(output);
            } catch {
              return {
                kind: "response",
                payload: output,
                usage: resultUsage,
                receipt: successReceipt,
              };
            }
            try {
              parsed = normalizeWire(request.role, parsed);
            } catch {
              return failure("schema-error", "WIRE_SCHEMA_INVALID");
            }
            return {
              kind: "response",
              payload: parsed,
              usage: resultUsage,
              receipt: successReceipt,
            };
          } catch (error) {
            if (transportFailure) return transportFailure;
            if (signal.aborted) return failure("abort", "CANCELLED");
            if (controller.signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError)
              return failure("timeout", "TRANSPORT_TIMEOUT");
            return failure("transport-error", "CONNECTION_FAILURE");
          } finally {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            controller.abort();
          }
        },
      });
    },
    run(request, options) {
      return this.prepare?.(request).dispatch(options) as Promise<UntrustedProviderResult>;
    },
  };
  return Object.freeze({
    provider: "openai-responses",
    model: MODEL,
    executionProfile: PROFILE,
    reasoning: Object.freeze({ effort: "none", mode: "standard" }),
    adapter: Object.freeze(adapter),
  });
}
