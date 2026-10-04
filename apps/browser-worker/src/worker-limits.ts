/** Existing fixture-worker enforcement policy, shared with the internal collector. */
export const WORKER_LIMITS = Object.freeze({
  defaultTimeoutMs: 10_000,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 30_000,
  requests: 64,
  decisions: 96,
  cleanupReserveMaxMs: 1_000,
});
