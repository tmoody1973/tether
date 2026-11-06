import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import type { PaypalHttp } from "@/adapters/paypal/http";
import type { Channel3Adapter } from "@/adapters/channel3/client";
import type { AlpacaBroker } from "@/adapters/alpaca/broker";
import { cartHash } from "@/engine/hash";
import { requestApproval } from "@/flows/approvals";
import { approveAndSettle, approvedPurchase, type ApproveDeps } from "@/flows/approve";
import { GrantError, guardianSetLevel, revoke, RulesStoppedError, signGrant } from "@/flows/grant";
import { proposePurchase } from "@/flows/purchase";
import { approveWords } from "@/ui/approveWords";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const NOW = new Date("2026-11-04T12:00:00Z");
let n = 0;

function deps(price: number | null, paypalOk = true): ApproveDeps {
  let k = 0;
  const paypal: PaypalHttp = {
    async request<T>(method: string) {
      if (method === "DELETE") return { status: 204, headers: new Headers(), data: {} as T };
      if (!paypalOk) throw new Error("PayPal is not configured here");
      const data = { id: `O${++k}`, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `AP-CAP-${n}-${k}`, status: "COMPLETED" }] } }] };
      return { status: 201, headers: new Headers(), data: data as T };
    },
  };
  const no = async () => { throw new Error("unused"); };
  const channel3: Channel3Adapter = {
    retrieve: async (sku, allowed) => (price === null ? null : { id: sku, title: "Shoes", priceCents: price, domain: allowed[0], available: true }),
    search: no, lookup: no, websites: no, shopsSelling: no,
  };
  return {
    db, paypal, channel3, secret: "approve-secret", now: async () => NOW,
    classifier: { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) },
    alpaca: () => { throw new Error("alpaca not configured"); },
  } as ApproveDeps & { alpaca: () => AlpacaBroker };
}

/** A first-time-shop $8 purchase at Level 1: it needs Amara's OK. */
async function asking() {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `ap-${n}`, guardianName: "Amara", teenName: "Zoe" });
  const mid = `ap-m${n}`;
  await db.insert(t.merchants).values({ id: mid, name: "Best Buy", domain: `ap${n}.example`, class: "general", channel3WebsiteId: `ap${n}.example`, opensAtLevel: 1 });
  await repo.saveVault(db, fam.id, `V-${n}`);
  await signGrant(deps(800), fam.id, { level: 1 });
  const cart = { merchantId: mid, items: [{ sku: "s1", title: "Shoes", qty: 1, unitCents: 800 }], totalCents: 800 };
  const { purchaseId, decision } = await proposePurchase(deps(800), fam.id, cart);
  expect(decision.outcome).toBe("NEEDS_APPROVAL");
  const { approvalId } = await requestApproval(deps(800), fam.id, "purchase", purchaseId, cartHash(cart));
  return { familyId: fam.id, purchaseId, approvalId };
}

describe("approveAndSettle (R36)", () => {
  it("one tap approves and charges: paid, with a receipt", async () => {
    const a = await asking();
    expect(await approveAndSettle(deps(800), a.familyId, a.approvalId)).toBe("paid");
    const [p] = await db.select().from(t.purchases).where(eq(t.purchases.id, a.purchaseId));
    expect(p.status).toBe("paid");
    expect(await db.select().from(t.receipts).where(eq(t.receipts.purchaseId, a.purchaseId))).toHaveLength(1);
    const paid = await approvedPurchase(db, a.familyId, a.approvalId);
    expect(approveWords("paid", "Zoe", paid).text).toBe("Approved and paid — $8.00 at Best Buy. The receipt is in the record.");
  });

  it("a changed price charges nothing; a settle that can't start still keeps the approval", async () => {
    const a = await asking();
    expect(await approveAndSettle(deps(900), a.familyId, a.approvalId)).toBe("changed");
    const b = await asking();
    expect(await approveAndSettle({ ...deps(800), secret: "" }, b.familyId, b.approvalId)).toBe("notstarted");
    const [approval] = await db.select().from(t.approvals).where(eq(t.approvals.id, b.approvalId));
    expect(approval.result).toBe("approved");
    expect(await db.select().from(t.receipts).where(eq(t.receipts.purchaseId, b.purchaseId))).toHaveLength(0);
  });

  it("another family's approval is refused before anything happens", async () => {
    const a = await asking();
    const other = await asking();
    await expect(approveAndSettle(deps(800), other.familyId, a.approvalId)).rejects.toThrow(/unknown approval/);
    expect((await db.select().from(t.purchases).where(eq(t.purchases.id, a.purchaseId)))[0].status).toBe("needs_approval");
  });
});

describe("stopped rules stay stopped", () => {
  it("guardianSetLevel after a revoke refuses until new rules are signed", async () => {
    const a = await asking();
    await revoke(deps(800), a.familyId);
    await expect(guardianSetLevel(deps(800), a.familyId, 2, "doing well")).rejects.toBeInstanceOf(RulesStoppedError);
    await expect(guardianSetLevel(deps(800), a.familyId, 2, "doing well")).rejects.toBeInstanceOf(GrantError);
    expect((await repo.getActiveGrant(db, a.familyId))).toBeNull();
    await signGrant(deps(800), a.familyId, { level: 1 });
    await guardianSetLevel(deps(800), a.familyId, 2, "doing well");
    expect((await repo.getActiveGrant(db, a.familyId))?.level).toBe(2);
  });
});
