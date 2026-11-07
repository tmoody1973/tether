import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { advance, now as clockNow } from "@/clock/clock";
import { decideApproval, requestApproval } from "@/flows/approvals";
import { signGrant } from "@/flows/grant";
import { closedRequestView, requestView } from "@/flows/request";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const REAL = new Date("2026-11-04T12:00:00Z").getTime();
const DAY_MS = 86_400_000;
const deps = () => ({ db, now: (familyId: string, conn?: Db) => clockNow(conn ?? db, familyId, REAL) });
const decision = { outcome: "ALLOW" as const, reasons: [], semanticRules: [] };
let n = 0;

async function family() {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `cr-${n}`, guardianName: "Amara", teenName: "Zoe" });
  await signGrant(deps(), fam.id, { level: 3 });
  const mid = `cr-m${n}`;
  await db.insert(t.merchants).values({ id: mid, name: "Target", domain: `cr${n}.example`, class: "general", opensAtLevel: 1 });
  const now = await deps().now(fam.id);
  /** Zoe's $5.00 in VTI, asked and waiting: the investment row and its open approval. */
  const invest = async () => {
    const id = `cr-inv${n}-${crypto.randomUUID()}`;
    await db.insert(t.investments).values({ id, familyId: fam.id, symbol: "VTI", amountCents: 500, answers: {}, status: "proposed" });
    return { id, approvalId: (await requestApproval(deps(), fam.id, "investment", id, null)).approvalId };
  };
  /** A $12.00 Target purchase waiting for Amara. */
  const purchase = async () => {
    const cart = { merchantId: mid, items: [{ sku: "s", title: "Sneakers", qty: 1, unitCents: 1200 }], totalCents: 1200 };
    const p = await repo.insertPurchase(db, { familyId: fam.id, cart, cartHash: `cr-h${n}-${crypto.randomUUID()}`, status: "needs_approval", decision });
    const approvalId = (await requestApproval(deps(), fam.id, "purchase", p.id, p.cartHash)).approvalId;
    return { id: p.id, approvalId };
  };
  return { familyId: fam.id, now, invest, purchase };
}

describe("closedRequestView", () => {
  it("an approved investment says what happened and where it stands now", async () => {
    const a = await family();
    const { id, approvalId } = await a.invest();
    await decideApproval(deps(), approvalId, "approved", a.familyId);
    await db.update(t.investments).set({ status: "queued", receiptNote: "Order accepted; fills at the open." }).where(eq(t.investments.id, id));
    expect(await requestView(db, a.familyId, approvalId, a.now)).toBeNull(); // the open page has nothing to show
    expect(await closedRequestView(db, a.familyId, approvalId, a.now)).toEqual({
      outcome: "approved", teenName: "Zoe", at: a.now, subject: "investment",
      investment: { symbol: "VTI", amountCents: 500, status: "queued", receiptNote: "Order accepted; fills at the open." },
    });
  });

  it("a declined request and a request that ran out of time are told apart", async () => {
    const a = await family();
    const declined = await a.invest();
    await decideApproval(deps(), declined.approvalId, "declined", a.familyId);
    expect(await closedRequestView(db, a.familyId, declined.approvalId, a.now)).toMatchObject({ outcome: "declined", at: a.now });

    const slow = await a.invest();
    await advance(db, a.familyId, 2 * DAY_MS);
    const later = await clockNow(db, a.familyId, REAL);
    const v = await closedRequestView(db, a.familyId, slow.approvalId, later); // no one called expireStale first: still "expired"
    expect(v).toMatchObject({ outcome: "expired", investment: { symbol: "VTI", amountCents: 500 } });
    expect(v?.at).toEqual(new Date(a.now.getTime() + DAY_MS)); // when it ran out, not when she happened to look
  });

  it("an approved purchase carries the shop and where the payment stands", async () => {
    const a = await family();
    const p = await a.purchase();
    await decideApproval(deps(), p.approvalId, "approved", a.familyId);
    await db.update(t.purchases).set({ status: "paid" }).where(eq(t.purchases.id, p.id));
    expect(await closedRequestView(db, a.familyId, p.approvalId, a.now)).toMatchObject({
      outcome: "approved", subject: "purchase", purchase: { amountCents: 1200, shop: "Target", status: "paid" },
    });
  });

  it("a fund and a shop request name what was asked", async () => {
    const a = await family();
    await db.insert(t.fundProposals).values({ id: `cr-fp${n}`, familyId: a.familyId, symbol: "VOO", answers: {}, status: "proposed" });
    const fund = (await requestApproval(deps(), a.familyId, "fund", `cr-fp${n}`, null)).approvalId;
    await decideApproval(deps(), fund, "approved", a.familyId);
    expect(await closedRequestView(db, a.familyId, fund, a.now)).toMatchObject({ outcome: "approved", subject: "fund", fund: { symbol: "VOO" } });
    const shop = (await requestApproval(deps(), a.familyId, "shop", "nike.com", null)).approvalId;
    await decideApproval(deps(), shop, "declined", a.familyId);
    expect(await closedRequestView(db, a.familyId, shop, a.now)).toMatchObject({ outcome: "declined", subject: "shop", shop: { domain: "nike.com" } });
  });

  it("is null for an unknown id, another family's decided request, and a request that is still open", async () => {
    const a = await family();
    const b = await family();
    const { approvalId } = await a.invest();
    expect(await closedRequestView(db, a.familyId, approvalId, a.now)).toBeNull(); // still open: the open page owns it
    await decideApproval(deps(), approvalId, "approved", a.familyId);
    expect(await closedRequestView(db, b.familyId, approvalId, b.now)).toBeNull(); // never reveals that it exists
    expect(await closedRequestView(db, a.familyId, "no-such-id", a.now)).toBeNull();
  });
});
