import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("Veyra video landing starts on a poster without downloading the film", async ({ page }) => {
  const media: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".mp4")) media.push(request.url());
  });
  await page.goto("/");
  const video = page.locator(".stage182-film video");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).toHaveAttribute("poster", "/media/veyra-product-film-poster.webp");
  await expect(video).not.toHaveAttribute("src");
  await expect(video).not.toHaveAttribute("autoplay");
  expect((await page.request.get("/media/veyra-product-film-poster.webp")).ok()).toBe(true);
  await expect(page.locator(".stage182-film-play")).toBeVisible();
  expect(media).toEqual([]);
});

test("Veyra video landing plays the real MP4, pauses, ends and explicitly replays", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator(".stage182-film-play").click();
  const video = page.locator(".stage182-film video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  const metadata = await video.evaluate((v: HTMLVideoElement) => ({
    width: v.videoWidth,
    height: v.videoHeight,
    duration: v.duration,
    muted: v.muted,
    inline: v.playsInline,
    loop: v.loop,
  }));
  expect(metadata).toEqual({
    width: 1920,
    height: 1080,
    duration: 35,
    muted: true,
    inline: true,
    loop: false,
  });
  await page.getByRole("button", { name: "Pause product film", exact: true }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.currentTime = 34.8;
    await v.play();
  });
  await expect(
    page.getByRole("button", { name: "Replay product film", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Replay product film", exact: true }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test("Veyra video landing respects reduced motion and a preference change during playback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const surface = page.locator(".stage182-film-surface"),
    video = surface.locator("video");
  await expect(surface).toHaveAttribute("data-reduced-motion", "true");
  await expect(video).not.toHaveAttribute("src");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator(".stage182-film-play").click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(video).not.toHaveAttribute("src");
  await expect(page.locator(".stage182-film-play")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(video).not.toHaveAttribute("src");
});

test("Veyra video landing keeps cinematic scale, CTAs and intentional mobile framing", async ({
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
    const dimensions = await page.locator(".stage182-film-surface").evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
    }));
    expect(dimensions.width).toBeGreaterThan(width * 0.85);
    expect(dimensions.height).toBeGreaterThan(width <= 600 ? 250 : 350);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    if (process.env.VEYRA_VISUAL_REVIEW === "1") {
      await page
        .locator(".stage182-hero")
        .screenshot({ path: path.join(tmpdir(), `veyra-landing-${width}.png`) });
    }
    if (width <= 600) expect(dimensions.width / dimensions.height).toBeCloseTo(4 / 3, 1);
    else expect(dimensions.width / dimensions.height).toBeCloseTo(16 / 9, 1);
  }
});

test("Veyra video landing offers keyboard playback and a complete text alternative", async ({
  page,
}) => {
  await page.goto("/");
  const button = page.locator(".stage182-film-play");
  await button.focus();
  await expect(button).toHaveCSS("outline-style", "solid");
  await button.press("Enter");
  await expect(page.getByRole("button", { name: "Pause product film", exact: true })).toBeVisible();
  await page.getByText("Read the film · text equivalent", { exact: true }).click();
  await expect(page.locator(".stage182-film-transcript")).toContainText(
    "stale hero-asset reference returns 404",
  );
  await expect(page.locator(".stage182-film-transcript")).toContainText("not a live scan");
});

test("Veyra video landing handles unavailable media without changing admission", async ({
  page,
}) => {
  await page.route("**/media/veyra-product-film.mp4", (route) => route.abort());
  await page.goto("/");
  await page.locator(".stage182-film-play").click();
  await expect(page.getByRole("status")).toContainText("Playback is unavailable");
  await expect(
    page.getByRole("link", { name: "Open the MP4 directly", exact: true }),
  ).toHaveAttribute("href", "/media/veyra-product-film.mp4");
});
