import { hash, immutable } from "../../agents/src/provider";

// Private candidate descriptor; no server, selector table or browser wrapper is exported.
const body = "<!doctype html><title>Empty owned performance fixture</title>";
const descriptor = immutable({
  schemaVersion: 1,
  fixtureKey: "browser-empty-navigation-v1",
  operationId: "controlled-fixture-empty-navigation-v1",
  method: "GET",
  path: "/collector/empty-performance",
  statusCode: 200,
  contentType: "text/html",
  bodySha256: hash(body),
  bodyBytes: Buffer.byteLength(body),
  titlePresent: true,
  redirects: 0,
  subresources: 0,
  workerTimeoutMs: 10000,
  isolation: "accepted-systemd-proxy-root-apparmor-chromium-v1",
});
export const FIXTURE_MANIFEST_HASH = hash(JSON.stringify(descriptor));
export const CONTROLLED_POLICY_HASH = hash(
  JSON.stringify({
    version: 1,
    fixtureManifestHash: FIXTURE_MANIFEST_HASH,
    promotion: "original-stage16a-object-current-policy-request-parent-only",
    relation: "lineage-only",
    challengeCategory: "reproduction-gap",
    execution: "injected-fake-only-no-observations",
    authorization: "report-review-source-controlled-plan-intent-manifest-policy-v1",
    attempts: 1,
    retries: 0,
    executorMs: 5000,
  }),
);
