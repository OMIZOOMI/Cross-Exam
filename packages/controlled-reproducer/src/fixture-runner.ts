import { readFileSync } from "node:fs";
import {
  ControlledFixtureReproducerObservationSchema,
  ControlledFixtureReproducerReleaseSchema,
  ControlledFixtureReproducerRunSchema,
  ControlledFixtureReviewReceiptSchema,
  FIXTURE_STAGING_LIMITS,
} from "@crossexam/contracts";
import { z } from "zod";
import { hash, immutable } from "../../agents/src/provider";
import { FIXTURE_MANIFEST_HASH } from "./fixture-manifest";

const body = "<!doctype html><title>Empty owned performance fixture</title>";
const manifest = immutable({
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
const files = {
  realHost: "./fixture-staging.ts",
  realContracts: "../../contracts/src/controlled-fixture-reproducer.ts",
  fixedRunner: "./fixture-runner.ts",
  preflight: "./fixture-preflight.ts",
  parent: "./fixture-parent.ts",
  operator: "../../../scripts/reproducer-preflight.ts",
  dependencyLock: "../../../pnpm-lock.yaml",
  repositoryManifest: "../../../package.json",
  worker: "../../../apps/browser-worker/src/fixture-worker.ts",
  collector: "../../../apps/browser-worker/src/browser-collector.ts",
  limits: "../../../apps/browser-worker/src/worker-limits.ts",
  linuxBackend: "../../../apps/browser-worker/src/linux-backend.ts",
  sealedRoot: "../../../apps/browser-worker/src/linux-root.ts",
  appArmor: "../../../apps/browser-worker/src/linux-apparmor.ts",
  sandboxProof: "../../../apps/browser-worker/src/linux-sandbox-evidence.ts",
  proxy: "../../engine/src/browser-egress/core.ts",
  pinnedTransport: "../../engine/src/security/transport.ts",
  preparation: "../../../scripts/prepare-linux-isolation.sh",
  runtimeDependencies: "../../../scripts/resolve-runtime-deps.ts",
};
const sourceHashes = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [
    key,
    hash(readFileSync(new URL(file, import.meta.url), "utf8")),
  ]),
);
const configuration = immutable({
  version: 1,
  origin: "http://entry.crossexam-fixture.com",
  manifest,
  invocation: "disabled-fixed-wrapper-v1",
  sourceHashes,
  rootDirectory: "/var/lib/crossexam/root",
  rootValidation: "sealed-manifest-and-ELF-closure-v1",
  executable:
    "/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  playwright: "1.63.0",
  chromium: "153.0.8010.12",
  revision: "1243",
  chromiumSandbox: true,
  appArmorProfile: "crossexam-chromium-userns",
  appArmorAttachment:
    "/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  appArmorUsernsRestriction: 1,
  user: "crossexam-worker",
  group: "crossexam-worker",
  proxySocket: "/run/crossexam/proxy.sock",
  proxyPolicy: "existing-enforcing-pinned-egress-no-direct-v1",
  noNewPrivileges: true,
  hostCapabilities: 0,
  privateNetwork: true,
  filesystem: "existing-sealed-root-and-restricted-proc-v1",
  memoryMax: 1073741824,
  memorySwapMax: 0,
  pidsMax: 128,
  cpuQuotaPercent: 100,
  workerTimeoutMs: 10000,
  serviceTimeoutMs: 45000,
  cleanupReserveMaxMs: 1000,
  requestLimit: 64,
  decisionLimit: 96,
  methods: ["GET", "HEAD"],
  websocketAllowed: false,
  quicAllowed: false,
  serviceWorkersAllowed: false,
  downloadsAllowed: false,
  cleanup: "existing-owned-cgroup-relay-proxy-and-sentinel-proof-v1",
});
export const REAL_SCHEMAS_HASH = hash(
  JSON.stringify(
    [
      ControlledFixtureReproducerObservationSchema,
      ControlledFixtureReproducerReleaseSchema,
      ControlledFixtureReproducerRunSchema,
      ControlledFixtureReviewReceiptSchema,
    ].map((s) => z.toJSONSchema(s)),
  ),
);
export const RUNNER_CONFIG_HASH = hash(JSON.stringify(configuration));
export const REAL_MANIFEST_HASH = hash(JSON.stringify(manifest));
export const BODY_HASH = hash(body);
export const FUTURE_PROOF_POLICY_HASH = hash(
  JSON.stringify({
    version: 1,
    proofs:
      "active-cgroup-sealed-root-exact-apparmor-restriction-userns-renderer-seccomp-proxy-private-network-nonroot-nnp-empty-host-caps-limits-cleanup-zero-sentinels",
    hostAttestationRequired: true,
    temporalPolicy: "observation-within-attested-job-max-50s-and-before-expiry-dispatch-v1",
    observationFields: Object.keys(ControlledFixtureReproducerObservationSchema.shape),
    operation: "lineage-only",
    attempts: 1,
    retries: 0,
  }),
);
export const REAL_POLICY_HASH = hash(
  JSON.stringify({
    version: 1,
    kind: "controlled-fixture-pre-dispatch-v1",
    schemas: REAL_SCHEMAS_HASH,
    manifest: REAL_MANIFEST_HASH,
    runner: RUNNER_CONFIG_HASH,
    proof: FUTURE_PROOF_POLICY_HASH,
    limits: FIXTURE_STAGING_LIMITS,
    promotion: "same-process-original-stage16a-only",
    recovery: "no-marker-remains-pending-until-explicit-action",
    approval: "host-verified-opaque-authority-not-serialized-data",
    realDispatchEnabled: false,
  }),
);
export function fixedRunnerReview() {
  if (REAL_MANIFEST_HASH !== FIXTURE_MANIFEST_HASH) throw new Error("FIXTURE_MANIFEST_MISMATCH");
  const declared = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
  );
  if (declared.devDependencies?.["@playwright/test"] !== configuration.playwright)
    throw new Error("FIXTURE_RUNTIME_VERSION_MISMATCH");
  return configuration;
}
/** No parameters, Chromium import, process/network handle or enabled invocation. */
export function invokeFixedRunner(): never {
  throw new Error("REAL_RUNNER_DISABLED");
}
/** Shape parsing cannot supply the missing private host execution attestation. */
export function publishControlledFixtureObservation(_untrusted: unknown): never {
  throw new Error("HOST_EXECUTION_ATTESTATION_UNAVAILABLE");
}
