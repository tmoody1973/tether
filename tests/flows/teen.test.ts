import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { cartHash } from "@/engine/hash";
import type { Cart } from "@/engine/types";
import { revoke, signGrant } from "@/flows/grant";
import { guardianHome } from "@/flows/home";
import { pendingApprovals } from "@/flows/approvals";
import { askAmara, buy, markLevelSeen, nudge, proposeCarts, refusalSentence, shopThrottle, teenWeek, TeenError, THROTTLED } from "@/flows/teen";
import type { Llm } from "@/ai/llm";
import type { Deps } from "@/flows/purchase";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const NOW = new Date("2026-11-04T12:00:00Z"); // Wed, 2026-W45
const DAY = 86_400_000;
let clock = NOW;
let n = 0;

const deps = (): Deps => ({
  db, now: async () => clock, secret: "s",
  paypal: { configured: false, request: async () => { throw new Error("no paypal in this test"); } },
  channel3: { search: async () => [], lookup: async () => ({ kind: "not_a_product" }), retrieve: async () => null, websites: async () => [] },
  classifier: { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) },
});

async function seed() {
  n++;
  clock = NOW;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `teen-${n}`, guardianName: "Amara", teenName: "Zoe" });
  const tgt = `tg${n}`;
  await db.insert(t.merchants).values([
    { id: tgt, name: "Target", domain: `${tgt}.com`, class: "general", opensAtLevel: 1, channel3WebsiteId: `${tgt}.com` },
    { id: `bb${n}`, name: "Best Buy", domain: `bb${n}.com`, class: "general", opensAtLevel: 1, channel3WebsiteId: `bb${n}.com` },
  ]);
  await repo.saveVault(db, fam.id, `PT${n}`);
  const grant = await signGrant({ db, now: async () => clock }, fam.id, { level: 1 });
  return { familyId: fam.id, tgt, bb: `bb${n}`, grant };
}

const cart = (merchantId: string, cents: number, title = "Notebook"): Cart =>
  ({ merchantId, items: [{ sku: `sku-${cents}`, title, qty: 1, unitCents: cents }], totalCents: cents });

/** A paid purchase at `merchantId` this week (so the shop counts as used). */
async function paid(familyId: string, merchantId: string, cents: number, grant: { id: string; version: number }) {
  const c = cart(merchantId, cents);
  const p = await repo.insertPurchase(db, { familyId, cart: c, cartHash: cartHash(c), status: "paid", decision: { outcome: "ALLOW", reasons: [], semanticRules: [] } });
  await repo.appendJournal(db, { familyId, kind: "spend", amountCents: cents, at: clock, ref: p.id, note: null });
  await repo.insertReceipt(db, { purchaseId: p.id, captureId: `CAP-${p.id}`, grantId: grant.id, grantVersion: grant.version, cartHash: p.cartHash, decision: p.decision, approvalId: null });
  return p.id;
}

describe("teenWeek (what Zoe's week reads)", () => {
  it("active week: what's left, this week's purchases, level and progress", async () => {
    const s = await seed();
    await paid(s.familyId, s.tgt, 1200, s.grant);
    const w = await teenWeek(db, s.familyId, NOW);
    expect(w).toMatchObject({
      state: "active", level: 1, weeklyCents: 2000, spentCents: 1200, leftCents: 800, streak: 0,
      teenName: "Zoe", guardianName: "Amara", release: null, levelUp: null, nudged: false,
    });
    expect(w.purchases).toEqual([expect.objectContaining({ title: "Notebook", shop: "Target", amountCents: 1200, status: "paid" })]);
    expect(w.commitmentCents).toBe(200); // the 10% floor: an unset promise is never zero
  });

  it("ended rules ⇒ week ended; stopped rules ⇒ paused", async () => {
    const s = await seed();
    expect((await teenWeek(db, s.familyId, new Date(NOW.getTime() + 8 * DAY))).state).toBe("ended");
    await revoke({ db, now: async () => clock, paypal: deps().paypal }, s.familyId);
    expect((await teenWeek(db, s.familyId, NOW)).state).toBe("paused");
  });

  it("release notice: Amara is sending, then sent", async () => {
    const s = await seed();
    const [r] = await db.insert(t.releases).values({ id: `rel-${n}`, familyId: s.familyId, savedCents: 3400, matchCents: 3400 }).returning();
    expect((await teenWeek(db, s.familyId, NOW)).release).toEqual({ cents: 6800, confirmed: false });
    await db.update(t.releases).set({ confirmedAt: NOW }).where(eq(t.releases.id, r.id));
    expect((await teenWeek(db, s.familyId, NOW)).release).toEqual({ cents: 6800, confirmed: true });
    expect((await teenWeek(db, s.familyId, new Date(NOW.getTime() + 8 * DAY))).release).toBeNull();
  });

  it("level-up moment shows once, until she taps Nice", async () => {
    const s = await seed();
    await db.insert(t.levelChanges).values({ id: `lc-${n}`, familyId: s.familyId, fromLevel: 1, toLevel: 2, by: "engine", reason: "kept", at: NOW });
    expect((await teenWeek(db, s.familyId, NOW)).levelUp).toMatchObject({ fromLevel: 1, toLevel: 2 });
    await markLevelSeen({ db }, s.familyId);
    expect((await teenWeek(db, s.familyId, NOW)).levelUp).toBeNull();
  });

  it("a guardian move is not a level-up moment", async () => {
    const s = await seed();
    await db.insert(t.levelChanges).values({ id: `lc-${n}`, familyId: s.familyId, fromLevel: 1, toLevel: 2, by: "guardian", reason: "r", at: NOW });
    expect((await teenWeek(db, s.familyId, NOW)).levelUp).toBeNull();
  });
});

describe("shopping: propose, ask, buy", () => {
  it("every card carries the engine's outcome", async () => {
    const s = await seed();
    await paid(s.familyId, s.tgt, 600, s.grant);
    const cards = await proposeCarts(deps(), s.familyId, [
      { cart: cart(s.tgt, 500), reason: "cheapest" }, { cart: cart(s.bb, 800) }, { cart: cart(s.tgt, 1500) },
    ]);
    expect(cards.map((c) => [c.shop, c.priceCents, c.decision.outcome])).toEqual([
      ["Target", 500, "ALLOW"], ["Best Buy", 800, "NEEDS_APPROVAL"], ["Target", 1500, "REFUSE"],
    ]);
    expect(cards[0].reason).toBe("cheapest");
    expect(cards[2].decision.reasons.map((r) => r.constraint)).toContain("payment.budget");
  });

  it("ask on a cart that needs her OK opens a request Amara sees", async () => {
    const s = await seed();
    const [card] = await proposeCarts(deps(), s.familyId, [{ cart: cart(s.bb, 800, "Earbuds") }]);
    expect(await askAmara(deps(), s.familyId, card.purchaseId, "mine broke")).toBe("request");
    expect(await pendingApprovals(db, s.familyId, NOW)).toEqual([expect.objectContaining({ subjectId: card.purchaseId, note: "mine broke" })]);
    expect((await teenWeek(db, s.familyId, NOW)).asks).toEqual([expect.objectContaining({ title: "Earbuds", status: "waiting" })]);
  });

  it("ask on a refused cart tells Amara, without a button (approval never lifts a refusal)", async () => {
    const s = await seed();
    const [card] = await proposeCarts(deps(), s.familyId, [{ cart: cart(s.tgt, 2500, "Shoes") }]);
    expect(await askAmara(deps(), s.familyId, card.purchaseId, "falling apart")).toBe("message");
    expect(await pendingApprovals(db, s.familyId, NOW)).toEqual([]);
    const h = await guardianHome(db, s.familyId, NOW);
    expect(h.needsYou).toContainEqual({ kind: "message", note: "Shoes, $25.00 at Target ($20.00 left this week) — “falling apart”" });
    expect((await guardianHome(db, s.familyId, new Date(NOW.getTime() + 7 * DAY))).needsYou).not.toContainEqual(expect.objectContaining({ kind: "message" }));
  });

  it("R40: over this week's budget and nothing else ⇒ a real request Amara can approve", async () => {
    const s = await seed();
    await paid(s.familyId, s.tgt, 1050, s.grant);
    const [card] = await proposeCarts(deps(), s.familyId, [{ cart: cart(s.tgt, 1500, "Running shoes") }]);
    expect(card.decision.outcome).toBe("REFUSE");
    expect(await askAmara(deps(), s.familyId, card.purchaseId, "falling apart")).toBe("request");
    expect(await pendingApprovals(db, s.familyId, NOW)).toEqual([expect.objectContaining({ subjectId: card.purchaseId, liftsBudget: true })]);
    expect((await teenWeek(db, s.familyId, NOW)).asks).toEqual([expect.objectContaining({ title: "Running shoes", status: "waiting" })]);
  });

  it("asking needs rules in force", async () => {
    const s = await seed();
    const [card] = await proposeCarts(deps(), s.familyId, [{ cart: cart(s.bb, 800) }]);
    clock = new Date(NOW.getTime() + 8 * DAY);
    await expect(askAmara(deps(), s.familyId, card.purchaseId, null)).rejects.toBeInstanceOf(TeenError);
  });

  it("another family's purchase is unknown to buy and ask", async () => {
    const a = await seed();
    const [card] = await proposeCarts(deps(), a.familyId, [{ cart: cart(a.tgt, 500) }]);
    const b = await seed();
    await expect(buy(deps(), b.familyId, card.purchaseId)).rejects.toBeInstanceOf(TeenError);
    await expect(askAmara(deps(), b.familyId, card.purchaseId, null)).rejects.toBeInstanceOf(TeenError);
  });

  it("buy only settles a cart the engine allowed", async () => {
    const s = await seed();
    const [card] = await proposeCarts(deps(), s.familyId, [{ cart: cart(s.tgt, 2500) }]);
    expect(await buy(deps(), s.familyId, card.purchaseId)).toEqual({ status: "refused" });
  });
});

describe("nudge", () => {
  it("week ended + nudge ⇒ Amara sees she was nudged to renew", async () => {
    const s = await seed();
    clock = new Date(NOW.getTime() + 8 * DAY);
    await nudge(deps(), s.familyId, null);
    expect((await teenWeek(db, s.familyId, clock)).nudged).toBe(true);
    expect((await guardianHome(db, s.familyId, clock)).needsYou[0]).toEqual({ kind: "rules", nudged: true });
  });
});

describe("refusal sentence (I4)", () => {
  it("is written once and stored on the decision; re-rendering asks no model", async () => {
    const s = await seed();
    const c = cart(s.tgt, 500);
    const decision = { outcome: "REFUSE" as const, semanticRules: [], reasons: [{ constraint: "payment.allowed_payees", detail: "not on the list" }] };
    const p = await repo.insertPurchase(db, { familyId: s.familyId, cart: c, cartHash: cartHash(c), status: "refused", decision });
    let calls = 0;
    const llm: Llm = { json: (async () => { calls++; return { sentence: "That shop isn't on your list yet." }; }) as Llm["json"] };
    const ctx = { teenName: "Zoe", guardianName: "Amara" };
    const first = await refusalSentence(db, s.familyId, p, llm, ctx);
    const stored = (await repo.getPurchase(db, p.id))!;
    expect(stored.decision.explained).toBe(first.sentence);
    const again = await refusalSentence(db, s.familyId, stored, llm, ctx);
    expect(calls).toBe(1);
    expect(again).toMatchObject({ sentence: first.sentence, routes: first.routes });
  });
});

describe("shopThrottle (real time)", () => {
  it("refuses past 300 purchase rows an hour (I3); an agent run right after a new purchase row (e.g. a demo reset) is fine", async () => {
    const s = await seed();
    expect(await shopThrottle(db, s.familyId, "agent", Date.now())).toBeNull();
    await proposeCarts(deps(), s.familyId, [{ cart: cart(s.tgt, 500) }]);
    expect(await shopThrottle(db, s.familyId, "agent", Date.now())).toBeNull(); // no 5 s gap any more
    const c = cart(s.tgt, 100);
    const row = { familyId: s.familyId, cart: c, cartHash: cartHash(c), status: "refused" as const, decision: { outcome: "REFUSE" as const, reasons: [], semanticRules: [] } };
    await db.insert(t.purchases).values(Array.from({ length: 298 }, () => ({ ...row, id: crypto.randomUUID() })));
    expect(await shopThrottle(db, s.familyId, "search", Date.now())).toBeNull(); // 299: ~50 searches still fit
    await db.insert(t.purchases).values({ ...row, id: crypto.randomUUID() });
    expect(THROTTLED).toBe("Lots of looking this hour — try again in a few minutes.");
    expect(await shopThrottle(db, s.familyId, "search", Date.now())).toBe(THROTTLED);
    expect(await shopThrottle(db, s.familyId, "agent", Date.now())).toBe(THROTTLED);
    expect(await shopThrottle(db, s.familyId, "search", Date.now() + 3_700_000)).toBeNull(); // an hour later
  });
});
