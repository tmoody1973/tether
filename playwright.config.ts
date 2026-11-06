import { defineConfig } from "@playwright/test";
import { E2E } from "./tests/e2e/fixtures";

const baseURL = `http://localhost:${E2E.port}`;

// Own port and a freshly seeded on-disk PGlite every run; never reuses whatever else is on :3000.
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1, // one PGlite, one dev server
  webServer: [
    {
      command: "pnpm tsx tests/e2e/fake-paypal.ts",
      url: `http://localhost:${E2E.fakePort}/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm tsx tests/e2e/seed.ts && pnpm next dev -p ${E2E.port}`,
      url: `${baseURL}/g`,
      reuseExistingServer: false,
      timeout: 180_000,
      // PayPal and Channel3 = the local fakes. TETHER_E2E=1 is set ONLY here; without it (and outside production
      // only) paypalFromEnv / createChannel3 refuse a localhost address. e2e never calls PayPal or Channel3.
      env: {
        DATABASE_URL: E2E.dbUrl, APP_BASE_URL: baseURL, TETHER_E2E: "1",
        PAYPAL_BASE_URL: `http://localhost:${E2E.fakePort}`, PAYPAL_CLIENT_ID: "e2e-fake", PAYPAL_CLIENT_SECRET: "e2e-fake",
        CHANNEL3_BASE_URL: `http://localhost:${E2E.fakePort}`, CHANNEL3_API_KEY: "e2e-fake",
      },
    },
  ],
  use: { baseURL },
});
