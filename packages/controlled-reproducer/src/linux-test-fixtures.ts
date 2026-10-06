// Pure synthetic host/key metadata for unit tests. Never imported by an operator or production API.
import { hostname } from "node:os";
import type { LinuxReceipt, SelectedLinuxHost } from "@crossexam/contracts";
import { hash } from "../../agents/src/provider";
import {
  canonicalApprovalBytes,
  expectedApprovalPayload,
  type ProtectedOwnerSigner,
} from "./linux-authority";
import { type LinuxIdentityFacts, verifyLinuxFactsForTest } from "./linux-identity";
import { FIXED_RUNNER_ARTIFACT_HASH } from "./linux-policy";
export function syntheticHost(directory: string) {
  const owner = process.getuid?.() as number,
    gid = process.getgid?.() as number;
  const selection: SelectedLinuxHost = {
    schemaVersion: 1,
    kind: "owner-selected-persistent-linux-host-v1",
    persistent: true,
    implementationCommit: "a".repeat(40),
    hostnameHash: hash(hostname()),
    machineIdHash: hash("SYNTHETIC-MACHINE-NO-HOST"),
    rootManifestHash: "1".repeat(64),
    chromiumBinaryHash: "2".repeat(64),
    runnerArtifactHash: FIXED_RUNNER_ARTIFACT_HASH,
    workerUid: owner === 999 ? 998 : 999,
    workerGid: 999,
    storageDirectory: directory,
    storageOwnerUid: owner,
    storageOwnerGid: gid,
    approvalKey: {
      keyId: "synthetic-unit-only",
      publicKeyFingerprint: hash("NOT-A-REAL-KEY"),
      custody: "owner-reviewed-host-local-os-or-tpm",
      mechanismId: "synthetic-test-only",
      signatureScheme: "synthetic-hash-v1",
    },
  };
  const facts: LinuxIdentityFacts = {
    platform: "linux",
    distribution: "ubuntu",
    version: "24.04",
    commit: selection.implementationCommit,
    hostnameHash: selection.hostnameHash,
    machineIdHash: selection.machineIdHash,
    workerUid: selection.workerUid,
    workerGid: selection.workerGid,
    controllerUid: owner,
    controllerGid: gid,
    storageOwnerUid: owner,
    storageOwnerGid: gid,
    rootManifestHash: selection.rootManifestHash,
    chromiumBinaryHash: selection.chromiumBinaryHash,
    preparedWorkerArtifactHash: "3".repeat(64),
    runnerArtifactHash: FIXED_RUNNER_ARTIFACT_HASH,
    chromiumVersion: "153.0.8010.12",
    playwright: "1.63.0",
    revision: "1243",
    executable:
      "/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
    storageSafe: true,
    rootValidated: true,
  };
  return { selection, facts, packet: verifyLinuxFactsForTest(selection, facts) };
}
export function syntheticSigner(key: SelectedLinuxHost["approvalKey"]): ProtectedOwnerSigner {
  const signature = (bytes: Uint8Array) =>
    hash(`SYNTHETIC-ONLY-NOT-CRYPTOGRAPHIC-AUTHORITY\n${new TextDecoder().decode(bytes)}`);
  return {
    publicIdentity: async () => key,
    signCanonicalPayload: async (bytes) => signature(bytes),
    verifyCanonicalPayload: async (bytes, signed) => signed === signature(bytes),
  };
}
export async function syntheticDecision(
  r: LinuxReceipt,
  decisionId = "D-synthetic-test-001",
  at = new Date().toISOString(),
) {
  const payload = expectedApprovalPayload(r, decisionId, at);
  return {
    kind: "owner-verified-controlled-fixture-approval-v2",
    payload,
    signature: await syntheticSigner(payload.key).signCanonicalPayload(
      canonicalApprovalBytes(payload),
      new AbortController().signal,
    ),
  };
}
