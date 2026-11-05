import { defineConfig } from "@playwright/test";
import { E2E } from "./tests/e2e/fixtures";

const baseURL = `http://localhost:${E2E.port}`;

// Own port and a freshly seeded on-disk PGlite every run; never reuses whatever else is on :3000.
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1, // one PGlite, one dev server
  webServer: {
    command: `pnpm tsx tests/e2e/seed.ts && pnpm next dev -p ${E2E.port}`,
    url: `${baseURL}/g`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL: E2E.dbUrl, APP_BASE_URL: baseURL },
  },
  use: { baseURL },
});
