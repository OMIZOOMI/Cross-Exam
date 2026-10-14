import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Validate the production landing without replacing the owner's port-3000 dev server.
export default defineConfig(base, {
  testMatch: ["product.spec.ts", "video-landing.spec.ts"],
  grep: /Veyra.*landing|URL form validates|unsafe URL feedback/,
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command: "pnpm --filter @crossexam/web start --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
