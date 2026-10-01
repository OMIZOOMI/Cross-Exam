import type { Socket } from "node:net";
import type { AddressClassification, PublicAddress } from "../security/ip-policy";
import type { PinnedTransport, ResolveHost } from "../security/types";
import type { ParsedTarget } from "../security/url-policy";

export type ProxyRequestType = "http" | "connect" | "upgrade";
export type ProxyClassification =
  | AddressClassification
  | "public"
  | "request-policy"
  | "target-policy"
  | "dns-policy"
  | "redirect-policy"
  | "transport"
  | "resource-limit";

export type ProxyDecision = Readonly<{
  decision: "allowed" | "blocked";
  requestType: ProxyRequestType;
  reason: string;
  classification: ProxyClassification;
}>;

export interface EgressProxy {
  readonly url: string;
  readonly decisions: readonly ProxyDecision[];
  close(): Promise<void>;
}

/** Internal fixture seam. It is intentionally absent from the package export. */
export interface ProxyDependencies {
  resolve: ResolveHost;
  request: PinnedTransport;
  connect: (target: ParsedTarget, pin: PublicAddress, signal: AbortSignal) => Promise<Socket>;
}
