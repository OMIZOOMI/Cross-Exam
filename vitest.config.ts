import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "scripts/provider-acceptance/*.test.ts",
    ],
    environment: "node",
  },
});
