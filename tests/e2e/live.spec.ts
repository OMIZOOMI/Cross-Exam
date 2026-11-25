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
  baseURL,
}) => {
  let complete: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(`${baseURL}/`) && !request.url().startsWith("data:"))
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
  await page.getByLabel("Website URL").fill("https//example.com");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(page.getByRole("status")).toContainText("Check the address and try again.");
  await page.getByLabel("Website URL").fill("example.com/?lang=en");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Remove the question mark and everything after it",
  );
  await page.getByLabel("Website URL").fill("  example.com  ");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(page.getByRole("status")).toContainText("Checking your website");
  await expect(page.getByRole("button", { name: "Scanning…" })).toBeDisabled();
  complete();
  await expect(page).toHaveURL(`/report/${id}`);
  await expect(page.getByText("LIVE INVESTIGATION", { exact: true })).toBeVisible();
  await expect(page.locator(".case-metadata")).toContainText("Partial investigation");
  await expect(page.locator(".scope-facts")).toContainText("1.3");
  await page.getByRole("button", { name: "Show graph", exact: true }).click();
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
  const internalCodes = /\b[EF][-–]\d{3}\b/;
  const inspector = page.locator(".graph-inspector");
  await expect(inspector).not.toContainText(internalCodes);
  await inspector.getByText("Passed · 2 checks", { exact: true }).click();
  await expect(inspector.getByRole("listitem").first()).toHaveAttribute("value", "1");
  await expect(inspector.getByRole("listitem").last()).toHaveAttribute("value", "3");
  await expect(
    inspector.getByText("The website returned a successful response (200)."),
  ).toBeVisible();

  await navigation.getByRole("button", { name: "Investigation" }).click();
  await page.getByLabel("Choose a page").selectOption("P-2");
  await expect(inspector).toContainText("Page not found (404)");
  await inspector.getByText("Failed · 1 check", { exact: true }).click();
  await expect(inspector.getByRole("listitem")).toHaveAttribute("value", "2");
  await expect(inspector.getByRole("button", { name: "Show evidence for Check 2" })).toBeVisible();
  await expect(inspector).not.toContainText(internalCodes);
  await expect(page.locator(".route-table tbody tr")).toHaveCount(2);
  await inspector.getByRole("button", { name: /Problem 1 Missing page: \/broken/ }).click();
  await expect(page.locator("#detail-F-001")).toContainText("deterministic rule");
  await expect(
    page.locator("#detail-F-001").getByRole("heading", { name: "Observed" }),
  ).toBeVisible();
  await expect(
    page.locator("#detail-F-001").getByRole("heading", { name: "Recommended fix" }),
  ).toBeVisible();
  await expect(page.locator("#detail-F-001 .case-chain li")).toHaveCount(2);
  await expect(page.locator("#detail-F-001")).not.toContainText("fixture data");
  await expect(page.locator(".findings-index")).not.toContainText(internalCodes);
  await page.getByRole("button", { name: "Check 2", exact: true }).click();
  await expect(page.getByLabel("Search evidence")).toHaveValue("Check 2");
  await expect(page.locator(".evidence-record")).toHaveCount(1);
  await expect(page.locator(".evidence-record")).not.toContainText(internalCodes);
  await expect(page.locator(".observation-data")).toContainText("404");
  await page.getByLabel("Search evidence").fill("Check 3");
  await expect(page.locator(".observation-data")).toContainText(
    "<script>window.attacked=true</script>",
  );
  expect(await page.evaluate(() => Reflect.get(window, "attacked"))).toBeUndefined();
  await navigation.getByRole("button", { name: "Investigation" }).click();
  await page
    .getByRole("navigation", { name: "Investigation details" })
    .getByRole("button", { name: "Solutions", exact: true })
    .click();
  await expect(page.locator(".solution-row")).toHaveCount(1);
  await expect(page.locator(".solution-row")).not.toContainText(internalCodes);
  await expect(page.locator(".solutions-index")).not.toContainText("homepage hero");
  await expect(page.locator(".solutions-index")).not.toContainText("fixture investigation");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export investigation" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`veyra-${id}.json`);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(report.summary.source).toBe("live");
  expect(report.pages).toHaveLength(2);
  expect(report.agentRuns).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("live evidence groups records by collection layer and keeps search and status intact", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/report/${id}`);
  await expect(page.getByRole("button", { name: "Scan again" })).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.getByRole("button", { name: "Evidence 3" }).click();
  const groups = page.locator(".evidence-layer");
  await expect(groups.locator("h3.report-label")).toHaveText([
    "01 · Surface",
    "02 · DOM & components",
    "03 · Routes & resources",
    "04 · Requests & dependencies",
    "05 · Responses & behavior",
  ]);
  await expect(groups.nth(0).locator(".evidence-record")).toHaveCount(1);
  await expect(groups.nth(3)).toContainText("No separate request records");
  await expect(groups.nth(4).locator(".evidence-status")).toHaveText(["200 OK", "404"]);
  await expect(page.locator(".evidence-record")).toHaveCount(3);
  await page.getByLabel("Filter evidence category").selectOption("metadata");
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toContainText("01 · Surface");
  await page.getByLabel("Search evidence").fill("Check 2");
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toContainText("05 · Responses & behavior");
  await expect(groups.first().locator("details")).toHaveAttribute("open", "");
  const search = page.getByLabel("Search evidence");
  await search.focus();
  await expect(search).toHaveCSS("outline-style", "solid");
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
  await page.getByRole("button", { name: "Scan website" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Investigation cancelled");
  await expect(page.getByRole("button", { name: "Scan website" })).toBeEnabled();
  finish();
  await expect(page).toHaveURL("/");
});

test("live download chart keeps long paths and exact timings readable", async ({ page }) => {
  const report = liveReportFixture(id);
  const project = report.pages[1];
  const response = report.evidence[1];
  const claim = report.claims[0];
  const finding = report.findings[0];
  if (!project || !response || !claim || !finding)
    throw new Error("Missing fixture page or finding");
  const longPath = `/projects/${"a".repeat(452)}`;
  const address = `https://example.com${longPath}`;
  Object.assign(project, { path: longPath, requestedUrl: address, finalUrl: address });
  Object.assign(response, { url: address, data: { statusCode: 404, finalUrl: address } });
  finding.affectedPaths = [longPath];
  claim.statement = `${longPath} returned 404.`;
  await writeFile(filename, JSON.stringify(report));
  await page.goto(`/report/${id}`);

  const chart = page.getByRole("list", { name: "How long each page took to download" });
  const home = chart.getByRole("listitem").filter({ hasText: "Homepage" });
  const projectRow = chart.getByRole("listitem").filter({ hasText: longPath });
  await expect(home).toContainText("321 ms");
  await expect(projectRow).toContainText("1200 ms");
  await expect(home.locator("svg > rect").last()).toHaveAttribute("fill", "#5477b0");
  const barSize = await projectRow.locator("svg").boundingBox();
  expect(barSize?.height).toBe(10);
  expect(barSize?.width).toBeGreaterThan(100);
  const label = projectRow.getByText(longPath, { exact: true });
  await expect(label).toBeVisible();
  await expect(label).toHaveCSS("font-size", "16px");
  expect(await label.evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    "Inter",
  );
  expect(
    await label.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      return [...range.getClientRects()].every(
        (line) => line.left >= bounds.left - 1 && line.right <= bounds.right + 1,
      );
    }),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "See details for Problem 1" }).click();
  await expect(page.locator(".finding-detail")).toContainText(longPath);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("shows the page limit notice in the overview without opening technical details", async ({
  page,
}) => {
  const report = liveReportFixture(id);
  const home = report.pages[0];
  if (!report.investigation || !home) throw new Error("Missing fixture data");
  report.investigation.skippedPageCandidates = 2;
  report.summary.status = "completed";
  for (let n = 3; n <= 8; n++) {
    const address = `https://example.com/page-${n}`;
    report.pages.push({
      ...home,
      id: `P-${n}`,
      path: `/page-${n}`,
      requestedUrl: address,
      finalUrl: address,
      linksTo: [],
    });
  }
  report.summary.pageCount = 8;
  await writeFile(filename, JSON.stringify(report));
  await page.goto(`/report/${id}`);
  await expect(page.getByText("Scan limit reached", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Veyra checked 8 pages and skipped 2 more to keep the scan fast.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("shows the link to edit separately from the failing redirect destination", async ({
  page,
}) => {
  const report = liveReportFixture(id);
  const broken = report.pages[1];
  const response = report.evidence[1];
  const homeEvidence = report.evidence[0];
  if (!broken || !response || !homeEvidence) throw new Error("Missing fixture data");
  const alias = "https://example.com/old-address";
  broken.requestedUrl = alias;
  response.url = alias;
  report.evidence.push({
    ...homeEvidence,
    id: "E-004",
    code: "DOCUMENT_STRUCTURE",
    data: { internalLinks: [alias], internalLinkCount: 1 },
  });
  report.summary.evidenceCount++;
  await writeFile(filename, JSON.stringify(report));
  await page.goto(`/report/${id}`);
  const card = page.locator(".live-check-issue");
  await expect(card.getByRole("heading", { name: "Missing page: /broken" })).toBeVisible();
  await expect(card).toContainText("Page to edit: Homepage");
  await expect(card).toContainText("Link to edit: /old-address on Homepage");
  await expect(card).toContainText("Redirect failed at: /broken");
});

test("live download chart retains labels and bars when stylesheets fail", async ({ page }) => {
  let blockedStylesheets = 0;
  await page.route(/\.css(?:\?|$)/, (route) => {
    blockedStylesheets++;
    return route.abort();
  });
  await page.goto(`/report/${id}`);
  expect(blockedStylesheets).toBeGreaterThan(0);
  const chart = page.getByRole("list", { name: "How long each page took to download" });
  const home = chart.getByRole("listitem").filter({ hasText: "Homepage" });
  await expect(home).toContainText("Homepage 321 ms");
  await expect(home.locator("svg")).toBeVisible();
  await expect(home.locator("svg > rect").last()).toHaveAttribute("fill", "#5477b0");
});

test("site map fills its panel as page details expand", async ({ page }) => {
  const report = liveReportFixture(id);
  const homeEvidence = report.evidence[0];
  if (!homeEvidence) throw new Error("Missing homepage evidence");
  for (let number = 4; number <= 8; number++) {
    report.evidence.push({ ...homeEvidence, id: `E-00${number}` });
  }
  report.summary.evidenceCount = report.evidence.length;
  await writeFile(filename, JSON.stringify(report));
  await page.goto(`/report/${id}`);
  await page.getByRole("button", { name: "Show graph", exact: true }).click();

  const graph = page.getByTestId("site-graph");
  await expect(graph.locator(".react-flow__node")).toHaveCount(2);
  const inspector = page.locator(".graph-inspector");
  await inspector.getByText("Passed · 7 checks", { exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Show evidence for Check 8" })).toBeVisible();
  await expect
    .poll(() =>
      graph.evaluate((element) => {
        const canvas = element.querySelector(".react-flow")?.getBoundingClientRect();
        const nodes = [...element.querySelectorAll(".react-flow__node")].map((node) =>
          node.getBoundingClientRect(),
        );
        if (!canvas || !nodes.length) return null;
        const bottom = element.parentElement?.getBoundingClientRect().bottom ?? 0;
        const topPadding = Math.min(...nodes.map((node) => node.top)) - canvas.top;
        const bottomPadding = canvas.bottom - Math.max(...nodes.map((node) => node.bottom));
        return {
          canvasAligned: Math.abs(bottom - canvas.bottom) <= 2,
          nodesInside: topPadding >= 0 && bottomPadding >= 0,
          nodesCentered: Math.abs(topPadding - bottomPadding) <= 4,
        };
      }),
    )
    .toEqual({ canvasAligned: true, nodesInside: true, nodesCentered: true });
});

test("scan limitations have a short summary and optional readable details", async ({ page }) => {
  await page.goto(`/report/${id}`);
  await expect(page.getByRole("heading", { name: "What this scan covers" })).toBeVisible();
  await expect(page.getByText("This scan skips", { exact: false })).toBeVisible();
  await expect(page.getByText("Tribunal boundary", { exact: true })).toHaveCount(0);
  const detail = page.getByText("Technical scan details", { exact: true });
  await expect(detail).toHaveCSS("font-size", "16px");
  const recordedNote = page.getByText("Controlled UI test fixture. No target was contacted.", {
    exact: true,
  });
  await expect(recordedNote).toBeHidden();
  await detail.click();
  await expect(recordedNote).toBeVisible();
});

test("real API rejects unsafe and cross-origin submissions without a target request", async ({
  request,
  baseURL,
}) => {
  const unsafe = await request.post("/api/scans", {
    headers: { Origin: new URL("/api/scans", baseURL).origin },
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

test("plain report explains a broken link and scan again opens a fresh report", async ({
  page,
}) => {
  const nextId = randomUUID();
  const nextFile = path.join(path.dirname(filename), `${nextId}.json`);
  const next = liveReportFixture(nextId);
  next.summary.startedAt = "2026-10-01T10:01:00.000Z";
  next.summary.status = "completed";
  next.summary.findingCount = 0;
  const pricing = next.pages[1];
  const responseEvidence = next.evidence[1];
  if (!next.investigation || !pricing || !responseEvidence) throw new Error("Missing test data");
  next.investigation.notes = [];
  next.findings = [];
  next.claims = [];
  next.verdicts = [];
  Object.assign(pricing, {
    path: "/pricing",
    title: "Pricing",
    statusCode: 200,
    requestedUrl: "https://example.com/pricing",
    finalUrl: "https://example.com/pricing",
  });
  Object.assign(responseEvidence, {
    url: pricing.finalUrl,
    title: "HTTP 200 · /pricing",
    data: { statusCode: 200, finalUrl: pricing.finalUrl },
  });
  await writeFile(nextFile, JSON.stringify(next));
  try {
    let attempts = 0;
    await page.route("**/api/scans", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ targetUrl: "https://example.com/" });
      attempts++;
      await route.fulfill(
        attempts === 1
          ? { status: 422, json: { message: "The scan could not finish." } }
          : { status: 201, json: { id: nextId } },
      );
    });
    await page.goto(`/report/${id}`);
    await expect(page.getByRole("heading", { name: "What needs attention" })).toBeVisible();
    await expect(
      page.getByText("Following a link from the homepage", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Some checks could not be completed.")).toBeVisible();
    await page.getByText("Failed · 1 check", { exact: true }).click();
    await expect(
      page.getByText("The website said this page could not be found (404)."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Scan again" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "The scan could not finish." }),
    ).toBeVisible();
    await expect(page).toHaveURL(`/report/${id}`);
    await page.getByRole("button", { name: "Scan again" }).click();
    await expect(page).toHaveURL(`/report/${nextId}?previous=${id}`);
    await expect(
      page.getByText("No problems were flagged on the pages Veyra checked."),
    ).toBeVisible();
    await expect(page.getByText("Failed · 1 check", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("link", { name: "View previous report" }).click();
    await expect(page).toHaveURL(`/report/${id}`);
  } finally {
    await unlink(nextFile).catch(() => {});
  }
});
