// Minimal e2e seed (Task 19 builds the full demo seed): the demo shops and one family per state-changing test
// (see fixtures.ts), so the tests don't depend on each other's order.
// Runs before the e2e dev server starts, because one PGlite directory can only be open in one process.
import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import path from "node:path";
import { closeDb, openDb, type Db } from "@/db/client";
import { appendJournal, consumeToken, insertFamily, insertPurchase, insertReceipt, saveVault } from "@/db/repo";
import * as t from "@/db/schema";
import { clockFor } from "@/clock/clock";
import { cartHash } from "@/engine/hash";
import { signGrant } from "@/flows/grant";
import { advanceDemoClock } from "@/flows/demo";
import { DEMO_MERCHANTS } from "@/flows/seed";
import type { Cart } from "@/engine/types";
import { E2E } from "./fixtures";

const ALLOW = { outcome: "ALLOW" as const, reasons: [], semanticRules: [] };
const ASK = { outcome: "NEEDS_APPROVAL" as const, reasons: [{ constraint: "approval.over_amount", detail: "over" }], semanticRules: [], gate2: [] };
// The fake Channel3 prices `sku-<cents>` at <cents>, so these carts re-price to themselves at settle time.
const cart = (merchantId: string, cents: number, title: string): Cart =>
  ({ merchantId, items: [{ sku: `sku-${cents}`, title, qty: 1, unitCents: cents }], totalCents: cents });
const DAY_MS = 86_400_000;

type Fam = { id: string; grant: { id: string; version: number } };

async function family(
  db: Db, guardianToken: string, teenToken: string, names = { guardianName: "Amara", teenName: "Zoe" },
  rules: { level: 1 | 2 | 3; fundAllowlist?: string[]; spending?: { mode: "every" } } = { level: 1 },
): Promise<Fam> {
  const fam = await insertFamily(db, { name: `${names.guardianName} & ${names.teenName}`, ...names, teenToken, guardianToken });
  await saveVault(db, fam.id, `e2e-placeholder-${teenToken}`); // only ever sent to the local fake PayPal
  const grant = await signGrant({ db, now: clockFor(db) }, fam.id, rules);
  return { id: fam.id, grant };
}

/** A request waiting for the guardian, with a fixed approval id. */
async function asking(db: Db, f: Fam, approvalId: string, c: Cart, note: string) {
  const p = await insertPurchase(db, { familyId: f.id, cart: c, cartHash: cartHash(c), status: "needs_approval", decision: ASK });
  await db.insert(t.approvals).values({
    id: approvalId, familyId: f.id, subject: "purchase", subjectId: p.id, cartHash: p.cartHash,
    expiresAt: new Date(Date.now() + DAY_MS), note,
  });
}

/** A purchase as settlePurchase leaves it: money out of the budget, slip used, and (if PayPal answered) a receipt. */
async function bought(db: Db, f: Fam, cents: number, tokenId: string, captureId: string | null): Promise<void> {
  const c = cart("m_target", cents, "Notebook");
  const p = await insertPurchase(db, { familyId: f.id, cart: c, cartHash: cartHash(c), status: captureId ? "paid" : "paying", decision: ALLOW });
  await appendJournal(db, { familyId: f.id, kind: "spend", amountCents: cents, at: new Date(), ref: p.id, note: null });
  await consumeToken(db, tokenId, p.id);
  if (captureId) {
    await insertReceipt(db, { purchaseId: p.id, captureId, grantId: f.grant.id, grantVersion: f.grant.version, cartHash: p.cartHash, decision: ALLOW, approvalId: null });
  }
}

async function main() {
  rmSync(path.resolve(process.cwd(), E2E.dir), { recursive: true, force: true });
  const db = await openDb(E2E.dbUrl);
  await db.insert(t.merchants).values(DEMO_MERCHANTS);

  const zoe = await family(db, E2E.guardianKey, E2E.teenToken);
  await bought(db, zoe, 600, E2E.tokens.receipt, E2E.receiptCapture);
  await bought(db, zoe, 450, E2E.tokens.missing, null); // PayPal has it; Tether crashed before the receipt
  await asking(db, zoe, E2E.approvalId, cart("m_target", 1500, "Running shoes"), "the ones I have are falling apart");

  const grantFam = await family(db, E2E.grantKey, "e2e-teen-grant");
  await db.insert(t.goals).values({ familyId: grantFam.id, title: "Space One Pro headphones", targetCents: 16999 }); // Home labels the goal by name
  // $8 at a shop she hasn't used: needs Amara at Level 1, and fits the $20 week, so approving pays it.
  await asking(db, await family(db, E2E.approveKey, "e2e-teen-approve"), E2E.approveApprovalId, cart("m_bestbuy", 800, "Earbuds"), "mine broke");
  await family(db, E2E.levelKey, "e2e-teen-level");
  await family(db, E2E.revokeKey, "e2e-teen-revoke");
  const unsigned = await family(db, E2E.signKey, "e2e-teen-sign");
  await db.update(t.grants).set({ status: "revoked" }).where(eq(t.grants.id, unsigned.grant.id)); // no rules in force

  // Teen screens: Zoe has bought at Target this week ($6 of $20), so Target counts as a shop she's used.
  const teen = async (token: string, key: string) => {
    const f = await family(db, key, token);
    await bought(db, f, 600, `e2e-token-${token}`, `E2E-CAP-${token}`);
    return f;
  };
  await teen(E2E.teen.agent, "e2e-guardian-key-teen-agent");
  await teen(E2E.teen.buy, "e2e-guardian-key-teen-buy");
  await teen(E2E.teen.ask, E2E.teenAskKey);
  await teen(E2E.teen.reset, E2E.teenResetKey);
  await teen(E2E.teen.sheet, "e2e-guardian-key-teen-sheet");
  const over = await teen(E2E.teen.over, E2E.teenOverKey);
  await bought(db, over, 450, "e2e-token-teen-over-2", "E2E-CAP-teen-over-2"); // $10.50 spent, $9.50 left
  await teen(E2E.consentTeen, E2E.consentKey); // decision 030
  await teen(E2E.pauseTeen, E2E.pauseKey);
  const clause = await family(db, E2E.clauseKey, "e2e-teen-clause", undefined, { level: 1, spending: { mode: "every" } });
  await db.update(t.grants).set({ status: "revoked" }).where(eq(t.grants.id, clause.grant.id)); // stopped on "every purchase"
  const paused = await teen(E2E.teen.paused, "e2e-guardian-key-teen-paused");
  await db.update(t.grants).set({ status: "revoked" }).where(eq(t.grants.id, paused.grant.id)); // Amara stopped the rules
  const ended = await teen(E2E.teen.ended, "e2e-guardian-key-teen-ended");
  await advanceDemoClock({ db, now: clockFor(db) }, ended.id, "week"); // her 7-day rules run out; the week closes

  // Task 18b. Savings are a closed week's unspent allowance (D3), journalled as the week close would.
  const saved = (f: Fam, cents: number) =>
    appendJournal(db, { familyId: f.id, kind: "week_close", amountCents: cents, at: new Date(), ref: "2026-W44", note: null });
  const zoeNames = { guardianName: "Amara", teenName: "Zoe" };
  const priced = await teen(E2E.goalPriceTeen, E2E.goalPriceKey); // decision 031
  await saved(priced, 3400);
  await db.insert(t.goals).values({ familyId: priced.id, title: "Space headphones", targetCents: 16999, channel3ProductId: "sku-14999" });
  await saved(await teen(E2E.teenB.goals, "e2e-guardian-key-teen-goals"), 3400); // $34 toward a goal she names in the test
  await teen(E2E.teenB.promise, "e2e-guardian-key-teen-promise");
  await teen(E2E.teenB.map, E2E.teenMapKey);
  await saved(await family(db, E2E.teenFundKey, E2E.teenB.fund, zoeNames, { level: 3 }), 2000);
  await saved(await family(db, "e2e-guardian-key-teen-look", E2E.teenB.look, zoeNames, { level: 3 }), 2000);
  await saved(await family(db, E2E.teenQueuedKey, E2E.teenB.queued, zoeNames, { level: 2, fundAllowlist: ["VTI"] }), 2000);
  await saved(await family(db, E2E.teenStockKey, E2E.teenB.stock, zoeNames, { level: 2 }), 2000);

  const other = await family(db, E2E.otherGuardianKey, "e2e-teen-other", { guardianName: "Sam", teenName: "Kai" });
  await asking(db, other, E2E.otherApprovalId, cart("m_target", 1500, "Running shoes"), "the ones I have are falling apart");
  await bought(db, other, 999, E2E.tokens.other, E2E.otherFamilyCapture);
  // Seeded history isn't "just now": the shop throttle counts purchase rows by real creation time (hourly limit).
  await db.update(t.purchases).set({ createdAt: new Date(Date.now() - 2 * 3_600_000) });
  await closeDb(db);
}

main().catch((err) => { console.error(err); process.exit(1); });
