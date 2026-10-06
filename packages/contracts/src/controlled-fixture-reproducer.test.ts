import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createOwnedPreflightParent } from "../../controlled-reproducer/src/fixture-parent";
import { publishControlledFixtureObservation } from "../../controlled-reproducer/src/fixture-runner";
import { stageOriginalFixtureParent } from "../../controlled-reproducer/src/fixture-staging";
import {
  ControlledFixtureIntentIdSchema,
  ControlledFixtureOwnerApprovalSchema,
  type ControlledFixtureReceipt,
  ControlledFixtureReproducerObservationSchema as Observation,
  ControlledFixtureReviewReceiptSchema as Receipt,
  ControlledFixtureReproducerReleaseSchema as Release,
  ControlledFixtureReproducerRunSchema as Run,
  ControlledFixtureStagingResultSchema as Terminal,
} from "./controlled-fixture-reproducer";
import {
  ControlledReproducerReleaseSchema,
  ControlledReproducerRunSchema,
} from "./controlled-reproducer";

let receipt: ControlledFixtureReceipt;
beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ce-preflight-contract-"));
  try {
    receipt = await stageOriginalFixtureParent(
      await createOwnedPreflightParent(),
      "contract-preflight-test-001",
      "a".repeat(40),
      { directory: dir },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
afterEach(() => {});
// Shape-only synthetic future samples. Never executed, persisted or promoted into evidence.
const observation = {
  schemaVersion: 1,
  artifactKind: "controlled-fixture-reproducer-observation-v1",
  fixtureKey: "browser-empty-navigation-v1",
  source: "fixture",
  provenance: "OBSERVED",
  navigationOutcome: "completed",
  statusCode: 200,
  titlePresent: true,
  redirectCount: 0,
  durationMs: 100,
  capturedAt: new Date().toISOString(),
  completeness: { complete: true, truncated: false },
};
function syntheticRun() {
  const release = {
    ...receipt.release,
    runtimeRootManifestHash: "1".repeat(64),
    chromiumBinaryHash: "2".repeat(64),
  };
  const proofs = {
    activeCgroup: true,
    sealedRoot: true,
    exactAppArmor: true,
    appArmorRestriction: true,
    chromiumUserns: true,
    rendererSeccomp: true,
    enforcingProxy: true,
    privateNetwork: true,
    nonRoot: true,
    noNewPrivileges: true,
    emptyHostCapabilities: true,
    cgroupLimits: true,
    cleanup: true,
    sentinelHits: 0,
  };
  return {
    schemaVersion: 1,
    artifactKind: "controlled-fixture-reproducer-run-v1",
    executionMode: "controlled-fixture",
    scope: "owned-controlled-fixture",
    id: release.runId,
    release,
    releaseHash: receipt.releaseHash,
    relation: "lineage-only",
    claimTested: false,
    challengeResolved: false,
    status: "completed",
    attestation: {
      kind: "trusted-linux-host-execution-v1",
      releaseHash: receipt.releaseHash,
      authorizationHash: release.authorizationHash,
      fixtureManifestHash: release.fixtureManifestHash,
      runnerConfigHash: release.runnerConfigHash,
      futureProofPolicyHash: release.futureProofPolicyHash,
      runtimeRootManifestHash: release.runtimeRootManifestHash,
      chromiumBinaryHash: release.chromiumBinaryHash,
      startedAt: release.createdAt,
      finishedAt: new Date(Date.parse(release.createdAt) + 1000).toISOString(),
      proofs,
    },
    observation: { ...observation, capturedAt: release.createdAt },
  };
}
describe("separate real-path identity and required future proof", () => {
  it("rejects observation timestamps outside the attested job", () => {
    const sample = syntheticRun();
    expect(
      Run.safeParse({
        ...sample,
        observation: { ...sample.observation, capturedAt: "2020-01-01T00:00:00.000Z" },
      }).success,
    ).toBe(false);
  });
  it("rejects an attested job extending beyond its bounded lifetime", () => {
    const sample = syntheticRun();
    expect(
      Run.safeParse({
        ...sample,
        attestation: {
          ...sample.attestation,
          finishedAt: new Date(Date.parse(sample.attestation.startedAt) + 50001).toISOString(),
        },
      }).success,
    ).toBe(false);
  });
  it("admits pending layout without claiming completed execution or attestation", () => {
    expect(Release.safeParse(receipt.release).success).toBe(true);
    expect(Receipt.safeParse(receipt).success).toBe(true);
    expect("attestation" in receipt.release).toBe(false);
    expect(ControlledReproducerReleaseSchema.safeParse(receipt.release).success).toBe(false);
    expect(ControlledReproducerRunSchema.safeParse(receipt).success).toBe(false);
    expect(Run.safeParse(receipt).success).toBe(false);
  });
  it("shape parsing supplies no actual execution authority", () => {
    const sample = syntheticRun();
    expect(Run.safeParse(sample).success).toBe(true);
    expect(() => publishControlledFixtureObservation(sample)).toThrow(
      "HOST_EXECUTION_ATTESTATION_UNAVAILABLE",
    );
  });
  it.each([
    { attestation: undefined },
    { executionMode: "injected-fake" },
    { artifactKind: "controlled-reproducer-run-v1" },
    { scope: "public" },
    { claimTested: true },
    { challengeResolved: true },
    { relation: "claim-reproduction" },
    { status: "failed" },
    { observation: null },
    { html: "private" },
    { headers: { Cookie: "private" } },
  ])("rejects incompatible final run %j", (patch) => {
    expect(Run.safeParse({ ...syntheticRun(), ...patch }).success).toBe(false);
  });
  it.each([
    "activeCgroup",
    "sealedRoot",
    "exactAppArmor",
    "appArmorRestriction",
    "chromiumUserns",
    "rendererSeccomp",
    "enforcingProxy",
    "privateNetwork",
    "nonRoot",
    "noNewPrivileges",
    "emptyHostCapabilities",
    "cgroupLimits",
    "cleanup",
  ])("requires host proof %s", (key) => {
    const s = syntheticRun();
    expect(
      Run.safeParse({
        ...s,
        attestation: { ...s.attestation, proofs: { ...s.attestation.proofs, [key]: false } },
      }).success,
    ).toBe(false);
  });
  it.each([
    "releaseHash",
    "authorizationHash",
    "fixtureManifestHash",
    "runnerConfigHash",
    "futureProofPolicyHash",
    "runtimeRootManifestHash",
    "chromiumBinaryHash",
  ])("requires matching attestation %s", (key) => {
    const s = syntheticRun();
    expect(
      Run.safeParse({ ...s, attestation: { ...s.attestation, [key]: "f".repeat(64) } }).success,
    ).toBe(false);
  });
  it.each([
    { kind: "offline-test-reservation" },
    { approved: true },
    { attestation: { proofs: {} } },
    { url: "private" },
    { timeout: 20000 },
    { fixtureKey: "caller-selected" },
  ])("rejects authority/config extension %j", (patch) => {
    expect(Release.safeParse({ ...receipt.release, ...patch }).success).toBe(false);
  });
  it.each(["../../escape", "<RELEASE_ID>", "x".repeat(65), "short"])(
    "rejects unsafe intent ID %s",
    (id) => {
      expect(ControlledFixtureIntentIdSchema.safeParse(id).success).toBe(false);
    },
  );
  it("bare approval boolean is never an owner record", () => {
    expect(ControlledFixtureOwnerApprovalSchema.safeParse({ approved: true }).success).toBe(false);
  });
});
describe("future observation projection and staging terminal separation", () => {
  it("permits only the bounded future projection, never publishing it", () => {
    expect(Observation.safeParse(observation).success).toBe(true);
    expect(() => publishControlledFixtureObservation(observation)).toThrow();
  });
  it.each([
    { artifactKind: "browser-evidence-v1" },
    { provenance: "SIMULATED" },
    { source: "live" },
    { redirectCount: 1 },
    { durationMs: -1 },
    { durationMs: 10001 },
    { durationMs: Infinity },
    { statusCode: 0 },
    { capturedAt: "invalid" },
    { completeness: { complete: false, truncated: false } },
    { completeness: { complete: true, truncated: true } },
    ...[
      "url",
      "path",
      "body",
      "html",
      "headers",
      "text",
      "formValues",
      "selectors",
      "screenshots",
      "secrets",
      "providerOutput",
      "rawCollection",
    ].map((k) => ({ [k]: "private" })),
  ])("rejects incomplete/raw observation %j", (patch) => {
    expect(Observation.safeParse({ ...observation, ...patch }).success).toBe(false);
  });
  it("zero-attempt explicit terminal action is metadata, not a real run or observation", () => {
    const result = {
      artifactKind: "controlled-fixture-staging-terminal-v1",
      releaseHash: receipt.releaseHash,
      receiptHash: "a".repeat(64),
      authorizationHash: receipt.release.authorizationHash,
      status: "not-dispatched",
      reason: "cancelled",
      attempts: 0,
      testOnly: false,
      provenance: null,
      observation: null,
      finishedAt: receipt.release.createdAt,
    };
    expect(Terminal.safeParse(result).success).toBe(true);
    expect(Terminal.safeParse({ ...result, reason: "recovered" }).success).toBe(false);
    expect(Terminal.safeParse({ ...result, observation }).success).toBe(false);
    expect(Run.safeParse(result).success).toBe(false);
  });
});
