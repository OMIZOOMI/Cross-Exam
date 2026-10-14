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
  await expect(
    page.getByRole("heading", { name: "Your website says it works. Prove it." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Investigate locally" }).click();
  await expect(page.getByRole("status")).toContainText("Enter a full HTTP or HTTPS URL");
  await page.getByLabel("Website URL").fill("https://example.com");
  await page.getByRole("button", { name: "Investigate locally" }).click();
  await expect(page.getByRole("status")).toContainText("could not be investigated");
  expect(externalRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "See the demo case", exact: true }).click();
  await expect(page).toHaveURL(/\/report\/demo$/);
});

test("fixture investigation exposes evidence and uncertainty", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/report/demo");
  await expect(
    page.getByText("No website was scanned and no AI agents were run.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show graph", exact: true }).click();
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
  await page
    .getByRole("navigation", { name: "Investigation views" })
    .getByRole("button", { name: "Investigation" })
    .click();
  const navigation = page.getByRole("navigation", { name: "Investigation details" });
  await navigation.getByRole("button", { name: "Site Map", exact: true }).click();
  await page.getByRole("button", { name: "Show graph", exact: true }).click();
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
  expect(download.suggestedFilename()).toBe("veyra-fixture-report.json");
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
  await page
    .getByRole("navigation", { name: "Investigation views" })
    .getByRole("button", { name: "Investigation" })
    .click();
  await page
    .getByRole("navigation", { name: "Investigation details" })
    .getByRole("button", { name: "Site Map", exact: true })
    .click();
  await page.getByLabel("INSPECT ROUTE").selectOption("legacy");
  await page.locator(".graph-inspector").getByRole("button", { name: /F-002/ }).click();
  await expect(page.locator("#detail-F-002")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Investigation details" })
    .getByRole("button", { name: "Solutions", exact: true })
    .click();
  await expect(page.getByText("Veyra Fix", { exact: false })).toContainText("planned");
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
    await page.getByRole("button", { name: "Investigate locally" }).click();
    await expect(page.getByRole("status")).toHaveText("This destination cannot be scanned.");
    await expect(page.getByLabel("Website URL")).toHaveAttribute("aria-invalid", "true");
  }
  await page.getByLabel("Website URL").fill("https://public-looking.com");
  await page.getByRole("button", { name: "Investigate locally" }).click();
  await expect(page.getByRole("status")).toContainText("could not be investigated");
  expect(targetRequests).toEqual([]);
});

test("Veyra landing explains the case sequence without implying live activity", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Veyra/);
  const tabs = page.getByRole("tablist", { name: "Investigation relationship stages" });
  await expect(tabs).toBeVisible();
  await tabs.getByRole("tab", { name: /Website/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("acme.example");
  await tabs.getByRole("tab", { name: /Website/ }).press("ArrowRight");
  await expect(page.getByRole("tabpanel")).toContainText("E-009");
  await page.getByRole("tab", { name: /Observation/ }).press("End");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Correlation does not establish causation",
  );
  await expect(page.locator(".stage18-case-panel-note")).toContainText("no process is running");
});

test("Veyra landing stages the cinematic investigation scene without inventing activity", async ({
  page,
}) => {
  await page.goto("/");
  const width = await page.evaluate(() => innerWidth);
  const hero = page.locator(".stage181-hero");
  await expect(hero).toBeVisible();
  await expect(page.locator(".stage181-case-topline")).toContainText(
    "Synthetic fixture · no process is running",
  );
  await expect(page.locator(".stage181-object")).toHaveCount(6);
  await expect(page.locator(".stage181-cinematic-scene")).toHaveAttribute(
    "data-active-stage",
    "website",
  );
  if (width <= 680) {
    await expect(page.locator(".stage181-mobile-step")).toHaveCount(5);
    await expect(page.locator(".stage181-cinematic-scene")).toBeHidden();
  } else {
    await expect(page.locator(".stage181-cinematic-scene")).toBeVisible();
    await expect(page.locator(".stage181-connections")).toBeVisible();
  }
  await page.getByRole("button", { name: "Skip intro", exact: true }).click();
  await expect(page.locator(".stage181-case-sequence")).toHaveAttribute("data-motion", "settled");
  await expect(page.locator(".stage181-verdict-object")).toContainText("contested");
  await expect(page.locator(".stage181-verdict-seal")).toHaveCSS("color", "rgb(139, 90, 19)");
  await expect(page.locator(".stage181-record-details")).not.toHaveAttribute("open");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Veyra cinematic landing resolves to a static reduced-motion composition", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".stage181-case-sequence")).toHaveAttribute("data-motion", "settled");
  await expect(page.locator(".stage181-object").first()).toHaveCSS("opacity", "1");
  await expect(page.locator(".stage181-challenge-cross")).toHaveCSS("opacity", "0.92");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("Veyra landing plays one ordered twelve-second illustration then stays still", async ({
  page,
}) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== "http://127.0.0.1:3000") {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  const sequence = page.locator(".stage181-case-sequence");
  await expect(sequence).toHaveAttribute("data-motion", "intro");
  const timing = await page
    .locator(".stage181-object")
    .evaluateAll((nodes) =>
      nodes.map((node) => Number.parseFloat(getComputedStyle(node).animationDelay)),
    );
  expect(timing).toEqual([0.18, 1.8, 3.4, 5, 6.5, 9.6]);
  await expect(page.locator(".stage181-link-reconnect")).toHaveCSS("animation-delay", "8.2s");
  await expect(sequence).toHaveAttribute("data-motion", "settled", { timeout: 16000 });
  for (const object of await page.locator(".stage181-object").all()) {
    await expect(object).toHaveCSS("opacity", "1");
  }
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.screenshot({ fullPage: true });
  await expect(page.locator(".stage181-object").first()).toHaveCSS("opacity", "1");
  expect(external).toEqual([]);
});

test("Veyra landing keeps hero scale and controls readable across the four review widths", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [1440, 1000],
    [1280, 800],
    [768, 1024],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Investigate locally", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("link", { name: "See the demo case", exact: true }),
    ).toBeInViewport();
    const metrics = await page.evaluate(() => {
      const hero = document.querySelector(".stage181-hero")?.getBoundingClientRect();
      const cards = [...document.querySelectorAll(".stage181-object")].map((el) =>
        el.getBoundingClientRect(),
      );
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        heroWidth: hero?.width ?? 0,
        heroBottom: hero?.bottom ?? 0,
        collisions: cards.some((a, i) =>
          cards
            .slice(i + 1)
            .some(
              (b) =>
                Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
                Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top),
            ),
        ),
      };
    });
    expect(metrics.overflow).toBe(false);
    expect(metrics.collisions).toBe(false);
    if (width >= 1280) {
      expect(metrics.heroWidth).toBeGreaterThan(width * 0.9);
      expect(metrics.heroBottom).toBeGreaterThanOrEqual(height * 0.9);
      expect(metrics.heroBottom).toBeLessThanOrEqual(height + 2);
    }
  }
});

test("fixture Tribunal view exposes the chain and artifact boundary", async ({ page }) => {
  await page.goto("/report/demo");
  await page
    .getByRole("navigation", { name: "Investigation views" })
    .getByRole("button", {
      name: "Tribunal",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "A claim should survive each handoff." }),
  ).toBeVisible();
  await expect(
    page.locator(".tribunal-boundary").getByText("no Stage 17 JudgeReview artifact", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".tribunal-claim")).toHaveCount(1);
  await expect(page.locator(".tribunal-claim")).toContainText("not an observed reproduction");
  await page
    .getByRole("navigation", { name: "Claims in this record" })
    .getByRole("button", {
      name: /C-005/,
    })
    .click();
  await expect(page.locator(".tribunal-claim")).toContainText("Is JavaScript delaying the hero?");
  await expect(page.locator(".tribunal-claim")).toContainText("Planned-only");
  await page
    .locator(".tribunal-claim")
    .first()
    .getByRole("button", { name: /E-009/ })
    .first()
    .click();
  await expect(page.getByLabel("Search evidence")).toHaveValue("E-009");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
