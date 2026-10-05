import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createOpenAIProvider } from "../../provider-openai/src/index";
import { validTransport } from "../../provider-openai/src/test-fixtures";
import { recoverControlledProvider, runWithStore } from "./index";
import { createControlledRelease, ownedNumericFixture, RUN_LIMITS } from "./release";
import { RunStore } from "./storage";

const directories: string[] = [];
const temp = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "crossexam-store-bounds-"));
  directories.push(dir);
  return dir;
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true });
});
it.each([
  ["input.json", RUN_LIMITS.inputBytes],
  ["result.json", RUN_LIMITS.resultBytes],
  ["Explorer.json", RUN_LIMITS.checkpointBytes],
  ["ledger.json", RUN_LIMITS.ledgerBytes],
])("%s enforces its explicit storage ceiling", async (name, cap) => {
  const dir = await temp();
  const store = new RunStore(dir);
  await expect(store.publish(dir, name, "x".repeat(cap), cap)).rejects.toThrow("STORE_IO");
});
it("manual acceptance body over 16 KiB cannot consume a paid slot", async () => {
  const transport = vi.fn(validTransport());
  const original = createOpenAIProvider({ transport });
  const adapter = original.adapter;
  const config = {
    ...original,
    adapter: {
      run: adapter?.run.bind(adapter) as NonNullable<typeof adapter>["run"],
      prepare(request: Parameters<NonNullable<typeof adapter>["run"]>[0]) {
        const p = adapter?.prepare?.(request);
        if (!p) throw new Error("PREPARE");
        return { ...p, requestBytes: 16 * 1024 + 1 };
      },
    },
  };
  const dir = await temp();
  const release = createControlledRelease("bounds-release");
  const result = await runWithStore(ownedNumericFixture(), release, config, new RunStore(dir));
  expect(result.report?.tribunalRuns[0]?.agentRuns[0].status).toBe("limit-exceeded");
  expect(transport).not.toHaveBeenCalled();
});
it("persistence duration does not reset the tribunal deadline or allow delayed Breaker dispatch", async () => {
  let time = 0;
  vi.spyOn(performance, "now").mockImplementation(() => time);
  const transport = vi.fn(validTransport());
  const dir = await temp();
  const release = createControlledRelease("deadline-release");
  const store = new RunStore(dir, (p) => {
    if (p === "Explorer:checkpoint-durable") time = 45001;
  });
  const out = await runWithStore(
    ownedNumericFixture(),
    release,
    createOpenAIProvider({ transport }),
    store,
  );
  expect(transport).toHaveBeenCalledTimes(1);
  expect(out.report?.tribunalRuns[0]?.agentRuns[1].status).toBe("timeout");
  const recovery = await recoverControlledProvider(ownedNumericFixture(), release, {
    directory: dir,
  });
  expect(recovery.report).toEqual(out.report);
});
