import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: true },
  use: { baseURL: "http://localhost:3000" },
});
