// Minimal e2e seed (Task 19 builds the full demo seed): the demo shops, Amara & Zoe with a signed Level 1 grant,
// one paid receipt, one charge PayPal has but Tether has no receipt for, and one open request; plus a second family.
// Runs before the e2e dev server starts, because one PGlite directory can only be open in one process.
import { rmSync } from "node:fs";
import path from "node:path";
import { closeDb, openDb, type Db } from "@/db/client";
import { appendJournal, consumeToken, insertFamily, insertPurchase, insertReceipt, saveVault } from "@/db/repo";
import * as t from "@/db/schema";
import { clockFor } from "@/clock/clock";
import { signGrant } from "@/flows/grant";
import { E2E } from "./fixtures";

export const DEMO_MERCHANTS = [
  { id: "m_bestbuy", name: "Best Buy", domain: "bestbuy.com", class: "general", opensAtLevel: 1 },
  { id: "m_target", name: "Target", domain: "target.com", class: "general", opensAtLevel: 1 },
  { id: "m_barnesandnoble", name: "Barnes & Noble", domain: "barnesandnoble.com", class: "books", opensAtLevel: 2 },
  { id: "m_nike", name: "Nike", domain: "nike.com", class: "sneakers", opensAtLevel: 3 },
  { id: "m_uniqlo", name: "Uniqlo", domain: "uniqlo.com", class: "apparel", opensAtLevel: 3 },
].map((m) => ({ ...m, channel3WebsiteId: m.domain }));

const decision = { outcome: "ALLOW" as const, reasons: [], semanticRules: [] };
const cart = (cents: number, title: string) => ({ merchantId: "m_target", items: [{ sku: `sku-${cents}`, title, qty: 1, unitCents: cents }], totalCents: cents });
const DAY_MS = 86_400_000;

/** A family with a signed Level 1 grant and one request waiting for its guardian. */
async function family(db: Db, v: { guardianName: string; teenName: string; teenToken: string; guardianToken: string; approvalId: string }) {
  const fam = await insertFamily(db, { name: `${v.guardianName} & ${v.teenName}`, ...v });
  await saveVault(db, fam.id, `e2e-placeholder-${v.teenName}`); // never charged: e2e talks only to tests/e2e/fake-paypal.ts
  const grant = await signGrant({ db, now: clockFor(db) }, fam.id, { level: 1 });
  const now = new Date();
  const asking = await insertPurchase(db, { familyId: fam.id, cart: cart(1500, "Running shoes"), cartHash: `e2e-ask-${v.teenName}`, status: "needs_approval", decision });
  await db.insert(t.approvals).values({
    id: v.approvalId, familyId: fam.id, subject: "purchase", subjectId: asking.id, cartHash: asking.cartHash,
    expiresAt: new Date(now.getTime() + DAY_MS), note: "the ones I have are falling apart",
  });
  return { fam, grant, now };
}

/** A purchase as settlePurchase leaves it: money out of the budget, slip used, and (if PayPal answered) a receipt. */
async function bought(db: Db, familyId: string, g: { id: string; version: number }, at: Date, cents: number, tokenId: string, captureId: string | null) {
  const p = await insertPurchase(db, { familyId, cart: cart(cents, "Notebook"), cartHash: `e2e-${tokenId}`, status: captureId ? "paid" : "paying", decision });
  await appendJournal(db, { familyId, kind: "spend", amountCents: cents, at, ref: p.id, note: null });
  await consumeToken(db, tokenId, p.id);
  if (captureId) {
    await insertReceipt(db, { purchaseId: p.id, captureId, grantId: g.id, grantVersion: g.version, cartHash: p.cartHash, decision, approvalId: null });
  }
}

async function main() {
  rmSync(path.resolve(process.cwd(), E2E.dir), { recursive: true, force: true });
  const db = await openDb(E2E.dbUrl);
  await db.insert(t.merchants).values(DEMO_MERCHANTS);
  const zoe = await family(db, {
    guardianName: "Amara", teenName: "Zoe", teenToken: E2E.teenToken, guardianToken: E2E.guardianKey, approvalId: E2E.approvalId,
  });
  await bought(db, zoe.fam.id, zoe.grant, zoe.now, 600, E2E.tokens.receipt, E2E.receiptCapture);
  await bought(db, zoe.fam.id, zoe.grant, zoe.now, 450, E2E.tokens.missing, null); // PayPal has it; Tether crashed before the receipt
  const other = await family(db, {
    guardianName: "Sam", teenName: "Kai", teenToken: E2E.otherTeenToken, guardianToken: E2E.otherGuardianKey, approvalId: E2E.otherApprovalId,
  });
  await bought(db, other.fam.id, other.grant, other.now, 999, E2E.tokens.other, E2E.otherFamilyCapture);
  await closeDb(db);
}

main().catch((err) => { console.error(err); process.exit(1); });
