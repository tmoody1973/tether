import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { cartHash } from "@/engine/hash";
import type { Cart } from "@/engine/types";
import { signGrant } from "@/flows/grant";
import { closeWeek } from "@/flows/week";
import { guardianHome } from "@/flows/home";
import { decideApproval, expireStale } from "@/flows/approvals";
import { INVEST_STATUS } from "@/ui/investWords";
import type { Deps } from "@/flows/purchase";
import { setGoal, setTeenCommitment, teenGoals } from "@/flows/teenGoals";
import { shopMap, suggestShop } from "@/flows/teenMap";
import { canPropose, fundStatus, proposeFromTeen, teenInvestments, type Answers } from "@/flows/teenInvest";
import { proposeInvestment } from "@/flows/invest";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const NOW = new Date("2026-11-04T12:00:00Z"); // Wed, 2026-W45
let clock = NOW;
let n = 0;

const deps = (): Deps => ({
  db, now: async () => clock, secret: "s",
  paypal: { configured: false, request: async () => { throw new Error("no paypal in this test"); } },
  channel3: { search: async () => [], lookup: async () => ({ kind: "not_a_product" }), retrieve: async () => null, websites: async () => [] },
  classifier: { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) },
});

/** A family at `level` with its own shops: a used Target, an unused Best Buy, a bookshop (L2) and a sneaker shop (L3). */
async function seed(level: 1 | 2 | 3 = 1, extra: { fundAllowlist?: string[]; savedCents?: number } = {}) {
  n++;
  clock = NOW;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `teen-gmi-${n}`, guardianName: "Amara", teenName: "Zoe" });
  const m = { tgt: `t${n}`, bb: `b${n}`, bn: `n${n}`, nike: `k${n}` };
  await db.insert(t.merchants).values([
    { id: m.tgt, name: "Target", domain: `${m.tgt}.com`, class: "general", opensAtLevel: 1, channel3WebsiteId: `${m.tgt}.com`, addedByFamilyId: fam.id },
    { id: m.bb, name: "Best Buy", domain: `${m.bb}.com`, class: "general", opensAtLevel: 1, channel3WebsiteId: `${m.bb}.com`, addedByFamilyId: fam.id },
    { id: m.bn, name: "Barnes & Noble", domain: `${m.bn}.com`, class: "books", opensAtLevel: 2, channel3WebsiteId: `${m.bn}.com`, addedByFamilyId: fam.id },
    { id: m.nike, name: "Nike", domain: `${m.nike}.com`, class: "sneakers", opensAtLevel: 3, channel3WebsiteId: `${m.nike}.com`, addedByFamilyId: fam.id },
  ]);
  await signGrant({ db, now: async () => clock }, fam.id, { level, fundAllowlist: extra.fundAllowlist });
  const c: Cart = { merchantId: m.tgt, items: [{ sku: "sku-600", title: "Notebook", qty: 1, unitCents: 600 }], totalCents: 600 };
  await repo.insertPurchase(db, { familyId: fam.id, cart: c, cartHash: cartHash(c), status: "paid", decision: { outcome: "ALLOW", reasons: [], semanticRules: [] } });
  if (extra.savedCents) await repo.appendJournal(db, { familyId: fam.id, kind: "week_close", amountCents: extra.savedCents, at: NOW, ref: "2026-W44", note: null });
  return { familyId: fam.id, m };
}

describe("goals and her savings promise", () => {
  it("setGoal validates, then upserts; teenGoals reads goal, savings, promise and floor", async () => {
    const s = await seed(1, { savedCents: 3400 });
    expect(await setGoal(deps(), s.familyId, "  ", 8900)).toEqual({ ok: false, error: "title" });
    expect(await setGoal(deps(), s.familyId, "x".repeat(41), 8900)).toEqual({ ok: false, error: "title" });
    expect(await setGoal(deps(), s.familyId, "Headphones", 50)).toEqual({ ok: false, error: "target" });
    expect(await setGoal(deps(), s.familyId, "Headphones", 89.5)).toEqual({ ok: false, error: "target" });
    expect(await setGoal(deps(), s.familyId, "Headphones", 8900)).toEqual({ ok: true });
    expect(await setGoal(deps(), s.familyId, "Better headphones", 9900)).toEqual({ ok: true }); // rename: still one goal
    const g = await teenGoals(db, s.familyId, NOW);
    expect(g.week.goal).toEqual({ title: "Better headphones", targetCents: 9900 });
    expect(g).toMatchObject({ commitmentCents: 200, pendingCents: null, floorCents: 200, weeklyCents: 2000, matchPct: 100 });
    expect(g.week.savingsCents).toBe(3400);
  });

  it("promise below the floor is refused with the minimum; above the allowance is refused; a valid one is pending until the week closes", async () => {
    const s = await seed(1);
    expect(await setTeenCommitment(deps(), s.familyId, 100)).toEqual({ ok: false, error: "floor", minCents: 200 });
    expect(await setTeenCommitment(deps(), s.familyId, 2100)).toEqual({ ok: false, error: "max", maxCents: 2000 });
    expect(await setTeenCommitment(deps(), s.familyId, 400)).toEqual({ ok: true });
    expect(await teenGoals(db, s.familyId, NOW)).toMatchObject({ commitmentCents: 200, pendingCents: 400 });
    clock = new Date(NOW.getTime() + 6 * 86_400_000); // next week, rules still in force
    await closeWeek(deps(), s.familyId);
    expect(await teenGoals(db, s.familyId, clock)).toMatchObject({ commitmentCents: 400, pendingCents: null });
  });

  it("no rules in force ⇒ the promise can't change", async () => {
    const s = await seed(1);
    clock = new Date(NOW.getTime() + 8 * 86_400_000);
    expect(await setTeenCommitment(deps(), s.familyId, 400)).toEqual({ ok: false, error: "rules" });
  });
});

describe("shop map", () => {
  it("Level 1: used shop open, unused shop ask first, higher-level shops locked with their level", async () => {
    const s = await seed(1);
    const { tiles } = await shopMap(db, s.familyId, NOW);
    const mine = tiles.filter((x) => Object.values(s.m).includes(x.id));
    expect(mine.map((x) => [x.name, x.kind, x.opensAt])).toEqual([
      ["Target", "open", null], ["Best Buy", "ask", null], ["Barnes & Noble", "locked", 2], ["Nike", "locked", 3],
    ]);
  });

  it("Level 2: no first-time rule, the bookshop is open and books only", async () => {
    const s = await seed(2);
    const tiles = (await shopMap(db, s.familyId, NOW)).tiles.filter((x) => Object.values(s.m).includes(x.id));
    expect(tiles.find((x) => x.id === s.m.bb)?.kind).toBe("open");
    expect(tiles.find((x) => x.id === s.m.bn)).toMatchObject({ kind: "open", booksOnly: true });
  });

  it("another family's suggested shop never appears", async () => {
    const a = await seed(1);
    const b = await seed(1);
    const ids = (await shopMap(db, b.familyId, NOW)).tiles.map((x) => x.id);
    expect(ids).not.toContain(a.m.tgt);
  });

  it("suggest a shop ⇒ an open request on Amara's home; repeats, bad domains and known shops are told apart", async () => {
    const s = await seed(1);
    expect(await suggestShop(deps(), s.familyId, "not a shop", "why")).toEqual({ ok: false, error: "domain" });
    expect(await suggestShop(deps(), s.familyId, "etsy.com", "  ")).toEqual({ ok: false, error: "reason" });
    expect(await suggestShop(deps(), s.familyId, `https://www.${s.m.tgt}.com/x`, "hi")).toEqual({ ok: false, error: "have" });
    expect(await suggestShop(deps(), s.familyId, `${s.m.nike}.com`, "hi")).toEqual({ ok: false, error: "level", level: 3 });
    expect(await suggestShop(deps(), s.familyId, "HTTPS://www.Etsy.com/shop", "art supplies")).toEqual({ ok: true, domain: "etsy.com" });
    expect(await suggestShop(deps(), s.familyId, "etsy.com", "again")).toEqual({ ok: false, error: "asked" });
    expect((await shopMap(db, s.familyId, NOW)).suggested).toEqual(["etsy.com"]);
    const home = await guardianHome(db, s.familyId, NOW);
    expect(home.needsYou).toContainEqual(expect.objectContaining({ kind: "approval", subject: "shop", shop: "etsy.com", note: "art supplies" }));
  });

  it("at most five suggestions wait at once", async () => {
    const s = await seed(1);
    for (let i = 0; i < 5; i++) expect((await suggestShop(deps(), s.familyId, `shop${i}.com`, "x")).ok).toBe(true);
    expect(await suggestShop(deps(), s.familyId, "shop9.com", "x")).toEqual({ ok: false, error: "many" });
  });
});

const ANSWERS: Answers = { why: "Lots of companies in one", sell: "If I needed it for college", drop: "Nervous, but I'd wait" };

describe("investing from Zoe's side", () => {
  it("below Level 3 nothing can be proposed", async () => {
    const s = await seed(1, { savedCents: 3000 });
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 500, ANSWERS)).toEqual({ ok: false, error: "level" });
  });

  it("validates her answers, the amount and her savings", async () => {
    const s = await seed(3, { savedCents: 1000 });
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 500, { ...ANSWERS, drop: " " })).toEqual({ ok: false, error: "answers" });
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 50, ANSWERS)).toEqual({ ok: false, error: "amount" });
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 1500, ANSWERS)).toEqual({ ok: false, error: "savings", savingsCents: 1000 });
    expect(await proposeFromTeen(deps(), s.familyId, "vti; drop", 500, ANSWERS)).toEqual({ ok: false, error: "symbol" });
  });

  it("off her list ⇒ a fund proposal with her answers on Amara's home; asking twice is refused; approving adds it", async () => {
    const s = await seed(3, { savedCents: 1000 });
    expect(await fundStatus(db, s.familyId, "VOO", NOW)).toBe("new");
    expect(await proposeFromTeen(deps(), s.familyId, "VOO", 500, ANSWERS)).toEqual({ ok: true, sent: "fund" });
    expect(await fundStatus(db, s.familyId, "VOO", NOW)).toBe("asked");
    expect(await proposeFromTeen(deps(), s.familyId, "VOO", 500, ANSWERS)).toEqual({ ok: false, error: "asked" });
    const [prop] = await db.select().from(t.fundProposals).where(eq(t.fundProposals.familyId, s.familyId));
    expect(prop.answers).toEqual({
      "Why this one?": ANSWERS.why, "What would make you sell it?": ANSWERS.sell,
      "How would you feel if this dropped by a third next year?": ANSWERS.drop, "How much she has in mind": "$5.00",
    });
    const home = await guardianHome(db, s.familyId, NOW);
    const item = home.needsYou.find((x) => x.kind === "approval" && x.subject === "fund");
    expect(item).toMatchObject({ symbol: "VOO" });
    await decideApproval(deps(), (item as { id: string }).id, "approved", s.familyId);
    expect(await fundStatus(db, s.familyId, "VOO", NOW)).toBe("allowed");
  });

  it("on her list ⇒ an investment request waiting for Amara", async () => {
    const s = await seed(3, { fundAllowlist: ["VTI"], savedCents: 1000 });
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 500, ANSWERS)).toEqual({ ok: true, sent: "investment" });
    expect(await teenInvestments(db, s.familyId)).toEqual([expect.objectContaining({ symbol: "VTI", amountCents: 500, status: "proposed" })]);
    const home = await guardianHome(db, s.familyId, NOW);
    expect(home.needsYou).toContainEqual(expect.objectContaining({ subject: "investment", symbol: "VTI", amountCents: 500 }));
  });

  it("another family's investments are never listed", async () => {
    const a = await seed(3, { fundAllowlist: ["VTI"], savedCents: 1000 });
    await proposeFromTeen(deps(), a.familyId, "VTI", 500, ANSWERS);
    const b = await seed(3);
    expect(await teenInvestments(db, b.familyId)).toEqual([]);
  });

  it("a second proposal for a symbol already waiting for Amara is refused", async () => {
    const s = await seed(3, { fundAllowlist: ["VTI"], savedCents: 1000 });
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 300, ANSWERS)).toEqual({ ok: true, sent: "investment" });
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 200, ANSWERS)).toEqual({ ok: false, error: "asked" });
  });

  it("an engine-refused row never reads as Amara's answer; her decline does", async () => {
    const s = await seed(3, { fundAllowlist: ["VTI"], savedCents: 1000 });
    await proposeInvestment(deps(), s.familyId, { symbol: "VTI", amountCents: 5000 }, {}); // over savings: the engine refuses
    expect(await teenInvestments(db, s.familyId)).toEqual([]);
    await proposeFromTeen(deps(), s.familyId, "VTI", 500, ANSWERS);
    const [a] = await db.select().from(t.approvals).where(eq(t.approvals.familyId, s.familyId));
    await decideApproval(deps(), a.id, "declined", s.familyId);
    expect(await teenInvestments(db, s.familyId)).toEqual([expect.objectContaining({ status: "rejected", declined: true })]);
  });

  it("an ask Amara never answered closes honestly when its approval runs out; Zoe can ask again (M3)", async () => {
    const s = await seed(3, { fundAllowlist: ["VTI"], savedCents: 1000 });
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 500, ANSWERS)).toEqual({ ok: true, sent: "investment" });
    const [a] = await db.select().from(t.approvals).where(eq(t.approvals.familyId, s.familyId));
    clock = new Date(a.expiresAt.getTime() + 60_000);
    await expireStale(deps(), s.familyId);
    expect(await teenInvestments(db, s.familyId)).toEqual([expect.objectContaining({ status: "expired" })]);
    expect(INVEST_STATUS.expired).toBe("Asked too long ago — she can ask again.");
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 500, ANSWERS)).toEqual({ ok: true, sent: "investment" });
  });

  it("an ask a demo reset expired early also closes, even before its own expiry time (M3 after reset)", async () => {
    const s = await seed(3, { fundAllowlist: ["VTI"], savedCents: 1000 });
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 500, ANSWERS)).toEqual({ ok: true, sent: "investment" });
    await db.update(t.approvals).set({ expiredAt: clock }).where(eq(t.approvals.familyId, s.familyId)); // what resetDemo does
    await expireStale(deps(), s.familyId);
    expect(await teenInvestments(db, s.familyId)).toEqual([expect.objectContaining({ status: "expired" })]);
  });

  it("an open release takes its savings off what she can invest (I1)", async () => {
    const s = await seed(3, { fundAllowlist: ["VTI"], savedCents: 1000 });
    await db.insert(t.releases).values({ id: crypto.randomUUID(), familyId: s.familyId, savedCents: 1000, matchCents: 1000 }); // a promotion's release
    expect(await proposeFromTeen(deps(), s.familyId, "VTI", 500, ANSWERS)).toEqual({ ok: false, error: "savings", savingsCents: 0 });
    expect((await proposeInvestment(deps(), s.familyId, { symbol: "VTI", amountCents: 500 }, {})).decision.outcome).toBe("REFUSE");
  });

  it("canPropose: Level 3 with rules in force, checked before anything else", async () => {
    expect(await canPropose(deps(), (await seed(1)).familyId)).toBe("level");
    const s = await seed(3);
    expect(await canPropose(deps(), s.familyId)).toBeNull();
    clock = new Date(NOW.getTime() + 8 * 86_400_000);
    expect(await canPropose(deps(), s.familyId)).toBe("rules");
  });
});
