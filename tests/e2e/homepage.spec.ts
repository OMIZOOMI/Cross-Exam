import { expect, test } from "@playwright/test";

test("the approved homepage preserves the interactive demo and separates it from live scans", async ({
  page,
  isMobile,
}) => {
  const problems: string[] = [];
  const scans: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("request", (request) => {
    if (request.url().endsWith("/api/scans")) scans.push(request.method());
  });
  await page.goto("/");
  const home = page.locator(".veyra-home");
  await expect(home).toHaveAttribute("data-scene-ready", "true");
  await expect(
    page.getByRole("heading", { name: "Your website says it works. Prove it." }),
  ).toBeVisible();
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText("Evidence over assumption")).toBeVisible();
  await expect(footer.getByText("Made by Om Sawkare")).toBeVisible();
  await expect(home.locator(".hero-atmosphere")).toBeVisible();
  await expect(home.locator(".layer")).toHaveCount(5);
  await expect(page.locator("video")).toHaveCount(0);
  await expect(home.locator(".trace-path")).toHaveCount(16);
  await expect(page.getByText("Scroll to investigate", { exact: true })).toBeVisible();
  for (const selector of [".story-panel h2", ".method-heading h2"]) {
    await expect(home.locator(selector).first()).toHaveCSS("font-kerning", "normal");
    await expect(home.locator(selector).first()).toHaveCSS("font-weight", "700");
  }

  const stage = page.locator("#showcase");
  const inspector = page.locator("#inspector");
  for (const selector of [".stage-scroll", ".layer1-hero h2", "#inspector-title"]) {
    await expect(home.locator(selector)).toHaveCSS("user-select", "none");
  }
  const colors = await home
    .locator(".hero-line")
    .first()
    .evaluate((element) => ({
      normal: getComputedStyle(element).color,
      selected: getComputedStyle(element, "::selection").color,
    }));
  expect(colors.selected).toBe(colors.normal);
  for (const [progress, beat] of [
    [0.21, "interaction"],
    [0.52, "evidence"],
    [0.73, "challenge"],
    [0.96, "verdict"],
    [0, "surface"],
  ] as const) {
    await stage.evaluate((element, fraction) => {
      const top = window.scrollY + element.getBoundingClientRect().top;
      window.scrollTo({
        top: top + (element.clientHeight - innerHeight) * fraction,
        behavior: "instant",
      });
    }, progress);
    await expect(inspector).toHaveAttribute("data-narrative-stage", beat);
    if (isMobile && beat === "verdict") {
      await expect
        .poll(() =>
          stage.evaluate((element) => {
            const viewport = element.querySelector("#viewport");
            const rail = element.querySelector("#inspector");
            if (!viewport || !rail) return false;
            const scene = viewport.getBoundingClientRect();
            const panel = rail.getBoundingClientRect();
            return scene.height > 0 && scene.bottom <= panel.top;
          }),
        )
        .toBe(true);
    }
  }
  await expect(page.locator("#inspector-layer-title")).toHaveCSS("white-space", "normal");
  if (!isMobile) {
    const world = page.locator("#world");
    const yaw = () => world.evaluate((element) => element.style.getPropertyValue("--scene-yaw"));
    const initialYaw = await yaw();
    const text = page.locator(".layer1-hero h2");
    const bounds = await text.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error("Demo heading is missing");
    const x = bounds.x + bounds.width / 3;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y + 12, { steps: 8 });
    await page.mouse.up();
    expect(await yaw()).not.toBe(initialYaw);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  }
  expect(scans).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page
    .getByRole("link", { name: "Scan a website", exact: true })
    .filter({ visible: true })
    .last()
    .click();
  await expect(page).toHaveURL(/#scan$/);
  const input = page.getByLabel("Website URL");
  const form = page.locator("#scan form");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("placeholder", "your-website.com");
  await input.fill("example.com");
  const headingColor = await page
    .getByRole("heading", { name: "Scan a website" })
    .evaluate((heading) => getComputedStyle(heading).color);
  await expect(input).toHaveCSS("color", headingColor);
  await expect(input).toHaveCSS("outline-style", "none");
  await expect(form).toHaveCSS("outline-style", "solid");
  const scanButton = form.getByRole("button", { name: "Scan website" });
  await input.press("ArrowRight");
  await scanButton.focus();
  await expect(scanButton).toBeFocused();
  await expect(scanButton).toHaveCSS("outline-style", "solid");
  await expect(form).toHaveCSS("outline-style", "none");
  await page.getByRole("link", { name: "See the demo case" }).click();
  await expect(page).toHaveURL(/\/report\/demo$/);
  await expect(page.getByText("This example uses sample data.", { exact: false })).toBeVisible();
  await page.goBack();
  await expect(home).toHaveAttribute("data-scene-ready", "true");
  await expect(home.locator(".trace-path")).toHaveCount(16);
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  const demoNav = page.getByRole("navigation", {
    name: isMobile ? "Mobile navigation" : "Primary navigation",
  });
  await demoNav.getByRole("link", { name: /Demo/ }).click();
  await expect(page).toHaveURL(/\/report\/demo$/);
  await expect(page.getByText("This example uses sample data.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "New scan" }).click();
  await expect(page).toHaveURL(/\/#scan$/);
  await expect(page.getByLabel("Website URL")).toBeVisible();
  expect(problems).toEqual([]);
});
