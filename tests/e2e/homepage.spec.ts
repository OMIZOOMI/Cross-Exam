import { expect, test } from "@playwright/test";

test("the approved homepage preserves the interactive demo and separates it from live scans", async ({
  page,
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
  await expect(home.locator(".hero-atmosphere")).toBeVisible();
  await expect(home.locator(".layer")).toHaveCount(5);
  await expect(page.locator("video")).toHaveCount(0);
  await expect(home.locator(".trace-path")).toHaveCount(16);

  const stage = page.locator("#showcase");
  const inspector = page.locator("#inspector");
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
  await expect(page.getByLabel("Website URL")).toBeVisible();
  await page.getByRole("link", { name: "See the demo case" }).click();
  await expect(page).toHaveURL(/\/report\/demo$/);
  await expect(page.getByText("SYNTHETIC FIXTURE", { exact: true }).first()).toBeVisible();
  await page.goBack();
  await expect(home).toHaveAttribute("data-scene-ready", "true");
  await expect(home.locator(".trace-path")).toHaveCount(16);
  expect(problems).toEqual([]);
});
