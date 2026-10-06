import { constants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import {
  createReproducerSession,
  createSkepticSession,
  createTribunalSession,
} from "@crossexam/agents";
import {
  ControlledReproducerRunSchema,
  CONTROLLED_REPRODUCER_LIMITS as L,
  ScanReportSchema,
} from "@crossexam/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveReportFixture } from "../../../tests/fixtures/live-report";
import { hash } from "../../agents/src/provider";
import { FIXTURE_MANIFEST_HASH } from "./fixture-manifest";
import {
  inspectOfflineCapability,
  recoverControlledReproducer,
  runOfflineControlledReproducer,
} from "./index";

const dirs: string[] = [];
const response = (payload: unknown) => ({ kind: "response" as const, payload });
const fakeOutput = () => ({ kind: "simulated-completed", provenance: "SIMULATED", testOnly: true });
const intent = (intentId = "offline-test-001") => ({
  schemaVersion: 1,
  intentId,
  executionMode: "injected-fake",
  testOnly: true,
  operationId: "controlled-fixture-empty-navigation-v1",
  fixtureKey: "browser-empty-navigation-v1",
});
const executor = () => ({
  executionMode: "injected-fake" as const,
  execute: vi.fn(async () => fakeOutput()),
});
async function directory() {
  const d = await mkdtemp(path.join(tmpdir(), "ce-controlled-reproducer-"));
  dirs.push(d);
  return d;
}
async function parent(
  category = "reproduction-gap",
  optionalReview = false,
  simulatedSource = false,
) {
  const report = liveReportFixture("scan-controlled-owned");
  delete report.investigation;
  report.summary.source = "fixture";
  for (const e of report.evidence) {
    e.source = "fixture";
    e.collector = "http-document-v1";
  }
  const r = await createTribunalSession(ScanReportSchema.parse(report), {
    Explorer: {
      provider: "fake-explorer",
      model: "fake",
      adapter: {
        run: async () =>
          response({
            schemaVersion: 1,
            claims: [
              {
                statement: "One bounded document observation.",
                scope: { observation: "One document.", conditions: [], limitations: [] },
                falsifier: "A repeat differs.",
                evidenceIds: ["E-001"],
              },
            ],
          }),
      },
    },
    Breaker: {
      provider: "fake-breaker",
      model: "fake",
      adapter: {
        run: async (v) =>
          response({
            schemaVersion: 1,
            challenges: [
              {
                claimId: v.view.claims[0]?.id,
                category,
                question: "Was this observation repeated?",
                evidenceIds: ["E-001"],
              },
            ],
          }),
      },
    },
  }).run();
  const review = optionalReview
    ? await createSkepticSession(r, {
        executionMode: "injected-fake",
        provider: "fake-skeptic",
        model: "fake",
        adapter: {
          run: async (v) =>
            response({
              schemaVersion: 1,
              challenges: [
                {
                  claimId: v.view.claims[0]?.id,
                  category: "reproduction-gap",
                  question: "Can this observation be repeated?",
                  evidenceIds: ["E-001"],
                  relatedChallengeIds: [],
                },
              ],
            }),
        },
      }).run()
    : undefined;
  const sourceIdentity = { provider: "fake-reproducer", model: "fake" };
  const sourceRun = await createReproducerSession(
    r,
    {
      executionMode: "injected-fake",
      ...sourceIdentity,
      ...(simulatedSource
        ? {
            executor: {
              execute: async () => ({
                kind: "result",
                result: { schemaVersion: 1, provenance: "SIMULATED", code: "FAKE_COMPLETED" },
              }),
            },
          }
        : {}),
      planner: {
        run: async () =>
          response({
            schemaVersion: 1,
            plans: [
              {
                claimId: r.tribunalRuns[0]?.claims[0]?.id,
                challengeId:
                  review?.challenges[0]?.challenge.id ?? r.tribunalRuns[0]?.challenges[0]?.id,
                evidenceIds: ["E-001"],
                operationId: "fixture-document-repeat-v1",
              },
            ],
          }),
      },
    },
    { skepticReview: review },
  ).run();
  return { report: r, sourceRun, sourceIdentity, skepticReview: review, intent: intent() };
}
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("authentic offline promotion and durable one-attempt boundary", () => {
  it("promotes an original run, ignores fake execution, reserves new identities and replays without calls", async () => {
    const input = await parent();
    const original = JSON.stringify(input);
    const d = await directory();
    const e = executor();
    let seen: object | undefined;
    e.execute.mockImplementation(async (c?: object) => {
      seen = c;
      expect(inspectOfflineCapability(c as object)).toBe(intent().operationId);
      return fakeOutput();
    });
    const result = await runOfflineControlledReproducer(input, e, { directory: d });
    expect(result).toMatchObject({
      status: "completed",
      relation: "lineage-only",
      claimTested: false,
      challengeResolved: false,
      attempts: 1,
      observation: null,
      simulated: fakeOutput(),
    });
    expect(result.release.binding.parent).toEqual(input.sourceRun.parent);
    expect(result.release.binding.sourcePlanHash).toBe(
      hash(JSON.stringify(input.sourceRun.plans[0])),
    );
    expect(result.release.binding.sourceRunHash).toBe(hash(JSON.stringify(input.sourceRun)));
    expect(result.release.planHash).toBe(hash(JSON.stringify(result.release.plan)));
    expect(result.release.intentHash).toBe(hash(JSON.stringify(input.intent)));
    expect(result.release.plan).toMatchObject({
      operationId: intent().operationId,
      fixtureKey: intent().fixtureKey,
      relation: "lineage-only",
      claimTested: false,
      challengeResolved: false,
    });
    expect(result.release.planId).not.toBe(input.sourceRun.plans[0]?.id);
    expect(result.release.authorizationId).not.toBe(input.sourceRun.authorization?.planId);
    expect(result.release.fixtureManifestHash).toBe(FIXTURE_MANIFEST_HASH);
    expect(Object.isFrozen(result.release.binding.parent)).toBe(true);
    expect(JSON.stringify(input)).toBe(original);
    expect(ControlledReproducerRunSchema.safeParse(result).success).toBe(true);
    expect(await runOfflineControlledReproducer(input, e, { directory: d })).toEqual(result);
    expect(await recoverControlledReproducer(intent().intentId, { directory: d })).toEqual(result);
    expect(e.execute).toHaveBeenCalledTimes(1);
    expect(() => inspectOfflineCapability(seen as object)).toThrow("BINDING_MISMATCH");
    expect(() => inspectOfflineCapability({})).toThrow("BINDING_MISMATCH");
    const root = path.join(d, intent().intentId);
    expect((await lstat(root)).mode & 0o777).toBe(0o700);
    for (const name of await readdir(root)) {
      expect((await lstat(path.join(root, name))).mode & 0o777).toBe(0o600);
    }
  });
  it("ignores source fake authorization/results instead of upgrading them", async () => {
    const input = await parent("reproduction-gap", false, true);
    expect(input.sourceRun.execution.result?.provenance).toBe("SIMULATED");
    const result = await runOfflineControlledReproducer(input, undefined, {
      directory: await directory(),
    });
    expect(result.status).toBe("not-dispatched");
    expect(result.observation).toBeNull();
    expect(result.simulated).toBeNull();
    expect(result.release.authorizationId).not.toBe(input.sourceRun.authorization?.planId);
  });
  it.each(["empty", "all-rejected"])(
    "rejects genuine %s planning before controlled reservation",
    async (kind) => {
      const input = await parent();
      const p = input.sourceRun.plans[0];
      if (!p) throw new Error("TEST_PLAN_MISSING");
      input.sourceRun = await createReproducerSession(input.report, {
        executionMode: "injected-fake",
        ...input.sourceIdentity,
        planner: {
          run: async () =>
            response({
              schemaVersion: 1,
              plans:
                kind === "empty"
                  ? []
                  : [
                      {
                        claimId: p.claimId,
                        challengeId: p.challengeId,
                        operationId: p.operationId,
                        evidenceIds: ["missing"],
                      },
                    ],
            }),
        },
      }).run();
      const d = await directory();
      const e = executor();
      await expect(runOfflineControlledReproducer(input, e, { directory: d })).rejects.toThrow(
        "INVALID_PARENT",
      );
      expect(await readdir(d)).toEqual([]);
      expect(e.execute).not.toHaveBeenCalled();
    },
  );
  it.each(["clone", "json", "reconstructed"])(
    "rejects %s before reservation or dispatch",
    async (kind) => {
      const input = await parent();
      const d = await directory();
      const e = executor();
      input.sourceRun =
        kind === "clone"
          ? structuredClone(input.sourceRun)
          : kind === "json"
            ? JSON.parse(JSON.stringify(input.sourceRun))
            : { ...input.sourceRun };
      await expect(runOfflineControlledReproducer(input, e, { directory: d })).rejects.toThrow(
        "REPLAY_MISMATCH",
      );
      expect(await readdir(d)).toEqual([]);
      expect(e.execute).not.toHaveBeenCalled();
    },
  );
  it.each(["report", "review", "provider", "model"])("rejects changed current %s", async (kind) => {
    const input = await parent("reproduction-gap", true);
    const d = await directory();
    const e = executor();
    if (kind === "report") {
      const r = structuredClone(input.report);
      if (r.evidence[0]) r.evidence[0].detail = "Changed bounded document.";
      input.report = r;
    }
    if (kind === "review") input.skepticReview = undefined;
    if (kind === "provider") input.sourceIdentity.provider = "different-fake";
    if (kind === "model") input.sourceIdentity.model = "different-fake";
    await expect(runOfflineControlledReproducer(input, e, { directory: d })).rejects.toThrow();
    expect(await readdir(d)).toEqual([]);
    expect(e.execute).not.toHaveBeenCalled();
  });
  it.each(["collection-limitation", "unsupported-causality", "overbroad-scope"])(
    "rejects category %s",
    async (category) => {
      const input = await parent(category);
      const d = await directory();
      const e = executor();
      await expect(runOfflineControlledReproducer(input, e, { directory: d })).rejects.toThrow(
        "INVALID_PARENT",
      );
      expect(e.execute).not.toHaveBeenCalled();
    },
  );
  it("binds the matching optional review and rejects different authentic parent reuse", async () => {
    const input = await parent("reproduction-gap", true);
    const d = await directory();
    const e = executor();
    const result = await runOfflineControlledReproducer(input, e, { directory: d });
    expect(result.release.binding.parent.skepticReviewHash).toBe(
      input.sourceRun.parent.skepticReviewHash,
    );
    const other = await parent();
    await expect(runOfflineControlledReproducer(other, e, { directory: d })).rejects.toThrow(
      "BINDING_MISMATCH",
    );
    expect(e.execute).toHaveBeenCalledTimes(1);
  });
  it("serializes concurrent admission with only one dispatch", async () => {
    const input = await parent();
    const d = await directory();
    const e = executor();
    const results = await Promise.allSettled([
      runOfflineControlledReproducer(input, e, { directory: d }),
      runOfflineControlledReproducer(input, e, { directory: d }),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    for (const result of results)
      if (result.status === "rejected") expect(result.reason.code).toBe("STORE_BUSY");
    expect(e.execute).toHaveBeenCalledTimes(1);
    expect((await recoverControlledReproducer(intent().intentId, { directory: d })).attempts).toBe(
      1,
    );
  });
  it.each([
    { ...fakeOutput(), provenance: "OBSERVED" },
    { ...fakeOutput(), url: "secret-url" },
    { body: "secret-body" },
    { kind: "result", observation: {} },
    "x".repeat(L.executorBytes + 1),
  ])("never promotes fake/raw output to observed evidence %j", async (output) => {
    const input = await parent();
    const d = await directory();
    const e = { executionMode: "injected-fake" as const, execute: vi.fn(async () => output) };
    const result = await runOfflineControlledReproducer(input, e, { directory: d });
    expect(result.status).toBe("outcome-unknown");
    expect(result.observation).toBeNull();
    expect(result.simulated).toBeNull();
    expect(JSON.stringify(result)).not.toContain("secret-");
    await runOfflineControlledReproducer(input, e, { directory: d });
    expect(e.execute).toHaveBeenCalledTimes(1);
  });
  it("pre-abort and missing executor finalize without dispatch; a new explicit intent is required", async () => {
    const input = await parent();
    const d = await directory();
    const e = executor();
    const c = new AbortController();
    c.abort();
    expect(
      (await runOfflineControlledReproducer(input, e, { directory: d, signal: c.signal })).status,
    ).toBe("aborted");
    await runOfflineControlledReproducer(input, e, { directory: d });
    expect(e.execute).not.toHaveBeenCalled();
    input.intent = intent("offline-test-002");
    expect((await runOfflineControlledReproducer(input, undefined, { directory: d })).status).toBe(
      "not-dispatched",
    );
    input.intent = intent("offline-test-003");
    expect((await runOfflineControlledReproducer(input, e, { directory: d })).status).toBe(
      "completed",
    );
    expect(e.execute).toHaveBeenCalledTimes(1);
  });
  it.each(["abort", "timeout"])("rejects late output after %s and never retries", async (mode) => {
    const input = await parent();
    const d = await directory();
    const c = new AbortController();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    let ready!: () => void;
    const entered = new Promise<void>((r) => {
      ready = r;
    });
    let finish!: (v: unknown) => void;
    let signal: AbortSignal | undefined;
    const e = {
      executionMode: "injected-fake" as const,
      execute: vi.fn(async (_cap: object, options: { signal: AbortSignal }) => {
        signal = options.signal;
        ready();
        return new Promise<unknown>((r) => {
          finish = r;
        });
      }),
    };
    const pending = runOfflineControlledReproducer(input, e, { directory: d, signal: c.signal });
    await entered;
    if (mode === "abort") c.abort();
    else await vi.advanceTimersByTimeAsync(L.executorMs);
    const result = await pending;
    expect(result.status).toBe("outcome-unknown");
    expect(result.reason).toBe(mode === "abort" ? "cancelled" : "deadline");
    expect(signal?.aborted).toBe(true);
    finish(fakeOutput());
    await vi.advanceTimersByTimeAsync(0);
    expect(await recoverControlledReproducer(intent().intentId, { directory: d })).toEqual(result);
    expect(e.execute).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retains no raw exceptions, bodies, paths or collection and leaves report arrays unchanged", async () => {
    const input = await parent();
    const d = await directory();
    const original = JSON.stringify(input.report);
    const result = await runOfflineControlledReproducer(
      input,
      {
        executionMode: "injected-fake",
        execute: async () => {
          throw new Error("secret-exception");
        },
      },
      { directory: d },
    );
    const raw = await readFile(path.join(d, intent().intentId, "result.json"), "utf8");
    for (const marker of [
      "OBSERVED",
      "secret-exception",
      "/collector/",
      "https://",
      "html",
      "headers",
      "findings",
      "verdicts",
    ])
      expect(raw).not.toContain(marker);
    expect(result.status).toBe("outcome-unknown");
    expect(JSON.stringify(input.report)).toBe(original);
  });
});

describe("fault-point recovery, tampering and private storage", () => {
  it.each([
    ["release.json:before-write", 1, "corrupt"],
    ["release.json:after-flush", 1, "corrupt"],
    ["release.json:after-publish", 1, "corrupt"],
    ["ledger.json:before-write", 1, "corrupt"],
    ["ledger.json:after-flush", 1, "corrupt"],
    ["ledger.json:after-publish", 1, "not-dispatched"],
    ["ledger.json:durable", 1, "not-dispatched"],
    ["reserved", 1, "not-dispatched"],
    ["dispatch.json:before-write", 1, "not-dispatched"],
    ["dispatch.json:after-flush", 1, "not-dispatched"],
    ["dispatch.json:after-publish", 1, "outcome-unknown"],
    ["dispatch.json:durable", 1, "outcome-unknown"],
    ["ledger.json:before-write", 2, "outcome-unknown"],
    ["ledger.json:after-flush", 2, "outcome-unknown"],
    ["ledger.json:after-publish", 2, "outcome-unknown"],
    ["ledger.json:durable", 2, "outcome-unknown"],
    ["dispatch-durable", 1, "outcome-unknown"],
    ["executor-finished", 1, "outcome-unknown"],
    ["result.json:before-write", 1, "outcome-unknown"],
    ["result.json:after-flush", 1, "outcome-unknown"],
    ["result.json:after-publish", 1, "completed"],
    ["result.json:durable", 1, "completed"],
    ["ledger.json:before-write", 3, "completed"],
    ["ledger.json:after-flush", 3, "completed"],
    ["ledger.json:after-publish", 3, "completed"],
    ["ledger.json:durable", 3, "completed"],
  ] as const)(
    "recovers %s occurrence %s as %s without redispatch",
    async (point, occurrence, expected) => {
      const input = await parent();
      const d = await directory();
      const e = executor();
      let n = 0;
      await expect(
        runOfflineControlledReproducer(input, e, {
          directory: d,
          fault: (name) => {
            if (name === point && ++n === occurrence) throw new Error("injected-crash-point");
          },
        }),
      ).rejects.toThrow();
      const calls = e.execute.mock.calls.length;
      if (expected === "corrupt")
        await expect(
          recoverControlledReproducer(intent().intentId, { directory: d }),
        ).rejects.toThrow("STORE_CORRUPT");
      else {
        const recovered = await recoverControlledReproducer(intent().intentId, { directory: d });
        expect(recovered.status).toBe(expected);
        expect(await runOfflineControlledReproducer(input, e, { directory: d })).toEqual(recovered);
      }
      expect(e.execute).toHaveBeenCalledTimes(calls);
    },
  );
  it.each([false, true])(
    "rejects completed result with lost dispatch ledger hash (complete=%s)",
    async (complete) => {
      const input = await parent();
      const d = await directory();
      const e = executor();
      await runOfflineControlledReproducer(input, e, { directory: d });
      const file = path.join(d, intent().intentId, "ledger.json");
      const ledger = JSON.parse(await readFile(file, "utf8"));
      ledger.dispatchHash = null;
      ledger.complete = complete;
      if (!complete) ledger.resultHash = null;
      await writeFile(file, JSON.stringify(ledger));
      await expect(
        recoverControlledReproducer(intent().intentId, { directory: d }),
      ).rejects.toThrow("STORE_CORRUPT");
      expect(e.execute).toHaveBeenCalledTimes(1);
    },
  );
  it("reconciles interrupted unknown recovery before dispatch-ledger publication without execution", async () => {
    const input = await parent();
    const d = await directory();
    const e = executor();
    await expect(
      runOfflineControlledReproducer(input, e, {
        directory: d,
        fault: (p) => {
          if (p === "dispatch.json:durable") throw new Error("stop");
        },
      }),
    ).rejects.toThrow();
    await expect(
      recoverControlledReproducer(intent().intentId, {
        directory: d,
        fault: (p) => {
          if (p === "ledger.json:before-write") throw new Error("stop");
        },
      }),
    ).rejects.toThrow();
    const result = await recoverControlledReproducer(intent().intentId, { directory: d });
    expect(result.status).toBe("outcome-unknown");
    expect(await recoverControlledReproducer(intent().intentId, { directory: d })).toEqual(result);
    expect(e.execute).not.toHaveBeenCalled();
  });
  it.each([
    "sourcePlanHash",
    "sourceRunHash",
    "sourcePolicyHash",
    "sourceRequestHash",
    "planHash",
    "intentHash",
    "authorizationBindingHash",
    "fixtureManifestHash",
    "policyHash",
    "releaseHash",
    "resultHash",
    "dispatchHash",
  ])("rejects tampered %s", async (field) => {
    const input = await parent();
    const d = await directory();
    const e = executor();
    await runOfflineControlledReproducer(input, e, { directory: d });
    const name = ["releaseHash", "resultHash", "dispatchHash"].includes(field)
      ? "ledger.json"
      : "release.json";
    const file = path.join(d, intent().intentId, name);
    const value = JSON.parse(await readFile(file, "utf8"));
    if (field.startsWith("source")) value.binding[field] = "b".repeat(64);
    else value[field] = "b".repeat(64);
    await writeFile(file, JSON.stringify(value));
    await expect(
      recoverControlledReproducer(intent().intentId, { directory: d }),
    ).rejects.toThrow();
    expect(e.execute).toHaveBeenCalledTimes(1);
  });
  it.each(["release.json", "ledger.json", "dispatch.json", "result.json"])(
    "rejects missing terminal file %s without retry",
    async (name) => {
      const input = await parent();
      const d = await directory();
      const e = executor();
      await runOfflineControlledReproducer(input, e, { directory: d });
      await rm(path.join(d, intent().intentId, name));
      await expect(runOfflineControlledReproducer(input, e, { directory: d })).rejects.toThrow(
        "STORE_CORRUPT",
      );
      expect(e.execute).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { relation: "claim-reproduction" },
    { claimTested: true },
    { challengeResolved: true },
    { observation: { provenance: "OBSERVED" } },
    { testOnly: false },
    { executionMode: "real" },
    { status: "completed", simulated: null },
    { status: "failed", simulated: fakeOutput() },
    { attempts: 2 },
  ])("rejects widened or incoherent terminal receipt %j", async (patch) => {
    const input = await parent();
    const result = await runOfflineControlledReproducer(input, executor(), {
      directory: await directory(),
    });
    expect(ControlledReproducerRunSchema.safeParse({ ...result, ...patch }).success).toBe(false);
  });
  it("links the private candidate manifest to existing fixture bytes without invoking the fixture", async () => {
    const text = await readFile(
      new URL("../../../tests/browser-security/collector-fixtures.ts", import.meta.url),
      "utf8",
    );
    expect(text).toContain(
      'body = "<!doctype html><title>Empty owned performance fixture</title>";',
    );
    const source = await readFile(new URL("./fixture-manifest.ts", import.meta.url), "utf8");
    expect(source).not.toContain("collectorFixtureResponse");
    expect(source).not.toContain("tests/browser-security");
    for (const file of ["index.ts", "storage.ts", "fixture-manifest.ts"]) {
      const code = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
      for (const forbidden of [
        "playwright",
        "chromium.launch",
        "launchBrowserWorker",
        "fetch(",
        "provider-openai",
        "controlled-provider",
        "process.env",
      ])
        expect(code).not.toContain(forbidden);
    }
  });
  it.each(["invalid-json", "oversized", "public-permissions", "symlink", "hardlink"])(
    "fails closed for %s result",
    async (kind) => {
      const input = await parent();
      const d = await directory();
      const e = executor();
      await runOfflineControlledReproducer(input, e, { directory: d });
      const file = path.join(d, intent().intentId, "result.json");
      if (kind === "invalid-json") await writeFile(file, "{");
      if (kind === "oversized") await writeFile(file, "x".repeat(L.resultBytes + 1));
      if (kind === "public-permissions") await chmod(file, 0o644);
      if (kind === "symlink") {
        await rm(file);
        await symlink("ledger.json", file);
      }
      if (kind === "hardlink") await link(file, path.join(d, "extra-link"));
      await expect(
        recoverControlledReproducer(intent().intentId, { directory: d }),
      ).rejects.toThrow("STORE_CORRUPT");
      expect(e.execute).toHaveBeenCalledTimes(1);
    },
  );
  it("requires existing intent and refuses corrupt or ambiguous owner locks", async () => {
    const input = await parent();
    const d = await directory();
    const e = executor();
    await expect(recoverControlledReproducer(intent().intentId, { directory: d })).rejects.toThrow(
      "STORE_CORRUPT",
    );
    expect(await readdir(d)).toEqual([]);
    await runOfflineControlledReproducer(input, e, { directory: d });
    const file = path.join(d, intent().intentId, "owner.lock");
    for (const value of [
      "{",
      JSON.stringify({
        pid: process.pid,
        host: hash(hostname()),
        nonce: "12345678-1234-4234-8234-123456789012",
      }),
      JSON.stringify({
        pid: 2147483647,
        host: "b".repeat(64),
        nonce: "12345678-1234-4234-8234-123456789012",
      }),
    ]) {
      await writeFile(file, value, { mode: 0o600 });
      await expect(
        recoverControlledReproducer(intent().intentId, { directory: d }),
      ).rejects.toThrow();
      await rm(file);
    }
    await writeFile(
      file,
      JSON.stringify({
        pid: 2147483647,
        host: hash(hostname()),
        nonce: "12345678-1234-4234-8234-123456789012",
      }),
      { mode: 0o600 },
    );
    expect((await recoverControlledReproducer(intent().intentId, { directory: d })).status).toBe(
      "completed",
    );
    expect(e.execute).toHaveBeenCalledTimes(1);
    expect(constants.O_NOFOLLOW).toBeGreaterThan(0);
  });
  it("bounds total reserved runs", async () => {
    const input = await parent();
    const d = await directory();
    for (let i = 0; i < L.runs; i++) {
      input.intent = intent(`offline-test-${String(i).padStart(3, "0")}`);
      await runOfflineControlledReproducer(input, undefined, { directory: d });
    }
    input.intent = intent("offline-test-extra");
    await expect(
      runOfflineControlledReproducer(input, undefined, { directory: d }),
    ).rejects.toThrow("STORE_CAPACITY");
  });
});
