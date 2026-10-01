import { resolveHost } from "../security/dns";
import { requestPinned } from "../security/transport";
import { connectPinned } from "./connect";
import { startProxy } from "./core";
import type { EgressProxy } from "./types";

export type {
  EgressProxy,
  ProxyClassification,
  ProxyDecision,
  ProxyRequestType,
} from "./types";

/** Node-only, non-MITM browser proxy with fixed production DNS and pinned transports. */
export function startEgressProxy(): Promise<EgressProxy> {
  return startProxy({ resolve: resolveHost, request: requestPinned, connect: connectPinned });
}
