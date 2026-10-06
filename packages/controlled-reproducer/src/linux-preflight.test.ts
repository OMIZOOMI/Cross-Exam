import { execFile } from "node:child_process";
import {
  chmod,
  link,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  ControlledFixtureLinuxPreflightSchema,
  LINUX_PREFLIGHT_LIMITS,
} from "@crossexam/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hash } from "../../agents/src/provider";
import { createOwnedPreflightParent } from "./fixture-parent";
import {
  canonicalApprovalBytes,
  loadProtectedOwnerAuthority,
  verifyOwnerDecision,
  verifyOwnerDecisionForTest,
} from "./linux-authority";
import {
  hashIdentityAssetForTest,
  verifyLinuxFactsForTest,
  verifySelectedLinuxHost,
} from "./linux-identity";
import {
  closeLinuxPending,
  consumeLinuxDecisionForTest,
  previewLinuxPending,
  recoverLinuxPending,
  requestManualLinuxDispatch,
  stageLinuxOriginal,
} from "./linux-staging";
import { syntheticDecision, syntheticHost, syntheticSigner } from "./linux-test-fixtures";

const dirs: string[] = [];
const id = "linux-preflight-unit-001";
async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), "ce-linux-preflight-"));
  dirs.push(directory);
  const host = syntheticHost(directory);
  const parent = await createOwnedPreflightParent();
  const receipt = await stageLinuxOriginal(parent, host.packet, id, {}, true);
  return { ...host, parent, receipt, directory, run: path.join(host.packet.host.storagePath, id) };
}
async function snapshot(dir: string) {
  return Promise.all(
    (await readdir(dir)).sort().map(async (name) => {
      const file = path.join(dir, name),
        s = await stat(file);
      return [name, s.mtimeMs, s.mode, s.uid, s.gid, await readFile(file, "utf8")];
    }),
  );
}
afterEach(async () => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
describe("read-only selected Linux identity", () => {
  it.each(["valid", "symlink", "hardlink", "writable", "directory", "oversized", "not-executable"])(
    "bounded identity asset reads reject %s inode defects",
    async (mode) => {
      const directory = await mkdtemp(path.join(tmpdir(), "ce-linux-asset-"));
      dirs.push(directory);
      const file = path.join(directory, "synthetic-asset");
      const body = "SYNTHETIC-UNIT-ONLY-NOT-CHROMIUM";
      await writeFile(file, body, { mode: 0o444 });
      if (mode === "symlink") {
        await rm(file);
        await symlink("other", file);
      }
      if (mode === "hardlink") await link(file, path.join(directory, "other"));
      if (mode === "writable") await chmod(file, 0o644);
      if (mode === "valid") {
        const before = await stat(file);
        expect(await hashIdentityAssetForTest(file, 128)).toBe(hash(body));
        expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
      } else
        await expect(
          hashIdentityAssetForTest(
            mode === "directory" ? directory : file,
            mode === "oversized" ? 2 : 128,
            mode === "not-executable",
          ),
        ).rejects.toThrow();
    },
  );
  it("creates a bounded synthetic static packet with verified-value slots, never execution proof", async () => {
    const x = await setup();
    expect(ControlledFixtureLinuxPreflightSchema.parse(x.packet)).toEqual(x.packet);
    expect(x.packet).toMatchObject({
      testOnly: true,
      browserInvoked: false,
      fixtureInvoked: false,
      proxyInvoked: false,
      workerInvoked: false,
      executionAttestation: null,
      observation: null,
      configuration: { chromiumSandbox: true, noNewPrivileges: true, hostCapabilities: 0 },
    });
    expect(x.receipt.intent.release.runtimeRootManifestHash).toBe(x.packet.rootManifestHash);
    expect(x.receipt.intent.release.chromiumBinaryHash).toBe(x.packet.chromiumBinaryHash);
    expect(x.receipt.approvalReady).toBe(false);
    expect(await readdir(x.run)).toEqual(
      expect.arrayContaining(["intent.json", "ledger.json", "receipt.json"]),
    );
  });
  it.each([
    "platform",
    "distribution",
    "version",
    "commit",
    "hostnameHash",
    "machineIdHash",
    "workerUid",
    "workerGid",
    "controllerUid",
    "controllerGid",
    "storageOwnerUid",
    "storageOwnerGid",
    "rootManifestHash",
    "chromiumBinaryHash",
    "runnerArtifactHash",
    "chromiumVersion",
    "playwright",
    "revision",
    "executable",
    "storageSafe",
    "rootValidated",
  ])("rejects wrong %s without staging", async (key) => {
    const x = await setup();
    const original = x.facts[key as keyof typeof x.facts];
    const replacement =
      typeof original === "string"
        ? "unexpected"
        : typeof original === "boolean"
          ? false
          : (original as number) + 1;
    expect(() =>
      verifyLinuxFactsForTest(x.selection, { ...x.facts, [key]: replacement }),
    ).toThrow();
  });
  it("rejects null artifact hashes and worker-owned storage", async () => {
    const x = await setup();
    for (const key of ["rootManifestHash", "chromiumBinaryHash"])
      expect(() => verifyLinuxFactsForTest({ ...x.selection, [key]: null }, x.facts)).toThrow();
    expect(() =>
      verifyLinuxFactsForTest({ ...x.selection, storageOwnerUid: x.selection.workerUid }, x.facts),
    ).toThrow();
  });
  it("production verification has no fake platform/facts argument or host fallback", async () => {
    const x = await setup();
    await expect(verifySelectedLinuxHost(x.selection)).rejects.toThrow();
    await expect(
      stageLinuxOriginal(x.parent, x.packet, "linux-prod-rejection-001"),
    ).rejects.toThrow("LINUX_PREFLIGHT_AUTHORITY_MISMATCH");
  });
  it.each(["json", "clone"])(
    "rejects %s preflight and original source reconstruction",
    async (kind) => {
      const x = await setup();
      const clone = (v: unknown) =>
        kind === "json" ? JSON.parse(JSON.stringify(v)) : structuredClone(v);
      await expect(
        stageLinuxOriginal(x.parent, clone(x.packet), "linux-preflight-other-001", {}, true),
      ).rejects.toThrow();
      await expect(
        stageLinuxOriginal(
          { ...x.parent, sourceRun: clone(x.parent.sourceRun) },
          x.packet,
          "linux-preflight-other-002",
          {},
          true,
        ),
      ).rejects.toThrow();
    },
  );
  it("restart preview needs fresh identity verification, not a serialized source run; writes nothing", async () => {
    const x = await setup();
    const before = await snapshot(x.run),
      fresh = verifyLinuxFactsForTest(x.selection, x.facts);
    expect((await previewLinuxPending(fresh, id, {}, true)).receipt).toEqual(x.receipt);
    expect(await snapshot(x.run)).toEqual(before);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(x.receipt.intent.release.expiresAt) + 1);
    expect(await recoverLinuxPending(fresh, id, {}, true)).toMatchObject({
      state: "pending-approval",
      receipt: x.receipt,
    });
    expect(await snapshot(x.run)).toEqual(before);
  });
  it("copied macOS candidate shapes cannot become a Linux intent", async () => {
    const x = await setup();
    const old = {
      schemaVersion: 1,
      artifactKind: "controlled-fixture-pre-dispatch-review-v1",
      release: {
        ...x.receipt.intent.release,
        runtimeRootManifestHash: null,
        chromiumBinaryHash: null,
      },
      approvalReady: false,
    };
    await writeFile(path.join(x.run, "intent.json"), JSON.stringify(old));
    await expect(previewLinuxPending(x.packet, id, {}, true)).rejects.toThrow(
      "LINUX_STORE_CORRUPT",
    );
  });
  it("manual dispatch and key loader stay disabled with no automatic approval", async () => {
    const x = await setup(),
      before = await snapshot(x.run);
    expect(() => requestManualLinuxDispatch()).toThrow("REAL_DISPATCH_DISABLED");
    expect(() => loadProtectedOwnerAuthority()).toThrow("OWNER_AUTHORITY_NOT_PROVISIONED");
    await expect(verifyOwnerDecision(x.receipt, { approved: true })).rejects.toThrow(
      "SYNTHETIC_NOT_OWNER_AUTHORITY",
    );
    expect(await snapshot(x.run)).toEqual(before);
  });
  it("operator rejects approve/execute flags without reading a selection or starting any service", async () => {
    for (const op of ["approve", "execute", "preview"]) {
      const args = [
        "--import",
        "tsx",
        "scripts/reproducer-linux-preflight.ts",
        op,
        "--selection-file",
        "/does-not-exist",
        "--intent-id",
        id,
        "--approved",
        "true",
      ];
      await expect(
        promisify(execFile)(process.execPath, args, { cwd: process.cwd() }),
      ).rejects.toMatchObject({ code: 1, stderr: "CONTROLLED_LINUX_PREFLIGHT_FAILED\n" });
    }
  });
});
describe("protected signature boundary — synthetic verifier only", () => {
  it("canonical signing bytes do not depend on incoming property order", async () => {
    const x = await setup(),
      r = await syntheticDecision(x.receipt);
    const reordered = Object.fromEntries(Object.entries(r.payload).reverse());
    expect(canonicalApprovalBytes(reordered)).toEqual(canonicalApprovalBytes(r.payload));
  });
  it("a timed-out protected backend cannot mint late authority or invoke a later verification", async () => {
    const x = await setup(),
      r = await syntheticDecision(x.receipt),
      backend = syntheticSigner(r.payload.key);
    let finish!: (key: typeof r.payload.key) => void;
    backend.publicIdentity = async () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    backend.verifyCanonicalPayload = vi.fn(backend.verifyCanonicalPayload);
    vi.useFakeTimers();
    const pending = verifyOwnerDecisionForTest(x.receipt, r, backend);
    const rejected = expect(pending).rejects.toThrow("OWNER_SIGNATURE_INVALID");
    await vi.advanceTimersByTimeAsync(LINUX_PREFLIGHT_LIMITS.authorityTimeoutMs);
    await rejected;
    finish(r.payload.key);
    await vi.advanceTimersByTimeAsync(0);
    expect(backend.verifyCanonicalPayload).not.toHaveBeenCalled();
    expect(await readdir(x.run)).not.toContain("approval.json");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("signs canonical exact metadata and publishes no private key or observed result", async () => {
    const x = await setup();
    const record = await syntheticDecision(x.receipt);
    const bytes = canonicalApprovalBytes(record.payload);
    expect(new TextDecoder().decode(bytes)).toMatch(
      /^CrossExam\/owner-controlled-fixture-decision\/v2\n/,
    );
    const cap = await verifyOwnerDecisionForTest(
      x.receipt,
      record,
      syntheticSigner(record.payload.key),
    );
    const result = await consumeLinuxDecisionForTest(x.packet, id, cap);
    expect(result).toMatchObject({
      status: "outcome-unknown",
      reason: "synthetic-consumed",
      attempts: 1,
      testOnly: true,
      observation: null,
      executionAttestation: null,
    });
    expect(JSON.stringify(record)).not.toMatch(
      /privateKey|Cookie|Authorization|password|HTML|OBSERVED/,
    );
  });
  it.each([
    "receiptHash",
    "releaseHash",
    "intentHash",
    "linuxPreflightHash",
    "implementationCommit",
    "futureProofPolicyHash",
    "linuxPolicyHash",
    "hostBindingHash",
    "storagePathHash",
    "storageOwnerUid",
    "storageOwnerGid",
    "operationId",
    "fixtureKey",
    "expiresAt",
  ])("rejects altered signed %s", async (field) => {
    const x = await setup(),
      record = await syntheticDecision(x.receipt);
    const original = (record.payload as Record<string, unknown>)[field];
    const value =
      typeof original === "number"
        ? original + 1
        : "f".repeat(field === "implementationCommit" ? 40 : 64);
    const tampered = { ...record, payload: { ...record.payload, [field]: value } };
    await expect(
      verifyOwnerDecisionForTest(x.receipt, tampered, syntheticSigner(record.payload.key)),
    ).rejects.toThrow();
  });
  it.each([
    "unsigned",
    "wrong-signature",
    "wrong-key",
    "unavailable",
    "exception",
    "boolean",
    "cloned-cap",
  ])("fails closed for %s", async (mode) => {
    const x = await setup(),
      r = await syntheticDecision(x.receipt);
    const backend = syntheticSigner(r.payload.key);
    let record: unknown = r;
    if (mode === "unsigned") record = { ...r, signature: undefined };
    if (mode === "wrong-signature") record = { ...r, signature: "f".repeat(64) };
    if (mode === "wrong-key")
      backend.publicIdentity = async () => ({
        ...r.payload.key,
        publicKeyFingerprint: "f".repeat(64),
      });
    if (mode === "unavailable") backend.verifyCanonicalPayload = async () => false;
    if (mode === "exception")
      backend.verifyCanonicalPayload = async () => {
        throw new Error("DO-NOT-STORE-RAW-PROVIDER-ERROR");
      };
    if (mode === "boolean") record = { approved: true };
    if (mode === "cloned-cap") {
      const cap = await verifyOwnerDecisionForTest(x.receipt, r, backend);
      await expect(
        consumeLinuxDecisionForTest(x.packet, id, JSON.parse(JSON.stringify(cap))),
      ).rejects.toThrow();
    } else await expect(verifyOwnerDecisionForTest(x.receipt, record, backend)).rejects.toThrow();
    expect(await readdir(x.run)).not.toContain("approval.json");
  });
  it("rejects expired and future decisions, including expiry after opaque verification", async () => {
    const x = await setup();
    const r = await syntheticDecision(x.receipt);
    await expect(
      verifyOwnerDecisionForTest(
        x.receipt,
        await syntheticDecision(x.receipt, "D-future", new Date(Date.now() + 5000).toISOString()),
        syntheticSigner(r.payload.key),
      ),
    ).rejects.toThrow();
    const cap = await verifyOwnerDecisionForTest(x.receipt, r, syntheticSigner(r.payload.key));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(r.payload.expiresAt) + 1);
    await expect(
      verifyOwnerDecisionForTest(x.receipt, r, syntheticSigner(r.payload.key)),
    ).rejects.toThrow();
    await expect(consumeLinuxDecisionForTest(x.packet, id, cap)).rejects.toThrow();
  });
  it("terminal replay never dispatches or writes a second marker", async () => {
    const x = await setup(),
      r = await syntheticDecision(x.receipt);
    const cap = await verifyOwnerDecisionForTest(x.receipt, r, syntheticSigner(r.payload.key)),
      result = await consumeLinuxDecisionForTest(x.packet, id, cap);
    const before = await snapshot(x.run);
    expect(await consumeLinuxDecisionForTest(x.packet, id, cap)).toEqual(result);
    expect(await recoverLinuxPending(x.packet, id, {}, true)).toEqual(result);
    expect(await snapshot(x.run)).toEqual(before);
  });
  it("decision ID cannot be re-signed for a second intent", async () => {
    const x = await setup();
    const other = await stageLinuxOriginal(
      await createOwnedPreflightParent(),
      x.packet,
      "linux-preflight-second-001",
      {},
      true,
    );
    for (const [receipt, intent] of [
      [x.receipt, id],
      [other, "linux-preflight-second-001"],
    ] as const) {
      const r = await syntheticDecision(receipt, "D-once-only");
      const cap = await verifyOwnerDecisionForTest(receipt, r, syntheticSigner(r.payload.key));
      if (intent === id) await consumeLinuxDecisionForTest(x.packet, intent, cap);
      else
        await expect(consumeLinuxDecisionForTest(x.packet, intent, cap)).rejects.toThrow(
          "OWNER_DECISION_REPLAYED",
        );
    }
  });
  it("concurrent attempts can consume at most one synthetic marker", async () => {
    const x = await setup();
    const caps = await Promise.all(
      ["D-first", "D-second"].map(async (d) => {
        const r = await syntheticDecision(x.receipt, d);
        return verifyOwnerDecisionForTest(x.receipt, r, syntheticSigner(r.payload.key));
      }),
    );
    let reached = 0;
    const results = await Promise.allSettled(
      caps.map((cap) =>
        consumeLinuxDecisionForTest(x.packet, id, cap, {
          fault: (p) => {
            if (p === "linux-dispatch-durable") reached++;
          },
        }),
      ),
    );
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(reached).toBe(1);
  });
});
describe("faults, recovery and private persistence", () => {
  it("terminal marker state cannot lose its durable dispatch hash", async () => {
    const x = await setup(),
      r = await syntheticDecision(x.receipt);
    await consumeLinuxDecisionForTest(
      x.packet,
      id,
      await verifyOwnerDecisionForTest(x.receipt, r, syntheticSigner(r.payload.key)),
    );
    const file = path.join(x.run, "ledger.json"),
      ledger = JSON.parse(await readFile(file, "utf8"));
    ledger.dispatchHash = null;
    await writeFile(file, JSON.stringify(ledger));
    await expect(recoverLinuxPending(x.packet, id, {}, true)).rejects.toThrow();
  });
  it("changed report or optional review cannot be promoted", async () => {
    const x = await setup();
    const changed = structuredClone(x.parent.report);
    changed.summary.durationMs++;
    await expect(
      stageLinuxOriginal(
        { ...x.parent, report: changed },
        x.packet,
        "linux-other-parent-001",
        {},
        true,
      ),
    ).rejects.toThrow();
    await expect(
      stageLinuxOriginal(
        { ...x.parent, skepticReview: undefined },
        x.packet,
        "linux-other-parent-002",
        {},
        true,
      ),
    ).rejects.toThrow();
  });
  it.each([
    "intent.json:before-write",
    "intent.json:after-flush",
    "intent.json:after-publish",
    "intent.json:durable",
    "ledger.json:before-write",
    "ledger.json:after-flush",
    "ledger.json:after-publish",
    "ledger.json:durable",
    "linux-pending-durable",
    "receipt.json:before-write",
    "receipt.json:after-flush",
    "receipt.json:after-publish",
    "receipt.json:durable",
  ])("stage interruption %s creates no implicit dispatch", async (point) => {
    const directory = await mkdtemp(path.join(tmpdir(), "ce-linux-preflight-fault-"));
    dirs.push(directory);
    const x = syntheticHost(directory);
    await expect(
      stageLinuxOriginal(
        await createOwnedPreflightParent(),
        x.packet,
        id,
        {
          fault: (p) => {
            if (p === point) throw new Error("FAULT");
          },
        },
        true,
      ),
    ).rejects.toThrow();
    const dir = path.join(x.packet.host.storagePath, id),
      before = await snapshot(dir);
    const complete =
      ["ledger.json:after-publish", "ledger.json:durable", "linux-pending-durable"].includes(
        point,
      ) || point.startsWith("receipt.json:");
    if (complete)
      expect(await previewLinuxPending(x.packet, id, {}, true)).toMatchObject({
        state: "pending-approval",
        result: null,
      });
    else await expect(previewLinuxPending(x.packet, id, {}, true)).rejects.toThrow();
    expect(await snapshot(dir)).toEqual(before);
    expect(await readdir(dir)).not.toContain("dispatch.json");
  });
  it.each([
    "approval.json:before-write",
    "approval.json:after-flush",
    "approval.json:after-publish",
    "approval.json:durable",
    "dispatch.json:before-write",
    "dispatch.json:after-flush",
    "dispatch.json:after-publish",
    "dispatch.json:durable",
    "ledger.json:before-write",
    "ledger.json:after-flush",
    "ledger.json:after-publish",
    "ledger.json:durable",
    "linux-dispatch-durable",
    "result.json:before-write",
    "result.json:after-flush",
    "result.json:after-publish",
    "result.json:durable",
  ])("dispatch interruption %s never retries", async (point) => {
    const x = await setup(),
      r = await syntheticDecision(x.receipt);
    const cap = await verifyOwnerDecisionForTest(x.receipt, r, syntheticSigner(r.payload.key));
    await expect(
      consumeLinuxDecisionForTest(x.packet, id, cap, {
        fault: (p) => {
          if (p === point) throw new Error("FAULT");
        },
      }),
    ).rejects.toThrow();
    const hasMarker = (await readdir(x.run)).includes("dispatch.json");
    const result = await recoverLinuxPending(x.packet, id, {}, true);
    expect(result).toMatchObject(
      hasMarker ? { status: "outcome-unknown", observation: null } : { state: "pending-approval" },
    );
    const before = await snapshot(x.run);
    await recoverLinuxPending(x.packet, id, {}, true);
    expect(await snapshot(x.run)).toEqual(before);
  });
  it("approval, marker and ledger hash are durable in order, with no actual runner", async () => {
    const x = await setup(),
      r = await syntheticDecision(x.receipt);
    const cap = await verifyOwnerDecisionForTest(x.receipt, r, syntheticSigner(r.payload.key)),
      points: string[] = [];
    await consumeLinuxDecisionForTest(x.packet, id, cap, {
      fault: async (point) => {
        points.push(point);
        if (point === "linux-dispatch-durable") {
          const l = JSON.parse(await readFile(path.join(x.run, "ledger.json"), "utf8"));
          expect(l.dispatchHash).toBe(
            hash(await readFile(path.join(x.run, "dispatch.json"), "utf8")),
          );
          expect(l.approvalHash).toBe(
            hash(await readFile(path.join(x.run, "approval.json"), "utf8")),
          );
        }
      },
    });
    expect(points.indexOf("approval.json:durable")).toBeLessThan(
      points.indexOf("dispatch.json:before-write"),
    );
    expect(points.indexOf("dispatch.json:durable")).toBeLessThan(
      points.indexOf("ledger.json:before-write"),
    );
    expect(points.indexOf("ledger.json:durable")).toBeLessThan(
      points.indexOf("linux-dispatch-durable"),
    );
  });
  it("reconciles result-before-final-ledger without changing terminal identity", async () => {
    const x = await setup(),
      r = await syntheticDecision(x.receipt);
    const cap = await verifyOwnerDecisionForTest(x.receipt, r, syntheticSigner(r.payload.key));
    let n = 0;
    await expect(
      consumeLinuxDecisionForTest(x.packet, id, cap, {
        fault: (p) => {
          if (p === "ledger.json:before-write" && ++n === 2) throw new Error("FAULT");
        },
      }),
    ).rejects.toThrow();
    const raw = await readFile(path.join(x.run, "result.json"), "utf8");
    expect(await recoverLinuxPending(x.packet, id, {}, true)).toEqual(JSON.parse(raw));
    expect(await readFile(path.join(x.run, "result.json"), "utf8")).toBe(raw);
  });
  it.each(["cancelled", "denied", "expired"] as const)(
    "only explicit %s terminalizes pending intent",
    async (reason) => {
      const x = await setup();
      if (reason === "expired") {
        await expect(closeLinuxPending(x.packet, id, reason, {}, true)).rejects.toThrow();
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.parse(x.receipt.intent.release.expiresAt) + 1);
      }
      const result = await closeLinuxPending(x.packet, id, reason, {}, true);
      expect(result).toMatchObject({
        status: "not-dispatched",
        attempts: 0,
        reason,
        observation: null,
      });
      expect(await recoverLinuxPending(x.packet, id, {}, true)).toEqual(result);
      expect(await readdir(x.run)).not.toContain("dispatch.json");
    },
  );
  it.each([
    "intent.json",
    "receipt.json",
    "ledger.json",
    "approval.json",
    "dispatch.json",
    "result.json",
  ])("corrupt %s fails closed", async (file) => {
    const x = await setup(),
      r = await syntheticDecision(x.receipt);
    await consumeLinuxDecisionForTest(
      x.packet,
      id,
      await verifyOwnerDecisionForTest(x.receipt, r, syntheticSigner(r.payload.key)),
    );
    await writeFile(path.join(x.run, file), "{");
    await expect(recoverLinuxPending(x.packet, id, {}, true)).rejects.toThrow();
  });
  it("refuses publicly readable storage and does not restage existing intents", async () => {
    const x = await setup();
    await expect(stageLinuxOriginal(x.parent, x.packet, id, {}, true)).rejects.toThrow(
      "LINUX_INTENT_EXISTS",
    );
    await chmod(path.join(x.run, "intent.json"), 0o644);
    await expect(previewLinuxPending(x.packet, id, {}, true)).rejects.toThrow();
  });
});
