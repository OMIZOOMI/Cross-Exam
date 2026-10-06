import { z } from "zod";
import { ControlledFixtureReproducerReleaseSchema } from "./controlled-fixture-reproducer";
import { TribunalIdSchema } from "./tribunal";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const commit = z.string().regex(/^[a-f0-9]{40}$/);
const uid = z.number().int().nonnegative();
const date = z.string().datetime();
const label = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/);
const absolute = z
  .string()
  .max(512)
  .regex(/^\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/)
  .refine((s) => !s.split("/").some((p) => p === "." || p === ".."));
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
export const LINUX_PREFLIGHT_LIMITS = Object.freeze({
  packetBytes: 12 * 1024,
  intentBytes: 24 * 1024,
  receiptBytes: 28 * 1024,
  approvalBytes: 4096,
  authorityTimeoutMs: 2000,
  metadataBytes: 2048,
  resultBytes: 2048,
  intents: 16,
  manifestBytes: 16 * 1024 * 1024,
  artifactBytes: 256 * 1024 * 1024,
});
export const ProtectedApprovalKeySchema = z
  .object({
    keyId: label,
    publicKeyFingerprint: digest,
    custody: z.literal("owner-reviewed-host-local-os-or-tpm"),
    mechanismId: label,
    signatureScheme: label,
  })
  .strict();
/** Operator-selected configuration, never owner approval or proof of persistence. */
export const SelectedLinuxHostSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("owner-selected-persistent-linux-host-v1"),
    persistent: z.literal(true),
    implementationCommit: commit,
    hostnameHash: digest,
    machineIdHash: digest,
    rootManifestHash: digest,
    chromiumBinaryHash: digest,
    runnerArtifactHash: digest,
    workerUid: uid.refine((n) => n > 0),
    workerGid: uid.refine((n) => n > 0),
    storageDirectory: absolute,
    storageOwnerUid: uid,
    storageOwnerGid: uid,
    approvalKey: ProtectedApprovalKeySchema,
  })
  .strict();
export const LinuxFixtureConfigurationSchema = z
  .object({
    root: z.literal("/var/lib/crossexam/root"),
    executable: z.literal(
      "/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
    ),
    playwright: z.literal("1.63.0"),
    chromiumVersion: z.literal("153.0.8010.12"),
    revision: z.literal("1243"),
    workerUser: z.literal("crossexam-worker"),
    workerGroup: z.literal("crossexam-worker"),
    appArmorProfile: z.literal("crossexam-chromium-userns"),
    appArmorAttachment: z.literal(
      "/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
    ),
    requiredAppArmorRestriction: z.literal(1),
    chromiumSandbox: z.literal(true),
    proxySocket: z.literal("/run/crossexam/proxy.sock"),
    proxyPolicy: z.literal("existing-enforcing-pinned-egress-no-direct-v1"),
    privateNetwork: z.literal(true),
    noNewPrivileges: z.literal(true),
    hostCapabilities: z.literal(0),
    memoryMax: z.literal(1073741824),
    swapMax: z.literal(0),
    pidsMax: z.literal(128),
    cpuQuotaPercent: z.literal(100),
    workerTimeoutMs: z.literal(10000),
    serviceTimeoutMs: z.literal(45000),
    stopTimeoutMs: z.literal(5000),
    cleanupReserveMaxMs: z.literal(1000),
    cleanup: z.literal("existing-owned-cgroup-relay-proxy-and-sentinel-proof-v1"),
    requestLimit: z.literal(64),
    decisionLimit: z.literal(96),
    methods: z.tuple([z.literal("GET"), z.literal("HEAD")]),
    websocketAllowed: z.literal(false),
    quicAllowed: z.literal(false),
    serviceWorkersAllowed: z.literal(false),
    downloadsAllowed: z.literal(false),
  })
  .strict();
export const ControlledFixtureLinuxPreflightSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("controlled-fixture-linux-preflight-v1"),
    verification: z.literal("static-identity-only"),
    testOnly: z.boolean(),
    selection: SelectedLinuxHostSchema,
    selectionHash: digest,
    platform: z.literal("linux"),
    distribution: z.literal("ubuntu"),
    distributionVersion: z.literal("24.04"),
    implementationCommit: commit,
    runnerArtifactHash: digest,
    preparedWorkerArtifactHash: digest,
    sourceHash: digest,
    configurationHash: digest,
    sourceSchemasHash: digest,
    sourcePolicyHash: digest,
    linuxSchemasHash: digest,
    linuxPolicyHash: digest,
    futureProofPolicyHash: digest,
    fixtureManifestHash: digest,
    bodyHash: digest,
    rootManifestHash: digest,
    chromiumBinaryHash: digest,
    configuration: LinuxFixtureConfigurationSchema,
    host: z
      .object({
        hostnameHash: digest,
        machineIdHash: digest,
        bindingHash: digest,
        workerUid: uid,
        workerGid: uid,
        storagePath: absolute,
        storagePathHash: digest,
        storageOwnerUid: uid,
        storageOwnerGid: uid,
      })
      .strict(),
    browserInvoked: z.literal(false),
    fixtureInvoked: z.literal(false),
    proxyInvoked: z.literal(false),
    workerInvoked: z.literal(false),
    executionAttestation: z.null(),
    observation: z.null(),
  })
  .strict()
  .refine(
    (v) =>
      v.implementationCommit === v.selection.implementationCommit &&
      v.runnerArtifactHash === v.selection.runnerArtifactHash &&
      v.rootManifestHash === v.selection.rootManifestHash &&
      v.chromiumBinaryHash === v.selection.chromiumBinaryHash &&
      v.host.hostnameHash === v.selection.hostnameHash &&
      v.host.machineIdHash === v.selection.machineIdHash &&
      v.host.workerUid === v.selection.workerUid &&
      v.host.workerGid === v.selection.workerGid &&
      v.host.storageOwnerUid === v.selection.storageOwnerUid &&
      v.host.storageOwnerGid === v.selection.storageOwnerGid &&
      v.host.storagePath === `${v.selection.storageDirectory}/controlled-fixture-linux-v1` &&
      bytes(v) <= LINUX_PREFLIGHT_LIMITS.packetBytes,
  );
export const ControlledFixtureLinuxIntentSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("controlled-fixture-linux-intent-v1"),
    preflight: ControlledFixtureLinuxPreflightSchema,
    preflightHash: digest,
    release: ControlledFixtureReproducerReleaseSchema,
    releaseHash: digest,
  })
  .strict()
  .refine(
    (v) =>
      v.release.runtimeRootManifestHash === v.preflight.rootManifestHash &&
      v.release.chromiumBinaryHash === v.preflight.chromiumBinaryHash &&
      v.release.implementationCommit === v.preflight.implementationCommit &&
      v.release.policyHash === v.preflight.linuxPolicyHash &&
      v.release.schemasHash === v.preflight.linuxSchemasHash &&
      v.release.runnerConfigHash === v.preflight.configurationHash &&
      v.release.fixtureManifestHash === v.preflight.fixtureManifestHash &&
      v.release.bodyHash === v.preflight.bodyHash &&
      v.release.futureProofPolicyHash === v.preflight.futureProofPolicyHash &&
      v.release.storageDirectoryHash === v.preflight.host.storagePathHash &&
      v.release.storageHostHash === v.preflight.host.bindingHash &&
      v.release.storageOwner === v.preflight.host.storageOwnerUid &&
      bytes(v) <= LINUX_PREFLIGHT_LIMITS.intentBytes,
  );
export const ControlledFixtureLinuxReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    artifactKind: z.literal("controlled-fixture-linux-review-v1"),
    intent: ControlledFixtureLinuxIntentSchema,
    intentHash: digest,
    approvalReady: z.literal(false),
    blockers: z.tuple([
      z.literal("OWNER_AUTHORITY_NOT_PROVISIONED"),
      z.literal("REAL_DISPATCH_DISABLED"),
    ]),
  })
  .strict()
  .refine((v) => bytes(v) <= LINUX_PREFLIGHT_LIMITS.receiptBytes);
export const LinuxOwnerApprovalPayloadSchema = z
  .object({
    schemaVersion: z.literal(2),
    kind: z.literal("controlled-fixture-owner-decision-v2"),
    decisionId: TribunalIdSchema,
    receiptHash: digest,
    releaseHash: digest,
    intentHash: digest,
    linuxPreflightHash: digest,
    implementationCommit: commit,
    futureProofPolicyHash: digest,
    linuxPolicyHash: digest,
    hostBindingHash: digest,
    storagePathHash: digest,
    storageOwnerUid: uid,
    storageOwnerGid: uid,
    operationId: z.literal("controlled-fixture-empty-navigation-v1"),
    fixtureKey: z.literal("browser-empty-navigation-v1"),
    key: ProtectedApprovalKeySchema,
    approvedAt: date,
    expiresAt: date,
  })
  .strict()
  .refine((v) => Date.parse(v.expiresAt) > Date.parse(v.approvedAt));
export const ControlledFixtureOwnerApprovalV2Schema = z
  .object({
    kind: z.literal("owner-verified-controlled-fixture-approval-v2"),
    payload: LinuxOwnerApprovalPayloadSchema,
    signature: z
      .string()
      .min(16)
      .max(2048)
      .regex(/^[a-zA-Z0-9_-]+$/),
  })
  .strict()
  .refine((v) => bytes(v) <= LINUX_PREFLIGHT_LIMITS.approvalBytes);
export const LinuxFixtureLedgerSchema = z
  .object({
    kind: z.literal("controlled-fixture-linux-ledger-v1"),
    intentHash: digest,
    receiptHash: digest,
    approvalHash: digest.nullable(),
    dispatchHash: digest.nullable(),
    resultHash: digest.nullable(),
    state: z.enum(["pending-approval", "dispatched", "terminal"]),
  })
  .strict()
  .refine(
    (v) =>
      (v.state === "terminal") === (v.resultHash !== null) &&
      (v.dispatchHash === null || v.approvalHash !== null) &&
      (v.state !== "dispatched" || v.dispatchHash !== null) &&
      (v.state !== "pending-approval" || v.dispatchHash === null),
  );
export const LinuxFixtureTestDispatchSchema = z
  .object({
    kind: z.literal("linux-fixture-synthetic-dispatch-v1"),
    testOnly: z.literal(true),
    intentHash: digest,
    receiptHash: digest,
    approvalHash: digest,
    authorizationHash: digest,
    attempts: z.literal(1),
    dispatchedAt: date,
  })
  .strict();
export const LinuxFixtureTerminalSchema = z
  .object({
    kind: z.literal("linux-fixture-staging-terminal-v1"),
    intentHash: digest,
    receiptHash: digest,
    status: z.enum(["not-dispatched", "outcome-unknown"]),
    reason: z.enum(["cancelled", "expired", "denied", "synthetic-consumed", "recovered"]),
    attempts: z.number().int().min(0).max(1),
    testOnly: z.boolean(),
    observation: z.null(),
    executionAttestation: z.null(),
    finishedAt: date,
  })
  .strict()
  .refine((v) =>
    v.status === "not-dispatched"
      ? v.attempts === 0 && ["cancelled", "expired", "denied"].includes(v.reason)
      : v.attempts === 1 && v.testOnly && ["synthetic-consumed", "recovered"].includes(v.reason),
  );
export type SelectedLinuxHost = z.infer<typeof SelectedLinuxHostSchema>;
export type LinuxPreflight = z.infer<typeof ControlledFixtureLinuxPreflightSchema>;
export type LinuxReceipt = z.infer<typeof ControlledFixtureLinuxReceiptSchema>;
export type LinuxIntent = z.infer<typeof ControlledFixtureLinuxIntentSchema>;
export type LinuxApproval = z.infer<typeof ControlledFixtureOwnerApprovalV2Schema>;
export type LinuxLedger = z.infer<typeof LinuxFixtureLedgerSchema>;
export type LinuxTerminal = z.infer<typeof LinuxFixtureTerminalSchema>;
