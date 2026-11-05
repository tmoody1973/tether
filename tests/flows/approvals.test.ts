import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import type { PaypalHttp } from "@/adapters/paypal/http";
import type { Channel3Adapter, Product } from "@/adapters/channel3/client";
import type { Cart, Grant } from "@/engine/types";
import { settlePurchase, proposePurchase, type Deps } from "@/flows/purchase";
import { ledgerView } from "@/ledger/ledger";
import {
  ApprovalError, decideApproval, normaliseDomain, pendingApprovals, proposeShop, requestApproval, teenMessage,
} from "@/flows/approvals";

const DOMAIN = "books.example";
let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

let n = 0;
let nowMs = 0;
async function seed(start: string, over = true) {
  n++;
  nowMs = new Date(start).getTime();
  const familyId = (await repo.insertFamily(db, { name: "F", teenToken: `ap${n}`, guardianName: "Amara", teenName: "Z" })).id;
  const merchantId = `m${n}`;
  await db.insert(t.merchants).values({
    id: merchantId, name: "Book Barn", domain: DOMAIN, class: "books",
    channel3WebsiteId: DOMAIN, paypalPayeeEmail: "s@example.com", opensAtLevel: 1,
  });
  await db.insert(t.vault).values({ familyId, paymentTokenId: `V${n}` });
  const body: Grant = {
    id: `g${n}`, familyId, version: 1, level: 1, weeklyCents: 800, commitmentFloorPct: 10, matchPct: 50,
    constraints: [
      { type: "payment.budget", maxCents: 800, period: "WEEKLY" },
      { type: "payment.allowed_payees", merchantIds: [merchantId] },
      ...(over ? [{ type: "approval.over_amount", overCents: 500 } as const] : []),
    ],
    fundAllowlist: [], signedAt: "2026-11-02T00:00:00Z", expiresAt: "2026-12-09T00:00:00Z",
  };
  await repo.insertGrant(db, { id: body.id, familyId, version: 1, level: 1, body, signedAt: new Date(body.signedAt), expiresAt: new Date(body.expiresAt), status: "active" });
  return { familyId, merchantId };
}

const paypal: PaypalHttp = {
  async request<T>() {
    return { status: 201, headers: new Headers(), data: { id: "O1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `CAP-${Math.random()}`, status: "COMPLETED" }] } }] } as T };
  },
};
const channel3: Channel3Adapter = {
  retrieve: vi.fn(async (id: string): Promise<Product | null> => ({ id, title: "T", priceCents: 600, domain: DOMAIN, available: true })),
  search: async () => { throw new Error("x"); }, lookup: async () => { throw new Error("x"); }, websites: async () => { throw new Error("x"); },
};
const deps = (): Deps => ({
  db, paypal, channel3, classifier: { ask: async () => ({ probability: 0.99, model: "m", modelVersion: "1" }) },
  secret: "s", now: async () => new Date(nowMs),
});
const cartOf = (merchantId: string): Cart => ({ merchantId, items: [{ sku: "a", title: "Hobbit", qty: 1, unitCents: 600 }], totalCents: 600 });
const statusOf = async (id: string) => (await db.select().from(t.purchases).where(eq(t.purchases.id, id)))[0].status;

describe("approvals", () => {
  it("approve then settle charges", async () => {
    const { familyId, merchantId } = await seed("2026-11-04T12:00:00Z");
    const d = deps();
    const cart = cartOf(merchantId);
    const { purchaseId } = await proposePurchase(d, familyId, cart);
    expect((await settlePurchase(d, purchaseId)).status).toBe("needs_approval");
    const p = await repo.getPurchase(db, purchaseId);
    const { approvalId } = await requestApproval(d, familyId, "purchase", purchaseId, p!.cartHash);
    expect((await pendingApprovals(db, familyId, new Date(nowMs)))).toHaveLength(1);
    await decideApproval(d, approvalId, "approved");
    expect(await statusOf(purchaseId)).toBe("approved");
    expect((await settlePurchase(d, purchaseId)).status).toBe("paid");
    expect(await pendingApprovals(db, familyId, new Date(nowMs))).toHaveLength(0);
  });

  it("decline leaves purchase unpaid with teen message", async () => {
    const { familyId, merchantId } = await seed("2026-11-04T12:00:00Z");
    const d = deps();
    const { purchaseId } = await proposePurchase(d, familyId, cartOf(merchantId));
    const p = await repo.getPurchase(db, purchaseId);
    const { approvalId } = await requestApproval(d, familyId, "purchase", purchaseId, p!.cartHash);
    await decideApproval(d, approvalId, "declined");
    expect(await statusOf(purchaseId)).toBe("refused");
    expect((await repo.getPurchase(db, purchaseId))!.decision.reasons[0].constraint).toBe("DECLINED");
    expect(teenMessage("Amara")).toBe("Amara said not this time.");
  });

  it("week boundary: approval expired, purchase expired, new week budget fresh", async () => {
    const { familyId, merchantId } = await seed("2026-11-04T12:00:00Z"); // 2026-W45
    const d = deps();
    await repo.appendJournal(db, { familyId, kind: "spend", amountCents: 200, at: new Date(nowMs) } as never);
    const { purchaseId } = await proposePurchase(d, familyId, cartOf(merchantId));
    const p = await repo.getPurchase(db, purchaseId);
    const { approvalId } = await requestApproval(d, familyId, "purchase", purchaseId, p!.cartHash);
    await decideApproval(d, approvalId, "approved");
    nowMs = new Date("2026-11-09T00:00:01Z").getTime(); // W46; 24h cap would not have expired
    expect((await settlePurchase(d, purchaseId)).status).toBe("expired");
    expect(await statusOf(purchaseId)).toBe("expired");
    expect((await ledgerView(db, familyId, new Date(nowMs))).spentThisWeekCents).toBe(0);
    await expect(decideApproval(d, approvalId, "declined")).rejects.toBeInstanceOf(ApprovalError);
  });

  it("re-asking returns the same open approval", async () => {
    const { familyId } = await seed("2026-11-04T12:00:00Z");
    const d = deps();
    const a = await requestApproval(d, familyId, "fund", "p1", "h");
    const b = await requestApproval(d, familyId, "fund", "p1", "h");
    expect(b).toEqual(a);
  });

  it("deciding an expired approval throws", async () => {
    const { familyId } = await seed("2026-11-04T12:00:00Z");
    const d = deps();
    const { approvalId } = await requestApproval(d, familyId, "fund", "p2", "h");
    nowMs += 25 * 3_600_000; // past 24h, still inside W45
    await expect(decideApproval(d, approvalId, "approved")).rejects.toBeInstanceOf(ApprovalError);
  });

  it("expiry is capped at the ISO week end", async () => {
    const { familyId } = await seed("2026-11-08T20:00:00Z"); // Sunday, 4h before week end
    const { approvalId } = await requestApproval(deps(), familyId, "fund", "p3", "h");
    const [row] = await db.select().from(t.approvals).where(eq(t.approvals.id, approvalId));
    expect(row.expiresAt.toISOString()).toBe("2026-11-08T23:59:59.999Z");
  });

  it("approved shop suggestion appears in the next grant version's allowed payees", async () => {
    const { familyId } = await seed("2026-11-04T12:00:00Z", false);
    const d = deps();
    const { approvalId } = await proposeShop(d, familyId, "newshop.example", "cool stuff");
    expect((await pendingApprovals(db, familyId, new Date(nowMs)))[0]).toMatchObject({ subject: "shop", shopDomain: "newshop.example" });
    await decideApproval(d, approvalId, "approved");
    const g = (await repo.getActiveGrant(db, familyId))!;
    const m = (await db.select().from(t.merchants).where(eq(t.merchants.channel3WebsiteId, "newshop.example")))[0];
    expect(g.version).toBe(2);
    expect(m).toMatchObject({ class: "general", opensAtLevel: 1 });
    const payees = g.body.constraints.find((c) => c.type === "payment.allowed_payees") as { merchantIds: string[] };
    expect(payees.merchantIds).toContain(m.id);
    const old = await db.select().from(t.grants).where(eq(t.grants.familyId, familyId));
    expect(old.find((x) => x.version === 1)!.status).toBe("expired");
  });

  it("cannot approve or decline a paid purchase, nor approve a refused one", async () => {
    const { familyId, merchantId } = await seed("2026-11-04T12:00:00Z");
    const d = deps();
    const { purchaseId } = await proposePurchase(d, familyId, cartOf(merchantId));
    const p = await repo.getPurchase(db, purchaseId);
    const { approvalId } = await requestApproval(d, familyId, "purchase", purchaseId, p!.cartHash);
    await db.update(t.purchases).set({ status: "paid" }).where(eq(t.purchases.id, purchaseId));
    await expect(decideApproval(d, approvalId, "approved")).rejects.toBeInstanceOf(ApprovalError);
    await expect(decideApproval(d, approvalId, "declined")).rejects.toBeInstanceOf(ApprovalError);
    expect(await statusOf(purchaseId)).toBe("paid");
    // rolled back: the approval is still undecided
    expect((await db.select().from(t.approvals).where(eq(t.approvals.id, approvalId)))[0].result).toBeNull();
    await db.update(t.purchases).set({ status: "refused" }).where(eq(t.purchases.id, purchaseId));
    await expect(decideApproval(d, approvalId, "approved")).rejects.toBeInstanceOf(ApprovalError);
    expect(await statusOf(purchaseId)).toBe("refused");
  });

  it("requestApproval rejects refused purchases and mismatched cart hashes", async () => {
    const { familyId, merchantId } = await seed("2026-11-04T12:00:00Z");
    const d = deps();
    const { purchaseId } = await proposePurchase(d, familyId, cartOf(merchantId));
    const p = await repo.getPurchase(db, purchaseId);
    await expect(requestApproval(d, familyId, "purchase", purchaseId, "other-hash")).rejects.toBeInstanceOf(ApprovalError);
    await db.update(t.purchases).set({ status: "refused" }).where(eq(t.purchases.id, purchaseId));
    await expect(requestApproval(d, familyId, "purchase", purchaseId, p!.cartHash)).rejects.toBeInstanceOf(ApprovalError);
  });

  it("shop approval throws without an allowed_payees list or for a higher-level shop, and rolls back", async () => {
    const { familyId } = await seed("2026-11-04T12:00:00Z", false);
    const d = deps();
    const { approvalId } = await proposeShop(d, familyId, "high.example", "r");
    await db.insert(t.merchants).values({ id: `hi${n}`, name: "Hi", domain: "high.example", class: "general", channel3WebsiteId: "high.example", opensAtLevel: 3 });
    await expect(decideApproval(d, approvalId, "approved")).rejects.toBeInstanceOf(ApprovalError);
    expect((await db.select().from(t.approvals).where(eq(t.approvals.id, approvalId)))[0].result).toBeNull();
    expect((await repo.getActiveGrant(db, familyId))!.version).toBe(1);

    const g = (await repo.getActiveGrant(db, familyId))!;
    const body = { ...g.body, constraints: g.body.constraints.filter((c) => c.type !== "payment.allowed_payees") };
    await db.update(t.grants).set({ body }).where(eq(t.grants.id, g.id));
    const r = await proposeShop(d, familyId, "plain.example", "r");
    await expect(decideApproval(d, r.approvalId, "approved")).rejects.toBeInstanceOf(ApprovalError);
    expect(await db.select().from(t.merchants).where(eq(t.merchants.channel3WebsiteId, "plain.example"))).toHaveLength(0);
  });

  it("proposeShop normalises the domain, rejects junk, and keeps the note", async () => {
    expect(normaliseDomain("HTTPS://WWW.Nike.com/x?y=1")).toBe("nike.com");
    const { familyId } = await seed("2026-11-04T12:00:00Z", false);
    const d = deps();
    await expect(proposeShop(d, familyId, "not a domain", "r")).rejects.toBeInstanceOf(ApprovalError);
    await proposeShop(d, familyId, "HTTPS://WWW.Nike.com/x", "my shoes");
    const [p] = await pendingApprovals(db, familyId, new Date(nowMs));
    expect(p).toMatchObject({ subjectId: "nike.com", shopDomain: "nike.com", note: "my shoes", cartHash: null });
  });
});
