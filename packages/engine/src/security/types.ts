import type { AddressClassification, PublicAddress } from "./ip-policy";
import type { ParsedTarget, TargetReason } from "./url-policy";

export type FailureReason =
  | TargetReason
  | "INVALID_OPTIONS"
  | "DNS_RESOLUTION_FAILED"
  | "UNSAFE_DNS_RESULT"
  | "UNSAFE_REDIRECT"
  | "REDIRECT_LIMIT"
  | "REDIRECT_LOOP"
  | "INVALID_REDIRECT"
  | "HTTPS_DOWNGRADE"
  | "REDIRECT_POLICY"
  | "REQUEST_FAILED"
  | "PEER_MISMATCH"
  | "RESPONSE_TOO_LARGE"
  | "INVALID_RESPONSE"
  | "REQUEST_TIMEOUT"
  | "ABORTED";
export type FailureStage = "input" | "dns" | "redirect" | "connection" | "response";
export class EgressError extends Error {
  constructor(
    public readonly reason: FailureReason,
    public readonly stage: FailureStage,
    public readonly classification?: AddressClassification,
  ) {
    super(reason);
    this.name = "EgressError";
  }
}
export interface RequestOptions {
  method?: "GET" | "HEAD";
  signal?: AbortSignal;
  /** May reduce, never increase the hard ceilings (30 seconds, 1 MiB, 5 redirects). */
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxRedirects?: number;
  /** Trusted caller restriction only; applied after the gate's URL checks, before redirect DNS/I/O. */
  allowRedirect?: (url: string) => boolean;
}
export interface HopRecord {
  url: string;
  address: string;
  family: 4 | 6;
  statusCode: number;
}
export type RequestResult =
  | {
      ok: true;
      url: string;
      statusCode: number;
      headers: Readonly<Record<string, string>>;
      body: Uint8Array;
      history: readonly HopRecord[];
    }
  | {
      ok: false;
      reason: FailureReason;
      stage: FailureStage;
      hop: number;
      cause?: FailureReason;
      classification?: AddressClassification;
      history: readonly HopRecord[];
    };

// Internal seams for deterministic tests; not exported through the package entry points.
export interface DnsAnswer {
  address: string;
  family: 4 | 6;
}
export type ResolveHost = (hostname: string, signal: AbortSignal) => Promise<readonly DnsAnswer[]>;
export interface HopResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Uint8Array;
}
export type PinnedTransport = (
  target: ParsedTarget,
  address: PublicAddress,
  options: { method: "GET" | "HEAD"; signal: AbortSignal; maxBodyBytes: number },
) => Promise<HopResponse>;
export const redirectStatuses = new Set([301, 302, 303, 307, 308]);
