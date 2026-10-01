export const ISOLATION_UNAVAILABLE = "ISOLATION_UNAVAILABLE" as const;

export type BrowserIsolationCapability = {
  readonly capability:
    | "disposable-worker"
    | "network-egress"
    | "destination-proxy"
    | "filesystem-secrets"
    | "resource-budgets"
    | "adversarial-verification";
  readonly status: "unavailable";
  readonly requirement: string;
};

/**
 * Describes externally enforced capabilities required for arbitrary Chromium targets.
 * This is status information, not an attestation that a caller can override.
 */
export const browserIsolationStatus = Object.freeze({
  code: ISOLATION_UNAVAILABLE,
  status: "unavailable" as const,
  liveLaunchesAllowed: false as const,
  capabilities: Object.freeze<readonly BrowserIsolationCapability[]>([
    Object.freeze({
      capability: "disposable-worker",
      status: "unavailable",
      requirement:
        "Run every browser in a disposable unprivileged worker with no host mounts or credentials.",
    }),
    Object.freeze({
      capability: "network-egress",
      status: "unavailable",
      requirement:
        "Externally deny every TCP, UDP, and IPv6 path except the designated proxy and bounded control channels.",
    }),
    Object.freeze({
      capability: "destination-proxy",
      status: "unavailable",
      requirement:
        "Require an enforcing HTTP/CONNECT proxy that validates every destination and pins each peer.",
    }),
    Object.freeze({
      capability: "filesystem-secrets",
      status: "unavailable",
      requirement:
        "Provide a disposable filesystem and process environment without user profiles, tokens, or application secrets.",
    }),
    Object.freeze({
      capability: "resource-budgets",
      status: "unavailable",
      requirement:
        "Externally enforce process, memory, CPU, network-byte, request, and whole-job cleanup limits.",
    }),
    Object.freeze({
      capability: "adversarial-verification",
      status: "unavailable",
      requirement:
        "Verify direct TCP, UDP, IPv6, proxy bypass, redirects, workers, popups, and WebSockets at the network boundary.",
    }),
  ]),
});

export class BrowserIsolationUnavailableError extends Error {
  readonly code = ISOLATION_UNAVAILABLE;

  constructor() {
    super("Browser isolation is unavailable; arbitrary Chromium launches are disabled.");
    this.name = "BrowserIsolationUnavailableError";
  }
}
