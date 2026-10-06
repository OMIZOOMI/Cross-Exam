import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  ControlledFixtureReproducerRunSchema,
  ControlledReproducerRunSchema,
  FIXTURE_STAGING_LIMITS as L,
} from "@crossexam/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hash } from "../../agents/src/provider";
import { createOwnedPreflightParent } from "./fixture-parent";
import { renderPendingFixturePacket } from "./fixture-preflight";
import {
  fixedRunnerReview,
  invokeFixedRunner,
  publishControlledFixtureObservation,
  REAL_MANIFEST_HASH,
} from "./fixture-runner";
import {
  closePendingFixture,
  dispatchFixtureFakeForTest,
  mintSyntheticFixtureApproval,
  previewPendingFixture,
  recoverPendingFixture,
  requestManualFixtureDispatch,
  stageOriginalFixtureParent,
} from "./fixture-staging";

const dirs: string[] = [];
const id = "fixture-preflight-test-001";
const commit = "a".repeat(40);
const completed = () => ({ kind: "simulated-completed", provenance: "SIMULATED", testOnly: true });
async function directory() {
  const d = await mkdtemp(path.join(tmpdir(), "ce-fixture-preflight-"));
  dirs.push(d);
  return d;
}
const runDir = (d: string) => path.join(d, "controlled-fixture-v1", id);
async function stage(d: string) {
  return stageOriginalFixtureParent(await createOwnedPreflightParent(), id, commit, {
    directory: d,
  });
}
async function snapshot(d: string) {
  const out: unknown[] = [];
  for (const file of (await readdir(runDir(d))).sort()) {
    const f = path.join(runDir(d), file);
    const s = await lstat(f);
    out.push([file, s.mtimeMs, s.mode, await readFile(f, "utf8")]);
  }
  return out;
}
afterEach(async () => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("original-object fixed preflight and read-only pending review", () => {
  it("stages the original live source, with new controlled identities and exact independent hashes", async () => {
    const parent = await createOwnedPreflightParent();
    const d = await directory();
    const r = await stageOriginalFixtureParent(parent, id, commit, { directory: d });
    expect(r.approvalReady).toBe(false);
    expect(r.release.binding.parent).toEqual(parent.sourceRun.parent);
    expect(r.release.binding.sourceRunHash).toBe(hash(JSON.stringify(parent.sourceRun)));
    expect(r.release.binding.sourcePlanHash).toBe(hash(JSON.stringify(parent.sourceRun.plans[0])));
    expect(r.release.planHash).toBe(hash(JSON.stringify(r.release.plan)));
    expect(r.release.fixtureManifestHash).toBe(REAL_MANIFEST_HASH);
    expect(r.release.plan.id).not.toBe(parent.sourceRun.plans[0]?.id);
    expect(r.release.runtimeRootManifestHash).toBeNull();
    expect(r.release.chromiumBinaryHash).toBeNull();
    expect(r.release.binding.parent.skepticReviewHash).not.toBeNull();
    expect(parent.sourceRun.execution.calls).toBe(0);
    expect(parent.sourceRun.authorization).toBeNull();
    expect((await readdir(runDir(d))).sort()).toEqual([
      "ledger.json",
      "receipt.json",
      "release.json",
    ]);
    const before = await snapshot(d);
    const p = await previewPendingFixture(id, { directory: d });
    expect(p.state).toBe("pending-approval");
    expect(p.receipt).toEqual(r);
    expect(await snapshot(d)).toEqual(before);
    expect(Object.isFrozen(p.receipt.release.binding)).toBe(true);
    expect(ControlledReproducerRunSchema.safeParse(r).success).toBe(false);
    expect(ControlledFixtureReproducerRunSchema.safeParse(r).success).toBe(false);
  });
  it.each(["clone", "json", "shallow"])(
    "refuses %s source artifacts before creating storage",
    async (mode) => {
      const p = await createOwnedPreflightParent();
      const d = await directory();
      const sourceRun =
        mode === "clone"
          ? structuredClone(p.sourceRun)
          : mode === "json"
            ? JSON.parse(JSON.stringify(p.sourceRun))
            : { ...p.sourceRun };
      await expect(
        stageOriginalFixtureParent({ ...p, sourceRun }, id, commit, { directory: d }),
      ).rejects.toThrow("REPLAY_MISMATCH");
      expect(await readdir(d)).toEqual([]);
    },
  );
  it.each(["report", "review", "identity"])("rejects altered %s before staging", async (kind) => {
    const p = await createOwnedPreflightParent();
    const d = await directory();
    if (kind === "report") {
      p.report = structuredClone(p.report);
      p.report.summary.durationMs++;
    }
    if (kind === "review") p.skepticReview = undefined as never;
    if (kind === "identity")
      p.sourceIdentity = { ...p.sourceIdentity, model: "different" } as never;
    await expect(stageOriginalFixtureParent(p, id, commit, { directory: d })).rejects.toThrow();
    expect(await readdir(d)).toEqual([]);
  });
  it("pending recovery does not expire, cancel, regenerate identity or dispatch", async () => {
    const d = await directory();
    const r = await stage(d);
    const before = await snapshot(d);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(r.release.expiresAt) + 1);
    expect(await recoverPendingFixture(id, { directory: d })).toMatchObject({
      state: "pending-approval",
      receipt: r,
    });
    expect((await previewPendingFixture(id, { directory: d })).receipt).toEqual(r);
    expect(await snapshot(d)).toEqual(before);
  });
  it("a fresh process previews the identical pending receipt with no registry/promotion/writes", async () => {
    const d = await directory();
    const r = await stage(d);
    const before = await snapshot(d);
    const cli = path.resolve("scripts/reproducer-preflight.ts");
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", cli, "preview", "--intent-id", id, "--directory", d],
      { cwd: process.cwd(), maxBuffer: 32768 },
    );
    const packet = JSON.parse(stdout);
    expect(packet.receipt).toEqual(r);
    expect(packet.receiptHash).toBe(hash(JSON.stringify(r)));
    expect(packet.state).toBe("pending-approval");
    expect(await snapshot(d)).toEqual(before);
  });
  it("no real invocation, observation publisher or bare approval flag exists", async () => {
    const d = await directory();
    await stage(d);
    const before = await snapshot(d);
    expect(() => invokeFixedRunner()).toThrow("REAL_RUNNER_DISABLED");
    expect(() => requestManualFixtureDispatch(id, { approved: true }, { directory: d })).toThrow(
      "REAL_RUNNER_DISABLED",
    );
    expect(() => publishControlledFixtureObservation({ provenance: "OBSERVED" })).toThrow(
      "HOST_EXECUTION_ATTESTATION_UNAVAILABLE",
    );
    expect(await snapshot(d)).toEqual(before);
  });
  it("packet bounds, fixed runtime configuration, body/manifest identity and privacy", async () => {
    const d = await directory();
    await stage(d);
    const packet = await renderPendingFixturePacket(id, { directory: d });
    expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThan(24 * 1024);
    const config = fixedRunnerReview();
    expect(config).toMatchObject({
      chromiumSandbox: true,
      memoryMax: 1073741824,
      pidsMax: 128,
      noNewPrivileges: true,
      hostCapabilities: 0,
      privateNetwork: true,
    });
    const body = "<!doctype html><title>Empty owned performance fixture</title>";
    expect(config.manifest.bodySha256).toBe(hash(body));
    expect(config.manifest.bodyBytes).toBe(Buffer.byteLength(body));
    expect(hash(JSON.stringify(config.manifest))).toBe(REAL_MANIFEST_HASH);
    const testSource = await readFile(
      new URL("../../../tests/browser-security/collector-fixtures.ts", import.meta.url),
      "utf8",
    );
    expect(testSource).toContain(`body = "${body}";`);
    const r = JSON.stringify(packet.receipt);
    for (const s of [
      "http:",
      "https:",
      "/collector/",
      "<title>",
      "Cookie",
      "Authorization",
      "claim statement",
    ])
      expect(r).not.toContain(s);
    const source = await readFile(new URL("./fixture-runner.ts", import.meta.url), "utf8");
    expect(source).not.toContain('from "@playwright');
    expect(source).not.toContain("tests/browser-security");
  });
});

describe("pending crash points and explicit terminal actions", () => {
  it.each([
    ["release.json:before-write", false],
    ["release.json:after-flush", false],
    ["release.json:after-publish", false],
    ["release.json:durable", false],
    ["ledger.json:before-write", false],
    ["ledger.json:after-flush", false],
    ["ledger.json:after-publish", true],
    ["ledger.json:durable", true],
    ["pending-durable", true],
    ["receipt.json:before-write", true],
    ["receipt.json:after-flush", true],
    ["receipt.json:after-publish", true],
    ["receipt.json:durable", true],
  ] as const)("handles %s without terminalizing a complete reservation", async (point, pending) => {
    const d = await directory();
    const p = await createOwnedPreflightParent();
    await expect(
      stageOriginalFixtureParent(p, id, commit, {
        directory: d,
        fault: (n) => {
          if (n === point) throw new Error("FAULT");
        },
      }),
    ).rejects.toThrow();
    if (!pending) {
      await expect(recoverPendingFixture(id, { directory: d })).rejects.toThrow();
      return;
    }
    const before = await snapshot(d);
    const preview = await previewPendingFixture(id, { directory: d });
    expect(preview.state).toBe("pending-approval");
    expect(await snapshot(d)).toEqual(before);
    expect(await recoverPendingFixture(id, { directory: d })).toMatchObject({
      receipt: preview.receipt,
      state: "pending-approval",
    });
    expect(await snapshot(d)).toEqual(before);
    const ledger = JSON.parse(await readFile(path.join(runDir(d), "ledger.json"), "utf8"));
    expect(ledger.receiptHash).toBe(preview.receiptHash);
  });
  it.each(["cancelled", "expired", "denied"] as const)(
    "terminalizes only explicit %s and never retries",
    async (action) => {
      const d = await directory();
      const receipt = await stage(d);
      if (action === "expired") {
        await expect(closePendingFixture(id, action, { directory: d })).rejects.toThrow();
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.parse(receipt.release.expiresAt) + 1);
      }
      const out = await closePendingFixture(id, action, { directory: d });
      expect(out).toMatchObject({
        status: "not-dispatched",
        reason: action,
        attempts: 0,
        observation: null,
      });
      expect(await recoverPendingFixture(id, { directory: d })).toEqual(out);
      const fake = vi.fn(async () => completed());
      expect(await dispatchFixtureFakeForTest(id, {}, fake, { directory: d })).toEqual(out);
      expect(fake).not.toHaveBeenCalled();
      await expect(
        stageOriginalFixtureParent(await createOwnedPreflightParent(), id, commit, {
          directory: d,
        }),
      ).rejects.toThrow("BINDING_MISMATCH");
    },
  );
});

describe("synthetic manual boundary, one attempt and durable recovery", () => {
  it("durably stores exact approval/marker/ledger before a fake attempt; replay never dispatches", async () => {
    const d = await directory();
    const r = await stage(d);
    const approval = mintSyntheticFixtureApproval(r);
    const fake = vi.fn(async () => {
      const ledger = JSON.parse(await readFile(path.join(runDir(d), "ledger.json"), "utf8"));
      const marker = await readFile(path.join(runDir(d), "dispatch.json"), "utf8");
      const a = await readFile(path.join(runDir(d), "approval.json"), "utf8");
      expect(ledger.dispatchHash).toBe(hash(marker));
      expect(ledger.approvalHash).toBe(hash(a));
      return completed();
    });
    const result = await dispatchFixtureFakeForTest(id, approval, fake, { directory: d });
    expect(result).toMatchObject({
      status: "simulated-completed",
      provenance: "SIMULATED",
      testOnly: true,
      observation: null,
    });
    expect(ControlledFixtureReproducerRunSchema.safeParse(result).success).toBe(false);
    expect(await dispatchFixtureFakeForTest(id, approval, fake, { directory: d })).toEqual(result);
    expect(await recoverPendingFixture(id, { directory: d })).toEqual(result);
    expect(fake).toHaveBeenCalledTimes(1);
  });
  it.each(["bare", "serialized", "mismatch"])(
    "rejects %s authority without approval/marker writes",
    async (mode) => {
      const d = await directory();
      const r = await stage(d);
      const before = await snapshot(d);
      const fake = vi.fn(async () => completed());
      const cap =
        mode === "bare"
          ? { approved: true }
          : mode === "serialized"
            ? JSON.parse(JSON.stringify(mintSyntheticFixtureApproval(r)))
            : mintSyntheticFixtureApproval({ ...r, releaseHash: "f".repeat(64) });
      await expect(dispatchFixtureFakeForTest(id, cap, fake, { directory: d })).rejects.toThrow(
        "BINDING_MISMATCH",
      );
      expect(fake).not.toHaveBeenCalled();
      expect(await snapshot(d)).toEqual(before);
    },
  );
  it("excludes concurrent manual attempts under the ledger lock", async () => {
    const d = await directory();
    const r = await stage(d);
    let entered!: () => void, finish!: () => void;
    const ready = new Promise<void>((done) => {
      entered = done;
    });
    const wait = new Promise<void>((done) => {
      finish = done;
    });
    const fake = vi.fn(async () => {
      entered();
      await wait;
      return completed();
    });
    const first = dispatchFixtureFakeForTest(id, mintSyntheticFixtureApproval(r), fake, {
      directory: d,
    });
    await ready;
    await expect(
      dispatchFixtureFakeForTest(id, mintSyntheticFixtureApproval(r), fake, { directory: d }),
    ).rejects.toThrow("STORE_BUSY");
    finish();
    await first;
    expect(fake).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["approval.json:before-write", "pending-approval"],
    ["approval.json:after-flush", "pending-approval"],
    ["approval.json:after-publish", "pending-approval"],
    ["approval.json:durable", "pending-approval"],
    ["dispatch.json:before-write", "pending-approval"],
    ["dispatch.json:after-flush", "pending-approval"],
    ["dispatch.json:after-publish", "outcome-unknown"],
    ["dispatch.json:durable", "outcome-unknown"],
    ["ledger.json:before-write", "outcome-unknown"],
    ["ledger.json:after-flush", "outcome-unknown"],
    ["ledger.json:after-publish", "outcome-unknown"],
    ["ledger.json:durable", "outcome-unknown"],
    ["dispatch-durable", "outcome-unknown"],
    ["executor-finished", "outcome-unknown"],
    ["result.json:before-write", "outcome-unknown"],
    ["result.json:after-flush", "outcome-unknown"],
    ["result.json:after-publish", "simulated-completed"],
    ["result.json:durable", "simulated-completed"],
  ] as const)("fault at %s recovers %s with no fake redispatch", async (point, expected) => {
    const d = await directory();
    const r = await stage(d);
    const fake = vi.fn(async () => completed());
    await expect(
      dispatchFixtureFakeForTest(id, mintSyntheticFixtureApproval(r), fake, {
        directory: d,
        fault: (p) => {
          if (p === point) throw new Error("FAULT");
        },
      }),
    ).rejects.toThrow();
    const calls = fake.mock.calls.length;
    const result = await recoverPendingFixture(id, { directory: d });
    expect("state" in result ? result.state : result.status).toBe(expected);
    expect(fake).toHaveBeenCalledTimes(calls);
    expect(await recoverPendingFixture(id, { directory: d })).toEqual(result);
  });
  it.each(["before-write", "after-flush", "after-publish", "durable"])(
    "reconciles terminal ledger %s after validated result publication",
    async (phase) => {
      const d = await directory();
      const r = await stage(d);
      const fake = vi.fn(async () => completed());
      let n = 0;
      await expect(
        dispatchFixtureFakeForTest(id, mintSyntheticFixtureApproval(r), fake, {
          directory: d,
          fault: (p) => {
            if (p === `ledger.json:${phase}` && ++n === 2) throw new Error("FAULT");
          },
        }),
      ).rejects.toThrow();
      expect(await recoverPendingFixture(id, { directory: d })).toMatchObject({
        status: "simulated-completed",
      });
      expect(fake).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["abort", "timeout"])(
    "consumes the attempt on %s and ignores late fake output",
    async (mode) => {
      const d = await directory();
      const r = await stage(d);
      const c = new AbortController();
      let ready!: () => void, finish!: (v: unknown) => void;
      const entered = new Promise<void>((done) => {
        ready = done;
      });
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
      let signal: AbortSignal | undefined;
      const fake = vi.fn(async (_cap: object, o: { signal: AbortSignal }) => {
        signal = o.signal;
        ready();
        return new Promise<unknown>((done) => {
          finish = done;
        });
      });
      const pending = dispatchFixtureFakeForTest(id, mintSyntheticFixtureApproval(r), fake, {
        directory: d,
        signal: c.signal,
      });
      await entered;
      if (mode === "abort") c.abort();
      else await vi.advanceTimersByTimeAsync(L.executorMs);
      const result = await pending;
      expect(result.status).toBe("outcome-unknown");
      expect(result.reason).toBe(mode === "abort" ? "cancelled" : "deadline");
      expect(signal?.aborted).toBe(true);
      finish(completed());
      await vi.advanceTimersByTimeAsync(0);
      expect(await recoverPendingFixture(id, { directory: d })).toEqual(result);
      expect(fake).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each([{ provenance: "OBSERVED" }, { ...completed(), html: "secret" }, "x".repeat(1025)])(
    "excludes untrusted/raw fake output %j",
    async (output) => {
      const d = await directory();
      const r = await stage(d);
      const result = await dispatchFixtureFakeForTest(
        id,
        mintSyntheticFixtureApproval(r),
        async () => output,
        { directory: d },
      );
      expect(result).toMatchObject({
        status: "outcome-unknown",
        reason: "invalid-output",
        observation: null,
      });
      expect(JSON.stringify(result)).not.toContain("secret");
    },
  );
});

describe("binding and durable-state corruption", () => {
  it("reconciles a second interruption while recovering an unrecorded marker without dispatch", async () => {
    const d = await directory();
    const r = await stage(d);
    const fake = vi.fn(async () => completed());
    await expect(
      dispatchFixtureFakeForTest(id, mintSyntheticFixtureApproval(r), fake, {
        directory: d,
        fault: (p) => {
          if (p === "dispatch.json:durable") throw new Error("FAULT");
        },
      }),
    ).rejects.toThrow();
    await expect(
      recoverPendingFixture(id, {
        directory: d,
        fault: (p) => {
          if (p === "ledger.json:before-write") throw new Error("FAULT");
        },
      }),
    ).rejects.toThrow();
    expect(await recoverPendingFixture(id, { directory: d })).toMatchObject({
      status: "outcome-unknown",
      reason: "recovered",
    });
    expect(fake).not.toHaveBeenCalled();
  });
  it("cancellation before the marker consumes no attempt and cannot resume", async () => {
    const d = await directory();
    const r = await stage(d);
    const c = new AbortController();
    c.abort();
    const fake = vi.fn(async () => completed());
    const result = await dispatchFixtureFakeForTest(id, mintSyntheticFixtureApproval(r), fake, {
      directory: d,
      signal: c.signal,
    });
    expect(result).toMatchObject({ status: "not-dispatched", reason: "cancelled", attempts: 0 });
    expect(fake).not.toHaveBeenCalled();
    expect(await readdir(runDir(d))).not.toContain("dispatch.json");
    expect(await dispatchFixtureFakeForTest(id, {}, fake, { directory: d })).toEqual(result);
    expect(fake).not.toHaveBeenCalled();
  });
  it("failure after durable marker has no raw exception or observation", async () => {
    const d = await directory();
    const r = await stage(d);
    const result = await dispatchFixtureFakeForTest(
      id,
      mintSyntheticFixtureApproval(r),
      async () => {
        throw new Error("DISPOSABLE_PRIVATE_ERROR");
      },
      { directory: d },
    );
    expect(result).toMatchObject({
      status: "outcome-unknown",
      reason: "executor-failure",
      observation: null,
    });
    const stored = await readFile(path.join(runDir(d), "result.json"), "utf8");
    expect(stored).not.toContain("DISPOSABLE_PRIVATE_ERROR");
  });
  it.each(["sourcePlanHash", "sourceRunHash", "sourcePolicyHash", "sourceRequestHash"])(
    "rejects altered source binding %s",
    async (key) => {
      const d = await directory();
      await stage(d);
      const file = path.join(runDir(d), "release.json");
      const value = JSON.parse(await readFile(file, "utf8"));
      value.binding[key] = "f".repeat(64);
      await writeFile(file, JSON.stringify(value));
      await expect(previewPendingFixture(id, { directory: d })).rejects.toThrow();
    },
  );
  it.each(["snapshotHash", "skepticReviewHash"])("rejects altered parent %s", async (key) => {
    const d = await directory();
    await stage(d);
    const file = path.join(runDir(d), "release.json");
    const value = JSON.parse(await readFile(file, "utf8"));
    value.binding.parent[key] = "f".repeat(64);
    await writeFile(file, JSON.stringify(value));
    await expect(previewPendingFixture(id, { directory: d })).rejects.toThrow();
  });
  it.each([
    "planHash",
    "intentHash",
    "authorizationHash",
    "fixtureManifestHash",
    "bodyHash",
    "runnerConfigHash",
    "policyHash",
    "schemasHash",
    "futureProofPolicyHash",
    "storageDirectoryHash",
    "storageHostHash",
    "inputSnapshotHash",
  ])("rejects release %s mismatch", async (field) => {
    const d = await directory();
    await stage(d);
    const file = path.join(runDir(d), "release.json");
    const x = JSON.parse(await readFile(file, "utf8"));
    x[field] = "f".repeat(64);
    await writeFile(file, JSON.stringify(x));
    await expect(previewPendingFixture(id, { directory: d })).rejects.toThrow();
    await expect(recoverPendingFixture(id, { directory: d })).rejects.toThrow();
  });
  it.each(["releaseHash", "receiptHash", "approvalHash", "dispatchHash", "resultHash"])(
    "rejects ledger %s mismatch",
    async (field) => {
      const d = await directory();
      const r = await stage(d);
      await dispatchFixtureFakeForTest(
        id,
        mintSyntheticFixtureApproval(r),
        async () => completed(),
        { directory: d },
      );
      const file = path.join(runDir(d), "ledger.json");
      const x = JSON.parse(await readFile(file, "utf8"));
      x[field] = "f".repeat(64);
      await writeFile(file, JSON.stringify(x));
      await expect(recoverPendingFixture(id, { directory: d })).rejects.toThrow();
    },
  );
  it.each(["approval.json", "dispatch.json", "result.json", "receipt.json"])(
    "rejects corrupt %s without retry",
    async (file) => {
      const d = await directory();
      const r = await stage(d);
      await dispatchFixtureFakeForTest(
        id,
        mintSyntheticFixtureApproval(r),
        async () => completed(),
        { directory: d },
      );
      await writeFile(path.join(runDir(d), file), "{");
      await expect(recoverPendingFixture(id, { directory: d })).rejects.toThrow("STORE_CORRUPT");
    },
  );
  it.each(["permissions", "symlink", "oversize"])("refuses %s pending input", async (kind) => {
    const d = await directory();
    await stage(d);
    const file = path.join(runDir(d), "release.json");
    if (kind === "permissions") await chmod(file, 0o644);
    if (kind === "symlink") {
      await rm(file);
      await symlink("ledger.json", file);
    }
    if (kind === "oversize") await writeFile(file, "x".repeat(L.releaseBytes + 1));
    await expect(previewPendingFixture(id, { directory: d })).rejects.toThrow();
  });
  it("rejects a renamed intent and simulated approval deletion after marker publication", async () => {
    const d = await directory();
    const r = await stage(d);
    await rename(runDir(d), path.join(d, "controlled-fixture-v1", "different-intent-001"));
    await expect(previewPendingFixture("different-intent-001", { directory: d })).rejects.toThrow(
      "BINDING_MISMATCH",
    );
    await rename(path.join(d, "controlled-fixture-v1", "different-intent-001"), runDir(d));
    await dispatchFixtureFakeForTest(id, mintSyntheticFixtureApproval(r), async () => completed(), {
      directory: d,
    });
    await rm(path.join(runDir(d), "approval.json"));
    await expect(recoverPendingFixture(id, { directory: d })).rejects.toThrow("STORE_CORRUPT");
  });
});
