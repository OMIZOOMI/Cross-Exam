import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser-security",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: "list",
  use: { trace: "off", screenshot: "off", video: "off" },
});
