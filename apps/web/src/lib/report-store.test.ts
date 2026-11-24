import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { liveReportFixture } from "../../../../tests/fixtures/live-report";

let root: string;
let store: typeof import("./report-store");
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "crossexam-store-test-"));
  vi.stubEnv("VEYRA_REPORT_DIR", undefined);
  vi.resetModules();
  vi.spyOn(process, "cwd").mockReturnValue(root);
  store = await import("./report-store");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
it("reads and writes reports in the configured ephemeral directory", async () => {
  const directory = path.join(root, "ephemeral", "veyra-reports");
  vi.stubEnv("VEYRA_REPORT_DIR", directory);
  vi.resetModules();
  const configured = await import("./report-store");
  const id = randomUUID();
  await configured.saveReport(liveReportFixture(id));
  expect(await readdir(directory)).toEqual([`${id}.json`]);
  expect(await configured.readReport(id)).not.toBeNull();
  expect(await store.readReport(id)).toBeNull();
});
it("round-trips validated live reports and rejects path traversal, fixtures and wrong identity", async () => {
  const id = randomUUID();
  const report = liveReportFixture(id);
  expect(await store.saveReport(report)).toBe(id);
  expect(await store.readReport(id)).toEqual(report);
  expect(await store.readReport("../../.env")).toBeNull();
  await expect(
    store.saveReport({ ...report, summary: { ...report.summary, source: "fixture" } }),
  ).rejects.toThrow();
  const filename = path.join(root, ".crossexam/reports", `${id}.json`);
  const altered = JSON.parse(await readFile(filename, "utf8"));
  altered.summary.id = randomUUID();
  await writeFile(filename, JSON.stringify(altered));
  expect(await store.readReport(id)).toBeNull();
});
it("bounds retention and expires reports without exposing corrupt documents", async () => {
  for (let i = 0; i < 22; i++) await store.saveReport(liveReportFixture(randomUUID()));
  const directory = path.join(root, ".crossexam/reports");
  const files = await readdir(directory);
  expect(files).toHaveLength(20);
  const file = files[0];
  if (!file) throw new Error("Missing test file");
  await utimes(path.join(directory, file), new Date(0), new Date(0));
  expect(await store.readReport(file.replace(".json", ""))).toBeNull();
  await writeFile(path.join(directory, file), "not json");
  expect(await store.readReport(file.replace(".json", ""))).toBeNull();
});
