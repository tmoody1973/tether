/* Live smoke (sandbox PayPal + real Haiku; NOT run in CI): pnpm tsx --env-file=.env.local scripts/month-assistant-smoke.ts */
import { createAnthropic } from "@ai-sdk/anthropic";
import { askAboutMonth, readOnlyPaypalTools } from "@/ai/monthAssistant";
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";

async function main() {
  const db = createDb("pglite:memory");
  await migrateDb(db);
  const familyId = (await repo.insertFamily(db, { name: "Smoke", teenToken: "smoke", guardianName: "Amara", teenName: "Zoe" })).id;
  const month = new Date().toISOString().slice(0, 7);
  for (const [n, shop, cents] of [["1", "The Bookshop", 1250], ["2", "Comic Corner", 800]] as const) {
    await db.insert(t.merchants).values({ id: `m${n}`, name: shop, domain: `${n}.example`, class: "books", opensAtLevel: 1 });
    const body = { id: `g${n}`, familyId, version: Number(n), level: 1 as const, weeklyCents: 800, commitmentFloorPct: 0, matchPct: 0, constraints: [], fundAllowlist: [], signedAt: new Date().toISOString(), expiresAt: new Date().toISOString() };
    await repo.insertGrant(db, { id: `g${n}`, familyId, version: Number(n), level: 1, body, signedAt: new Date(), expiresAt: new Date(), status: "active" });
    const p = await repo.insertPurchase(db, { familyId, cartHash: `h${n}`, status: "paid", decision: { outcome: "allow", reasons: [] } as never,
      cart: { merchantId: `m${n}`, items: [{ sku: "a", title: "Item", qty: 1, unitCents: cents }], totalCents: cents } });
    await repo.appendJournal(db, { familyId, kind: "spend", amountCents: cents, at: new Date(), ref: p.id, note: null });
    await repo.insertReceipt(db, { purchaseId: p.id, captureId: `cap${n}`, grantId: `g${n}`, grantVersion: Number(n), cartHash: `h${n}`, decision: p.decision, approvalId: null });
  }
  const { answer, toolsUsed } = await askAboutMonth({
    model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })("claude-haiku-5-5"),
    paypalTools: readOnlyPaypalTools({ clientId: process.env.PAYPAL_CLIENT_ID!, clientSecret: process.env.PAYPAL_CLIENT_SECRET!, sandbox: true }),
    db,
  }, familyId, `How much did Zoe spend this month (${month})?`);
  console.log({ answer, toolsUsed });
}
main().catch((e) => { console.error("smoke failed:", e instanceof Error ? e.message : "unknown"); process.exit(1); });
