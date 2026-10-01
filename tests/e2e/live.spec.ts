import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { liveReportFixture } from "../fixtures/live-report";

let id: string;
let filename: string;
test.beforeEach(async () => {
  id = randomUUID();
  const directory = path.join(process.cwd(), "apps/web/.crossexam/reports");
  await mkdir(directory, { recursive: true });
  filename = path.join(directory, `${id}.json`);
  await writeFile(filename, JSON.stringify(liveReportFixture(id)));
});
test.afterEach(async () => {
  await unlink(filename).catch(() => {});
});

test("local scan submission shows honest waiting then renders a controlled live-mode report", async ({
  page,
}) => {
  let complete: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:3000/") && !request.url().startsWith("data:"))
      external.push(request.url());
  });
  await page.route("**/api/scans", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ targetUrl: "https://example.com" });
    await gate;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id }),
    });
  });
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://example.com");
  await page.getByRole("button", { name: "Begin Cross-Exam" }).click();
  await expect(page.getByRole("status")).toContainText("collecting document evidence");
  await expect(page.getByRole("button", { name: "Investigating…" })).toBeDisabled();
  complete();
  await expect(page).toHaveURL(`/report/${id}`);
  await expect(page.getByText("LIVE INVESTIGATION", { exact: true })).toBeVisible();
  await expect(page.locator(".case-metadata")).toContainText("Partial investigation");
  await expect(page.locator(".scope-facts")).toContainText("1.3");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  expect(external).toEqual([]);
  await expect(page.locator("main")).not.toContainText("4.2 seconds");
  await expect(page.locator("main")).not.toContainText("simulated");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("live findings, graph, evidence and export use report data without fixture leakage", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/report/${id}`);
  const navigation = page.getByRole("navigation", { name: "Investigation views" });
  await navigation.getByRole("button", { name: "Site Map", exact: true }).click();
  await page.getByLabel("INSPECT ROUTE").selectOption("P-2");
  await expect(page.locator(".graph-inspector")).toContainText("404 response");
  await expect(page.locator(".route-table tbody tr")).toHaveCount(2);
  await page.locator(".graph-inspector").getByRole("button", { name: /F-001/ }).click();
  await expect(page.locator("#detail-F-001")).toContainText("deterministic rule");
  await expect(page.locator("#detail-F-001 .case-chain li")).toHaveCount(2);
  await expect(page.locator("#detail-F-001")).not.toContainText("fixture data");
  await page.getByRole("button", { name: "E-002", exact: true }).click();
  await expect(page.locator(".evidence-record")).toHaveCount(1);
  await expect(page.locator(".observation-data")).toContainText("404");
  await page.getByLabel("Search evidence").fill("E-003");
  await expect(page.locator(".observation-data")).toContainText(
    "<script>window.attacked=true</script>",
  );
  expect(await page.evaluate(() => Reflect.get(window, "attacked"))).toBeUndefined();
  await navigation.getByRole("button", { name: "Solutions", exact: true }).click();
  await expect(page.locator(".solution-row")).toHaveCount(1);
  await expect(page.locator(".solutions-index")).not.toContainText("homepage hero");
  await expect(page.locator(".solutions-index")).not.toContainText("fixture investigation");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export investigation" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`crossexam-${id}.json`);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(report.summary.source).toBe("live");
  expect(report.pages).toHaveLength(2);
  expect(report.agentRuns).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("cancellation resets the form without fabricating a completed report", async ({ page }) => {
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/scans", async (route) => {
    await pending;
    await route.abort().catch(() => {});
  });
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://example.com");
  await page.getByRole("button", { name: "Begin Cross-Exam" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Investigation cancelled");
  await expect(page.getByRole("button", { name: "Begin Cross-Exam" })).toBeEnabled();
  finish();
  await expect(page).toHaveURL("/");
});

test("real API rejects unsafe and cross-origin submissions without a target request", async ({
  request,
}) => {
  const unsafe = await request.post("/api/scans", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: { targetUrl: "http://127.0.0.1" },
  });
  expect(unsafe.status()).toBe(400);
  expect(await unsafe.json()).toEqual({ message: "This destination cannot be scanned." });
  const crossOrigin = await request.post("/api/scans", {
    headers: { Origin: "https://attacker.com" },
    data: { targetUrl: "https://example.com" },
  });
  expect(crossOrigin.status()).toBe(403);
});
