// The shared demo family (Task 19, R43), seeded through the real flows: REAL sandbox PayPal vault charges and a
// sandbox Alpaca deposit. Sandbox only — refuses to run unless both PayPal and Alpaca point at their sandbox hosts.
//
//   DATABASE_URL=pglite:./.pglite/dev pnpm tsx --env-file=.env.local scripts/seed.ts
//
// Re-running archives the earlier demo family (its records stay) and seeds a fresh one with the same keys.
// Prints one line per week with ids truncated; never prints keys or secrets.
import { clockFor } from "@/clock/clock";
import { closeDb, openDb } from "@/db/client";
import { paypalFromEnv } from "@/adapters/paypal/http";
import { createChannel3 } from "@/adapters/channel3/client";
import { alpacaFromEnv } from "@/adapters/alpaca/broker";
import { seedDemo } from "@/flows/seed";

const PAYPAL_SANDBOX = "api-m.sandbox.paypal.com";
const ALPACA_SANDBOX = "broker-api.sandbox.alpaca.markets";

const host = (u: string | undefined) => { try { return new URL(u ?? "").hostname; } catch { return ""; } };

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

async function main() {
  if (host(process.env.PAYPAL_BASE_URL) !== PAYPAL_SANDBOX) throw new Error(`refusing: PAYPAL_BASE_URL must be https://${PAYPAL_SANDBOX}`);
  if (host(process.env.ALPACA_BROKER_BASE_URL) !== ALPACA_SANDBOX) throw new Error(`refusing: ALPACA_BROKER_BASE_URL must be https://${ALPACA_SANDBOX}`);
  const keys = { guardianKey: required("DEMO_GUARDIAN_KEY"), teenToken: required("DEMO_TEEN_TOKEN"), vaultId: required("PAYPAL_DEMO_VAULT_ID") };
  const db = await openDb(required("DATABASE_URL"));
  try {
    const r = await seedDemo({
      db, now: clockFor(db), secret: required("TETHER_SIGNING_KEY"),
      paypal: paypalFromEnv(), channel3: createChannel3(), alpaca: alpacaFromEnv(),
      // The seed buys nothing at the bookshop, so gate 2 is never asked; fail closed if it ever were.
      classifier: { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) },
      log: (line) => console.log(line),
    }, keys);
    const charges = r.weeks.reduce((n, w) => n + w.captureIds.length, 0) + r.thisWeekCaptureIds.length;
    console.log(`done: ${charges} sandbox charges, ${r.weeks.filter((w) => w.kept).length}/4 weeks kept, goal "${r.goal.title}" ($${(r.goal.targetCents / 100).toFixed(2)}), investing deposit ${r.investing?.status ?? "skipped"}`);
  } finally {
    await closeDb(db);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  console.error("Re-run the seed to finish setting up the demo family.");
  process.exit(1);
});
