import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createOwnedPreflightParent } from "../../controlled-reproducer/src/fixture-parent";
import { stageLinuxOriginal } from "../../controlled-reproducer/src/linux-staging";
import {
  syntheticDecision,
  syntheticHost,
} from "../../controlled-reproducer/src/linux-test-fixtures";
import {
  ControlledFixtureOwnerApprovalV2Schema as Approval,
  ControlledFixtureLinuxIntentSchema as Intent,
  type LinuxReceipt,
  ControlledFixtureLinuxPreflightSchema as Packet,
  ControlledFixtureLinuxReceiptSchema as Receipt,
  SelectedLinuxHostSchema as Selection,
} from "./linux-fixture-preflight";

let sample: LinuxReceipt;
beforeAll(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ce-linux-contract-"));
  try {
    sample = await stageLinuxOriginal(
      await createOwnedPreflightParent(),
      syntheticHost(directory).packet,
      "linux-contract-test-001",
      {},
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
describe("Linux preflight and signed-decision strict contracts", () => {
  it("valid synthetic metadata is separately labeled and cannot become execution proof", () => {
    expect(Receipt.parse(sample)).toEqual(sample);
    expect(sample.intent.preflight.testOnly).toBe(true);
    expect(sample.intent.preflight.observation).toBeNull();
  });
  it.each(["browserInvoked", "fixtureInvoked", "proxyInvoked", "workerInvoked"])(
    "rejects %s=true",
    (field) => {
      expect(Packet.safeParse({ ...sample.intent.preflight, [field]: true }).success).toBe(false);
    },
  );
  it.each(["rootManifestHash", "chromiumBinaryHash", "runnerArtifactHash"])(
    "requires exact non-null %s",
    (field) => {
      expect(Packet.safeParse({ ...sample.intent.preflight, [field]: null }).success).toBe(false);
      expect(
        Selection.safeParse({ ...sample.intent.preflight.selection, [field]: null }).success,
      ).toBe(false);
    },
  );
  it.each([
    "executionAttestation",
    "observation",
    "html",
    "rawCollection",
    "privateKey",
    "approved",
  ])("excludes %s", (field) => {
    expect(
      Packet.safeParse({ ...sample.intent.preflight, [field]: { provenance: "OBSERVED" } }).success,
    ).toBe(false);
  });
  it.each(["/relative/../storage", "relative", "/a/**", "/a/./b"])(
    "rejects broad/ambiguous storage %s",
    (storageDirectory) => {
      expect(
        Selection.safeParse({ ...sample.intent.preflight.selection, storageDirectory }).success,
      ).toBe(false);
    },
  );
  it("does not accept an approval-ready placeholder or a macOS packet", () => {
    expect(Receipt.safeParse({ ...sample, approvalReady: true }).success).toBe(false);
    expect(Packet.safeParse({ ...sample.intent.preflight, platform: "darwin" }).success).toBe(
      false,
    );
    expect(
      Packet.safeParse({
        ...sample.intent.preflight,
        kind: "controlled-fixture-pre-dispatch-review-v1",
      }).success,
    ).toBe(false);
  });
  it.each([
    "runtimeRootManifestHash",
    "chromiumBinaryHash",
    "policyHash",
    "schemasHash",
    "storageHostHash",
    "storageDirectoryHash",
  ])("cross-binds release %s", (field) => {
    expect(
      Intent.safeParse({
        ...sample.intent,
        release: { ...sample.intent.release, [field]: "f".repeat(64) },
      }).success,
    ).toBe(false);
  });
  it("valid signed shape is only data; unknown authority and private-key fields are rejected", async () => {
    const r = await syntheticDecision(sample);
    expect(Approval.parse(r)).toEqual(r);
    expect(Approval.safeParse({ ...r, approved: true }).success).toBe(false);
    expect(Approval.safeParse({ ...r, privateKey: "DISPOSABLE-NOT-A-KEY" }).success).toBe(false);
  });
  it.each(["missing", "oversized", "invalid-alphabet"])("rejects %s signature", async (mode) => {
    const r = await syntheticDecision(sample);
    const signature =
      mode === "missing" ? undefined : mode === "oversized" ? "a".repeat(2049) : "not+a/signature";
    expect(Approval.safeParse({ ...r, signature }).success).toBe(false);
  });
  it("bounds packets, key identifiers and strict configuration", () => {
    expect(Packet.safeParse({ ...sample.intent.preflight, extra: "x".repeat(32768) }).success).toBe(
      false,
    );
    expect(
      Selection.safeParse({
        ...sample.intent.preflight.selection,
        approvalKey: { ...sample.intent.preflight.selection.approvalKey, keyId: "x".repeat(129) },
      }).success,
    ).toBe(false);
    expect(
      Packet.safeParse({
        ...sample.intent.preflight,
        configuration: { ...sample.intent.preflight.configuration, chromiumSandbox: false },
      }).success,
    ).toBe(false);
  });
});
