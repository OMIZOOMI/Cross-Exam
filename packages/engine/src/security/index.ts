import { resolveHost } from "./dns";
import { executeRequest } from "./request-core";
import { requestPinned } from "./transport";
import type { RequestOptions, RequestResult } from "./types";

export type {
  FailureReason,
  FailureStage,
  HopRecord,
  RequestOptions,
  RequestResult,
} from "./types";

/** Node-only destination boundary. Never use a syntax-policy result with ordinary fetch/Playwright. */
export function safeRequest(input: unknown, options: RequestOptions = {}): Promise<RequestResult> {
  return executeRequest(input, options, { resolve: resolveHost, transport: requestPinned });
}
