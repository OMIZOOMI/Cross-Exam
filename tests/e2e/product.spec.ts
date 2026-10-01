import { expect, test } from "@playwright/test";

test("URL form validates, calls only the local API, and handles scan failure", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.com")) externalRequests.push(request.url());
  });
  await page.route("**/api/scans", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        message: "This website could not be investigated. Try another public HTML page.",
      }),
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Put your website on trial." })).toBeVisible();
  await page.getByRole("button", { name: "Begin Cross-Exam" }).click();
  await expect(page.getByRole("status")).toContainText("Enter a full HTTP or HTTPS URL");
  await page.getByLabel("Website URL").fill("https://example.com");
  await page.getByRole("button", { name: "Begin Cross-Exam" }).click();
  await expect(page.getByRole("status")).toContainText("could not be investigated");
  expect(externalRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "Explore the demo", exact: true }).click();
  await expect(page).toHaveURL(/\/report\/demo$/);
});

test("fixture investigation exposes evidence and uncertainty", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/report/demo");
  await expect(
    page.getByText("No website was scanned and no AI agents were run.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await page.getByRole("button", { name: "See the contested claim" }).click();
  await expect(page.locator("#detail-F-005")).toContainText(
    "Correlation does not establish causation",
  );
  await page.getByRole("button", { name: "E-009", exact: true }).click();
  await expect(page.getByLabel("Search evidence")).toHaveValue("E-009");
  await expect(page.locator(".evidence-record")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "680 KB of transferred JavaScript" }),
  ).toBeVisible();
  await page.getByLabel("Search evidence").fill("no-such-evidence");
  await expect(page.getByText("No evidence matches", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator(".evidence-record")).toHaveCount(12);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("site graph, filters, and solutions are usable", async ({ page }) => {
  await page.goto("/report/demo");
  const navigation = page.getByRole("navigation", { name: "Investigation views" });
  await navigation.getByRole("button", { name: "Site Map", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await page.getByLabel("INSPECT ROUTE").selectOption("legacy");
  await expect(page.locator(".graph-inspector")).toContainText("404 response");
  await page.locator('.react-flow__node[data-id="work"]').click();
  await expect(page.getByLabel("INSPECT ROUTE")).toHaveValue("work");
  await page.locator('.react-flow__node[data-id="legacy"]').focus();
  await page.locator('.react-flow__node[data-id="legacy"]').press("Enter");
  await expect(page.getByLabel("INSPECT ROUTE")).toHaveValue("legacy");
  await expect(page.getByRole("table")).toBeVisible();
  await navigation.getByRole("button", { name: "Findings" }).click();
  await page.getByLabel("Filter severity").selectOption("high");
  await expect(page.locator(".finding-row")).toHaveCount(2);
  await navigation.getByRole("button", { name: "Solutions", exact: true }).click();
  await expect(page.locator(".solution-row")).toHaveCount(5);
  await page.getByRole("button", { name: "Review F-003 and its evidence" }).click();
  await expect(page.locator("#detail-F-003")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("export retains fixture identity and the evidence record", async ({ page }) => {
  await page.goto("/report/demo");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export fixture" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("crossexam-fixture-report.json");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(report.summary.source).toBe("fixture");
  expect(report.evidence).toHaveLength(12);
  expect(report.findings).toHaveLength(5);
});

test("unknown routes have a useful recovery path", async ({ page }) => {
  const response = await page.goto("/report/missing");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Open demo report" })).toBeVisible();
});

test("archive filters and route context lead back to the supporting claim", async ({ page }) => {
  await page.goto("/report/demo");
  const navigation = page.getByRole("navigation", { name: "Investigation views" });
  await navigation.getByRole("button", { name: "Evidence" }).click();
  await page.getByLabel("Filter evidence category").selectOption("network");
  await expect(page.locator(".evidence-record")).toHaveCount(3);
  await page.getByLabel("Search evidence").fill("E-009");
  await expect(page.locator(".evidence-record")).toHaveCount(1);
  await expect(page.locator(".evidence-record details")).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Review claim C-005" }).click();
  await expect(page.locator("#detail-F-005")).toContainText(
    "Correlation does not establish causation",
  );
  await navigation.getByRole("button", { name: "Site Map", exact: true }).click();
  await page.getByLabel("INSPECT ROUTE").selectOption("legacy");
  await page.locator(".graph-inspector").getByRole("button", { name: /F-002/ }).click();
  await expect(page.locator("#detail-F-002")).toBeVisible();
  await navigation.getByRole("button", { name: "Solutions", exact: true }).click();
  await expect(page.getByText("Cross-Exam Fix", { exact: false })).toContainText("planned");
  const proposal = page.locator(".solution-row").first();
  await proposal.getByText("How to verify", { exact: true }).click();
  await expect(proposal.locator("details")).toHaveAttribute("open", "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("unsafe URL feedback is local and does not disclose internal policy details", async ({
  page,
}) => {
  const targetRequests: string[] = [];
  await page.route("**/api/scans", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        message: "This website could not be investigated. Try another public HTML page.",
      }),
    }),
  );
  await page.goto("/");
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:3000/") && !request.url().startsWith("data:"))
      targetRequests.push(request.url());
  });
  for (const url of [
    "http://localhost",
    "http://169.254.169.254",
    "https://[::1]",
    "http://2130706433",
    "https://example.com:8080",
    "https://user:pass@example.com",
    "file:///etc/passwd",
  ]) {
    await page.getByLabel("Website URL").fill(url);
    await page.getByRole("button", { name: "Begin Cross-Exam" }).click();
    await expect(page.getByRole("status")).toHaveText("This destination cannot be scanned.");
    await expect(page.getByLabel("Website URL")).toHaveAttribute("aria-invalid", "true");
  }
  await page.getByLabel("Website URL").fill("https://public-looking.com");
  await page.getByRole("button", { name: "Begin Cross-Exam" }).click();
  await expect(page.getByRole("status")).toContainText("could not be investigated");
  expect(targetRequests).toEqual([]);
});
