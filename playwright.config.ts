import { defineConfig } from "@playwright/test";
import { E2E } from "./tests/e2e/fixtures";

const baseURL = `http://localhost:${E2E.port}`;

// Own port and a freshly seeded on-disk PGlite every run; never reuses whatever else is on :3000.
const live = process.env.LIVE_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1, // one PGlite, one dev server
  // `local` is the default suite (fakes, local dev server). `live` hits the deployed demo (Task 20: LIVE_BASE_URL=https://... pnpm e2e --project=live)
  // and only runs live.spec.ts; with no LIVE_BASE_URL its tests skip themselves.
  projects: [
    { name: "local", testIgnore: /live\.spec\.ts/, use: { baseURL } },
    { name: "live", testMatch: /live\.spec\.ts/, use: { baseURL: live ?? baseURL } },
  ],
  // With LIVE_BASE_URL set we are testing a hosted deploy: no local servers, and TETHER_E2E is never set anywhere near it.
  webServer: live ? [] : [
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
      // PayPal, Channel3 and Alpaca = the local fakes. TETHER_E2E=1 is set ONLY here; without it (and outside production
      // only) paypalFromEnv / createChannel3 / alpacaFromEnv refuse a localhost address. e2e never calls PayPal, Channel3 or Alpaca.
      env: {
        DATABASE_URL: E2E.dbUrl, APP_BASE_URL: baseURL, TETHER_E2E: "1",
        PAYPAL_BASE_URL: `http://localhost:${E2E.fakePort}`, PAYPAL_CLIENT_ID: "e2e-fake", PAYPAL_CLIENT_SECRET: "e2e-fake",
        CHANNEL3_BASE_URL: `http://localhost:${E2E.fakePort}`, CHANNEL3_API_KEY: "e2e-fake",
        ALPACA_BROKER_BASE_URL: `http://localhost:${E2E.fakePort}`, ALPACA_DATA_BASE_URL: `http://localhost:${E2E.fakePort}`,
        ALPACA_AUTH_URL: `http://localhost:${E2E.fakePort}/v1/oauth2/token`, ALPACA_BROKER_KEY: "e2e-fake", ALPACA_BROKER_SECRET: "e2e-fake",
        ALPACA_FIRM_ACCOUNT_ID: "e2e-firm", ALPACA_CUSTODIAL_ENABLED: "false",
        // The landing page's demo buttons point at the read-only Amara & Zoe e2e family.
        DEMO_GUARDIAN_KEY: E2E.guardianKey, DEMO_TEEN_TOKEN: E2E.teenToken,
      },
    },
  ],
  use: { baseURL },
});
