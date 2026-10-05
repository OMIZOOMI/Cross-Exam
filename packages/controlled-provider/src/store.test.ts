import { fork } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ScanReportSchema } from "@crossexam/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hash } from "../../agents/src/provider";
import { createOpenAIProvider } from "../../provider-openai/src/index";
import {
  completed,
  explorerProposal,
  jsonResponse,
  validTransport,
} from "../../provider-openai/src/test-fixtures";
import {
  createControlledRelease,
  ownedNumericFixture,
  recoverControlledProvider,
  runControlledProvider,
  runWithStore,
} from "./index";
import { RUN_LIMITS } from "./release";
import { RunStore } from "./storage";

const directories: string[] = [];
const directory = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "crossexam-provider-"));
  directories.push(dir);
  return dir;
};
afterEach(async () => {
  vi.useRealTimers();
  for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true });
});
const fixture = ownedNumericFixture;
const release = () => createControlledRelease("owned-release-1");
function fake() {
  const bodies: string[] = [];
  const transport = vi.fn(validTransport((b) => bodies.push(b)));
  return { transport, bodies, config: createOpenAIProvider({ transport }) };
}

describe("controlled fixture release admission", () => {
  it.each([
    "missing-release",
    "live",
    "wrong-key",
    "wrong-profile",
    "wrong-snapshot",
    "empty-catalog",
    "existing-overlay",
    "wrong-schema",
    "wrong-export-policy",
  ])("rejects %s before any dispatch or reservation", async (defect) => {
    const report = structuredClone(fixture());
    let bound: unknown = structuredClone(release());
    const r = bound as Record<string, unknown>;
    if (defect === "missing-release") bound = undefined;
    if (defect === "live") {
      report.summary.source = "live";
      report.evidence.forEach((e) => {
        e.source = "live";
      });
    }
    if (defect === "wrong-key") r.fixtureKey = "unapproved";
    if (defect === "wrong-profile") r.profile = "other";
    if (defect === "wrong-snapshot") r.snapshotHash = "a".repeat(64);
    if (defect === "empty-catalog")
      report.evidence.forEach((e) => {
        e.collector = "excluded";
      });
    if (defect === "existing-overlay") report.tribunalRuns.push({} as never);
    if (defect === "wrong-schema") r.reportSchemaVersion = 1;
    if (defect === "wrong-export-policy") r.exportPolicy = "unapproved";
    const f = fake();
    const dir = await directory();
    await expect(
      runControlledProvider(report, bound, f.config, { directory: dir }),
    ).rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });
  it.each(["model", "provider", "executionProfile", "endpoint"])(
    "rejects configuration override %s",
    async (key) => {
      const f = fake();
      await expect(
        runControlledProvider(
          fixture(),
          release(),
          { ...f.config, [key]: "unapproved" },
          { directory: await directory() },
        ),
      ).rejects.toThrow("PROVIDER_CONFIGURATION_DENIED");
      expect(f.transport).not.toHaveBeenCalled();
    },
  );
  it("requires explicit release ID and no silently generated release", () => {
    expect(() => createControlledRelease("")).toThrow();
    expect(() => createControlledRelease("../escape")).toThrow();
    expect(() => createControlledRelease(undefined as never)).toThrow();
  });
});

describe("durable canonical publication", () => {
  it("stores only validated canonical checkpoints and final result with original IDs on replay", async () => {
    const f = fake();
    const dir = await directory();
    const receipt = await runControlledProvider(fixture(), release(), f.config, { directory: dir });
    expect(receipt.status).toBe("completed");
    expect(ScanReportSchema.safeParse(receipt.report).success).toBe(true);
    expect(f.transport).toHaveBeenCalledTimes(2);
    const replay = await runControlledProvider(fixture(), release(), f.config, { directory: dir });
    const recovery = await recoverControlledProvider(fixture(), release(), { directory: dir });
    expect(replay.report).toEqual(receipt.report);
    expect(recovery.resultHash).toBe(receipt.resultHash);
    expect(f.transport).toHaveBeenCalledTimes(2);
    const runDir = path.join(dir, release().releaseId);
    const files = await readdir(runDir);
    expect(files.sort()).toEqual([
      "Breaker.json",
      "Explorer.json",
      "input.json",
      "ledger.json",
      "result.json",
    ]);
    const ledger = JSON.parse(await readFile(path.join(runDir, "ledger.json"), "utf8"));
    expect(ledger.complete).toBe(true);
    for (const [index, role] of ["Explorer", "Breaker"].entries())
      expect(ledger.roles[role].dispatchHash).toBe(hash(f.bodies[index] as string));
    for (const name of files) {
      const s = await lstat(path.join(runDir, name));
      expect(s.mode & 0o777).toBe(0o600);
      const text = await readFile(path.join(runDir, name), "utf8");
      for (const marker of [
        "DISCARD_REASONING",
        "output_text",
        "encrypted_content",
        "apiKey",
        "Authorization",
        "input_tokens",
        "output_tokens",
      ])
        expect(text).not.toContain(marker);
    }
    expect((await lstat(runDir)).mode & 0o777).toBe(0o700);
    expect(receipt.resultHash).toBe(hash(await readFile(path.join(runDir, "result.json"), "utf8")));
  });
  it("Explorer accepted then Breaker fails without losing authorized claims", async () => {
    let n = 0;
    const transport = vi.fn<typeof fetch>(async () =>
      ++n === 1
        ? jsonResponse(completed())
        : jsonResponse(
            { error: { message: "DISCARD_ERROR", code: "credit_balance_exhausted" } },
            429,
          ),
    );
    const out = await runControlledProvider(
      fixture(),
      release(),
      createOpenAIProvider({ transport }),
      { directory: await directory() },
    );
    const run = out.report?.tribunalRuns[0];
    expect(run?.status).toBe("partial");
    expect(run?.claims).toHaveLength(1);
    expect(run?.challenges).toEqual([]);
    expect(run?.agentRuns[1].status).toBe("quota-blocked");
    expect(JSON.stringify(out)).not.toContain("DISCARD_ERROR");
  });
  it("empty Explorer skips Breaker, persists actual skipped audit and no dispatch marker", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      jsonResponse(completed({ schemaVersion: 1, claims: [] })),
    );
    const dir = await directory();
    const out = await runControlledProvider(
      fixture(),
      release(),
      createOpenAIProvider({ transport }),
      { directory: dir },
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(out.report?.tribunalRuns[0]?.agentRuns[1].calls).toBe(0);
    const ledger = JSON.parse(
      await readFile(path.join(dir, release().releaseId, "ledger.json"), "utf8"),
    );
    expect(ledger.roles.Breaker.dispatchHash).toBeNull();
    expect(ledger.roles.Breaker.checkpointHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("valid empty Breaker completes, does not fabricate agreement or verdict", async () => {
    let n = 0;
    const transport = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        completed(++n === 1 ? explorerProposal() : { schemaVersion: 1, challenges: [] }),
      ),
    );
    const out = await runControlledProvider(
      fixture(),
      release(),
      createOpenAIProvider({ transport }),
      { directory: await directory() },
    );
    expect(out.report?.tribunalRuns[0]?.status).toBe("completed");
    expect(out.report?.verdicts).toEqual([]);
  });
  it("concurrent commands cannot dispatch the same release twice", async () => {
    const f = fake();
    const dir = await directory();
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        runControlledProvider(fixture(), release(), f.config, { directory: dir }),
      ),
    );
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(f.transport).toHaveBeenCalledTimes(2);
    const recovered = await recoverControlledProvider(fixture(), release(), { directory: dir });
    expect(recovered.status).toBe("completed");
  });
  it("fails closed at 20 admitted run directories without pruning releases", async () => {
    const dir = await directory();
    for (let i = 0; i < RUN_LIMITS.runs; i++) {
      const bound = createControlledRelease(`admitted-${i}`);
      await recoverControlledProvider(fixture(), bound, { directory: dir });
    }
    const f = fake();
    await expect(
      runControlledProvider(fixture(), release(), f.config, { directory: dir }),
    ).rejects.toThrow("STORE_CAPACITY");
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("cancelled run never authorizes late provider claims and never retries", async () => {
    const controller = new AbortController();
    controller.abort();
    const f = fake();
    const dir = await directory();
    const out = await runControlledProvider(fixture(), release(), f.config, {
      directory: dir,
      signal: controller.signal,
    });
    expect(out.report?.tribunalRuns[0]?.status).toBe("aborted");
    expect(f.transport).not.toHaveBeenCalled();
    await runControlledProvider(fixture(), release(), f.config, { directory: dir });
    expect(f.transport).not.toHaveBeenCalled();
  });
});

describe("fault-injected recovery without provider calls", () => {
  const cases: [string, number, string][] = [
    ["reserved", 0, "not-dispatched"],
    ["Explorer:dispatch-consumed", 0, "outcome-unknown"],
    ["Explorer.json:before-write", 1, "outcome-unknown"],
    ["Explorer.json:after-flush", 1, "outcome-unknown"],
    ["Explorer.json:after-publish", 1, "interrupted"],
    ["Explorer.json:durable", 1, "interrupted"],
    ["Explorer:checkpoint-durable", 1, "interrupted"],
    ["Breaker:dispatch-consumed", 1, "outcome-unknown"],
    ["Breaker.json:before-write", 2, "outcome-unknown"],
    ["Breaker.json:after-flush", 2, "outcome-unknown"],
    ["Breaker.json:after-publish", 2, "completed"],
    ["Breaker:checkpoint-durable", 2, "completed"],
    ["before-final-publication", 2, "completed"],
    ["result.json:before-write", 2, "completed"],
    ["result.json:after-flush", 2, "completed"],
    ["result.json:after-publish", 2, "completed"],
    ["result.json:durable", 2, "completed"],
    ["result-durable", 2, "completed"],
    ["completed", 2, "completed"],
  ];
  it.each(cases)(
    "%s preserves slots/records (calls %d, recovery %s)",
    async (point, count, status) => {
      const f = fake();
      const dir = await directory();
      const store = new RunStore(dir, (p) => {
        if (p === point) throw new Error("FAULT");
      });
      await expect(runWithStore(fixture(), release(), f.config, store)).rejects.toThrow();
      expect(f.transport).toHaveBeenCalledTimes(count);
      const before = await readFile(
        path.join(dir, release().releaseId, "Explorer.json"),
        "utf8",
      ).catch(() => null);
      const out = await recoverControlledProvider(fixture(), release(), { directory: dir });
      expect(out.status).toBe(status);
      if (before) {
        const cp = JSON.parse(before);
        expect(out.explorer?.claims ?? out.report?.tribunalRuns[0]?.claims).toEqual(cp.claims);
      }
      await runControlledProvider(fixture(), release(), f.config, { directory: dir });
      expect(f.transport).toHaveBeenCalledTimes(count);
    },
  );
  it.each([
    "input.json:before-write",
    "input.json:after-flush",
    "input.json:after-publish",
    "ledger.json:before-write",
    "ledger.json:after-flush",
  ])("missing required initial artifacts %s fails closed", async (point) => {
    const f = fake();
    const dir = await directory();
    await expect(
      runWithStore(
        fixture(),
        release(),
        f.config,
        new RunStore(dir, (p) => {
          if (p === point) throw new Error("FAULT");
        }),
      ),
    ).rejects.toThrow();
    await expect(
      recoverControlledProvider(fixture(), release(), { directory: dir }),
    ).rejects.toThrow("STORE_CORRUPT");
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("ledger flush failure consuming Explorer prevents dispatch", async () => {
    let writes = 0;
    const f = fake();
    const dir = await directory();
    const store = new RunStore(dir, (p) => {
      if (p === "ledger.json:after-flush" && ++writes === 2) throw new Error("FAULT");
    });
    await expect(runWithStore(fixture(), release(), f.config, store)).rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
    expect((await recoverControlledProvider(fixture(), release(), { directory: dir })).status).toBe(
      "not-dispatched",
    );
  });
  it("ledger publication failure after consumption forbids dispatch/replay", async () => {
    let writes = 0;
    const f = fake();
    const dir = await directory();
    const store = new RunStore(dir, (p) => {
      if (p === "ledger.json:after-publish" && ++writes === 2) throw new Error("FAULT");
    });
    await expect(runWithStore(fixture(), release(), f.config, store)).rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
    expect((await recoverControlledProvider(fixture(), release(), { directory: dir })).status).toBe(
      "outcome-unknown",
    );
  });
  it.each(["Explorer.json", "Breaker.json", "result.json", "input.json", "ledger.json"])(
    "corrupt required artifact %s fails closed",
    async (name) => {
      const f = fake();
      const dir = await directory();
      await runControlledProvider(fixture(), release(), f.config, { directory: dir });
      await writeFile(path.join(dir, release().releaseId, name), "{}", { mode: 0o600 });
      await expect(
        recoverControlledProvider(fixture(), release(), { directory: dir }),
      ).rejects.toThrow("STORE_CORRUPT");
      expect(f.transport).toHaveBeenCalledTimes(2);
    },
  );
  it.each(["Explorer.json", "Breaker.json", "result.json", "input.json", "ledger.json"])(
    "missing expected artifact %s fails closed",
    async (name) => {
      const f = fake();
      const dir = await directory();
      await runControlledProvider(fixture(), release(), f.config, { directory: dir });
      await unlink(path.join(dir, release().releaseId, name));
      await expect(
        recoverControlledProvider(fixture(), release(), { directory: dir }),
      ).rejects.toThrow("STORE_CORRUPT");
    },
  );
  it("symlink/writable artifact is rejected rather than followed", async () => {
    const f = fake();
    const dir = await directory();
    await runControlledProvider(fixture(), release(), f.config, { directory: dir });
    const file = path.join(dir, release().releaseId, "input.json");
    await chmod(file, 0o644);
    await expect(
      recoverControlledProvider(fixture(), release(), { directory: dir }),
    ).rejects.toThrow("STORE_CORRUPT");
    await unlink(file);
    await symlink(path.join(dir, release().releaseId, "result.json"), file);
    await expect(
      recoverControlledProvider(fixture(), release(), { directory: dir }),
    ).rejects.toThrow("STORE_CORRUPT");
  });
  it("old living owner lock is not stolen", async () => {
    const store = new RunStore(await directory());
    const owner = await store.lock(store.directory);
    await expect(store.lock(store.directory)).rejects.toThrow("STORE_BUSY");
    await owner();
  });
});

const child = (dir: string, mode: string) =>
  new Promise<{ code: number | null; message: unknown }>((resolve, reject) => {
    const proc = fork(
      path.resolve("packages/controlled-provider/src/process-fixture.ts"),
      [dir, mode],
      { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    let message: unknown;
    let stderr = "";
    proc.on("message", (m) => {
      message = m;
    });
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("error", reject);
    proc.on("exit", (code) => (stderr ? reject(new Error(stderr)) : resolve({ code, message })));
  });
describe("separate-process admission and real process interruption", () => {
  it("two independent processes share one release and two total role slots", async () => {
    const dir = await directory();
    const results = await Promise.all([child(dir, "run"), child(dir, "run")]);
    expect(results.some((r) => r.code === 0)).toBe(true);
    const calls = await readFile(path.join(dir, "calls.txt"), "utf8");
    expect(calls.trim().split("\n")).toHaveLength(2);
    const out = await recoverControlledProvider(fixture(), release(), { directory: dir });
    expect(out.status).toBe("completed");
  });
  it.each([
    "Explorer:dispatch-consumed",
    "Explorer:checkpoint-durable",
    "Breaker:dispatch-consumed",
    "Breaker:checkpoint-durable",
    "result-durable",
    "completed",
  ])("process crash at %s retains dead-owner recovery and no dispatch replay", async (point) => {
    const dir = await directory();
    expect((await child(dir, point)).code).toBe(17);
    const before = await readFile(path.join(dir, "calls.txt"), "utf8").catch(() => "");
    const out = await recoverControlledProvider(fixture(), release(), { directory: dir });
    expect(["completed", "interrupted", "outcome-unknown"]).toContain(out.status);
    const f = fake();
    await runControlledProvider(fixture(), release(), f.config, { directory: dir });
    expect(f.transport).not.toHaveBeenCalled();
    expect(await readFile(path.join(dir, "calls.txt"), "utf8").catch(() => "")).toBe(before);
  });
});
