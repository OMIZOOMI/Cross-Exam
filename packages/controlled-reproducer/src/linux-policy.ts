import { readFileSync } from "node:fs";
import {
  ControlledFixtureLinuxIntentSchema,
  ControlledFixtureLinuxPreflightSchema,
  ControlledFixtureLinuxReceiptSchema,
  ControlledFixtureOwnerApprovalV2Schema,
  LINUX_PREFLIGHT_LIMITS,
  LinuxFixtureConfigurationSchema,
} from "@crossexam/contracts";
import { z } from "zod";
import { hash, immutable } from "../../agents/src/provider";
import {
  FUTURE_PROOF_POLICY_HASH,
  fixedRunnerReview,
  REAL_POLICY_HASH,
  REAL_SCHEMAS_HASH,
  RUNNER_CONFIG_HASH,
} from "./fixture-runner";

const cfg = fixedRunnerReview();
export const LINUX_CONFIGURATION = immutable(
  LinuxFixtureConfigurationSchema.parse({
    root: cfg.rootDirectory,
    executable: cfg.executable,
    playwright: cfg.playwright,
    chromiumVersion: cfg.chromium,
    revision: cfg.revision,
    workerUser: cfg.user,
    workerGroup: cfg.group,
    appArmorProfile: cfg.appArmorProfile,
    appArmorAttachment: cfg.appArmorAttachment,
    requiredAppArmorRestriction: cfg.appArmorUsernsRestriction,
    chromiumSandbox: cfg.chromiumSandbox,
    proxySocket: cfg.proxySocket,
    proxyPolicy: cfg.proxyPolicy,
    privateNetwork: cfg.privateNetwork,
    noNewPrivileges: cfg.noNewPrivileges,
    hostCapabilities: cfg.hostCapabilities,
    memoryMax: cfg.memoryMax,
    swapMax: cfg.memorySwapMax,
    pidsMax: cfg.pidsMax,
    cpuQuotaPercent: cfg.cpuQuotaPercent,
    workerTimeoutMs: cfg.workerTimeoutMs,
    serviceTimeoutMs: cfg.serviceTimeoutMs,
    stopTimeoutMs: 5000,
    cleanupReserveMaxMs: cfg.cleanupReserveMaxMs,
    cleanup: cfg.cleanup,
    requestLimit: cfg.requestLimit,
    decisionLimit: cfg.decisionLimit,
    methods: cfg.methods,
    websocketAllowed: cfg.websocketAllowed,
    quicAllowed: cfg.quicAllowed,
    serviceWorkersAllowed: cfg.serviceWorkersAllowed,
    downloadsAllowed: cfg.downloadsAllowed,
  }),
);
export const FIXED_RUNNER_ARTIFACT_HASH = hash(
  readFileSync(new URL("./fixture-runner.ts", import.meta.url), "utf8"),
);
export const LINUX_SOURCES_HASH = hash(
  JSON.stringify(
    Object.fromEntries(
      Object.entries({
        policy: "./linux-policy.ts",
        identity: "./linux-identity.ts",
        authority: "./linux-authority.ts",
        staging: "./linux-staging.ts",
        publicApi: "./linux-preflight.ts",
        operator: "../../../scripts/reproducer-linux-preflight.ts",
        contracts: "../../contracts/src/linux-fixture-preflight.ts",
        storage: "./storage.ts",
      }).map(([key, file]) => [key, hash(readFileSync(new URL(file, import.meta.url), "utf8"))]),
    ),
  ),
);
export const LINUX_SCHEMAS_HASH = hash(
  JSON.stringify(
    [
      ControlledFixtureLinuxPreflightSchema,
      ControlledFixtureLinuxIntentSchema,
      ControlledFixtureLinuxReceiptSchema,
      ControlledFixtureOwnerApprovalV2Schema,
    ].map((s) => z.toJSONSchema(s)),
  ),
);
export const LINUX_POLICY_HASH = hash(
  JSON.stringify({
    version: 1,
    kind: "persistent-linux-fixture-preflight-policy-v1",
    sources: LINUX_SOURCES_HASH,
    schemas: LINUX_SCHEMAS_HASH,
    configuration: RUNNER_CONFIG_HASH,
    sourceSchemas: REAL_SCHEMAS_HASH,
    sourcePolicy: REAL_POLICY_HASH,
    proof: FUTURE_PROOF_POLICY_HASH,
    limits: LINUX_PREFLIGHT_LIMITS,
    selection: "explicit-owner-selected-persistent-ubuntu24.04-host-and-protected-key-metadata",
    identity: "read-only-root-manifest-binary-and-fixed-wrapper-content-hashes-no-exec",
    approval: "domain-separated-canonical-signed-payload-protected-host-local-provider-only-v2",
    staging: "original-object-promotion-new-linux-namespace-no-candidate-conversion",
    attempts: 1,
    retries: 0,
    realDispatchEnabled: false,
    authorityProvisioned: false,
  }),
);
