import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import type { PaypalHttp } from "@/adapters/paypal/http";
import type { Channel3Adapter, Product } from "@/adapters/channel3/client";
import type { Constraint } from "@/engine/types";
import type { Level } from "@/engine/ladder";
import { proposePurchase, settlePurchase, type Deps } from "@/flows/purchase";
import { decideApproval, requestApproval } from "@/flows/approvals";
import { approveAndSettle } from "@/flows/approve";
import { guardianSetLevel, installLevel, renewGrant, revoke, shopsForLevel, signGrant, withFamilyLock } from "@/flows/grant";
import { approveWords } from "@/ui/approveWords";
import { addShop, guardianShops, removeShop, searchShopSites } from "@/flows/shops";
import { suggestShop } from "@/flows/teenMap";
import { proposeShop } from "@/flows/approvals";
import { allowedShops } from "@/flows/teen";
import { DAILY_CAPS } from "@/flows/usage";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const NOW = new Date("2026-11-04T12:00:00Z");
let n = 0;

/** A family with its own shared catalogue: Target/Best Buy (L1), a bookshop (L2), Nike (L3). Domains are unique per test. */
async function seed(level: Level = 1) {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `sc${n}`, guardianName: "Amara", teenName: "Zoe" });
  const m = {
    target: { id: `tg${n}`, name: "Target", domain: `target${n}.com`, class: "general", opensAtLevel: 1 },
    bestbuy: { id: `bb${n}`, name: "Best Buy", domain: `bestbuy${n}.com`, class: "general", opensAtLevel: 1 },
    books: { id: `bn${n}`, name: "Barnes & Noble", domain: `books${n}.com`, class: "books", opensAtLevel: 2 },
    nike: { id: `nk${n}`, name: "Nike", domain: `nike${n}.com`, class: "sneakers", opensAtLevel: 3 },
  };
  await db.insert(t.merchants).values(Object.values(m).map((x) => ({ ...x, channel3WebsiteId: x.domain })));
  await repo.saveVault(db, fam.id, `PT${n}`);
  await signGrant(deps(), fam.id, { level });
  return { familyId: fam.id, m };
}

const paypalCalls = vi.fn();
const paypal: PaypalHttp = {
  async request<T>() {
    paypalCalls();
    return { status: 201, headers: new Headers(), data: { id: "O1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `CAP-${Math.random()}`, status: "COMPLETED" }] } }] } as T };
  },
};
const websites = vi.fn(async (q: string) => [{ domain: `${q}.com`, name: q }]);
const shopsSelling = vi.fn(async (): Promise<{ domain: string; products: number }[]> => []);
const channel3: Channel3Adapter = {
  retrieve: async (id: string, domains: string[]): Promise<Product | null> => ({ id, title: "Shirt", priceCents: 600, domain: domains[0], available: true }),
  search: async () => [], lookup: async () => ({ kind: "not_a_product" }), websites, shopsSelling,
};
const deps = (): Deps & { alpaca: () => never } => ({
  db, paypal, channel3, classifier: { ask: async () => ({ probability: 0.99, model: "m", modelVersion: "1" }) },
  secret: "s", now: async () => NOW, alpaca: () => { throw new Error("no alpaca"); },
});

const active = async (familyId: string) => (await repo.getActiveGrant(db, familyId))!;
/** Every merchant id list in the rules, by constraint type. */
const lists = (cs: Constraint[]) => Object.fromEntries(cs.flatMap((c) => {
  const ids = (c as { merchantIds?: unknown }).merchantIds;
  return Array.isArray(ids) ? [[c.type, ids as string[]]] : [];
}));
const payees = async (familyId: string) => lists((await active(familyId)).body.constraints)["payment.allowed_payees"];

describe("effective shops: level defaults ∪ added − removed", () => {
  it("levels 1–3 keep a removed default out and an added higher-level shop in", async () => {
    const { familyId, m } = await seed(1);
    await removeShop(deps(), familyId, m.target.id);
    await addShop(deps(), familyId, { domain: m.nike.domain, name: "Nike" });
    for (const level of [1, 2, 3] as Level[]) {
      const g = await withFamilyLock(deps(), familyId, (tx, now) => installLevel(tx, familyId, level, now));
      const l = lists(g.constraints);
      expect(l["payment.allowed_payees"]).not.toContain(m.target.id);
      expect(l["payment.allowed_payees"]).toEqual(expect.arrayContaining([m.bestbuy.id, m.nike.id]));
      expect(Object.values(l).flat()).not.toContain(m.target.id);
      if (level >= 2) expect(l["checkout.semantic_category"]).toContain(m.books.id);
      else expect(l["payment.allowed_payees"]).not.toContain(m.books.id);
    }
  });

  it("a removed default stays removed after re-signing, a level change and a level-up", async () => {
    const { familyId, m } = await seed(2);
    await removeShop(deps(), familyId, m.books.id);
    await signGrant(deps(), familyId, { level: 2 }); // Grant page "Sign and send"
    expect(Object.values(lists((await active(familyId)).body.constraints)).flat()).not.toContain(m.books.id);
    await guardianSetLevel(deps(), familyId, 3, "doing great");
    expect(await payees(familyId)).not.toContain(m.books.id);
    await withFamilyLock(deps(), familyId, (tx, now) => installLevel(tx, familyId, 3, now)); // what a month review's level-up runs
    expect(await payees(familyId)).not.toContain(m.books.id);
    expect(await payees(familyId)).toContain(m.nike.id); // level-ups still bring in that level's defaults
  });

  it("the Grant page's shop names follow her choices", async () => {
    const { familyId, m } = await seed(1);
    await removeShop(deps(), familyId, m.target.id);
    await addShop(deps(), familyId, { domain: m.nike.domain, name: "Nike" });
    const names = await shopsForLevel(db, familyId, 1, NOW);
    expect(names).toContain("Nike");
    expect(names).toContain("Best Buy");
    // (names can't show Target's absence: other tests' shared "Target" rows are in the catalogue too; ids can)
    const own = await guardianShops(db, familyId, NOW);
    expect(own.shops.map((s) => s.merchantId)).not.toContain(m.target.id);
    expect(own.shops.find((s) => s.merchantId === m.nike.id)).toMatchObject({ name: "Nike", note: "added by you" });
  });
});

describe("Amara adds and removes a shop", () => {
  it("remove: a new version, same end date, off every merchant list, and off the agent's reach", async () => {
    const { familyId, m } = await seed(2);
    const before = await active(familyId);
    const r = await removeShop(deps(), familyId, m.books.id);
    const after = await active(familyId);
    expect(r).toEqual({ name: "Barnes & Noble", version: before.version + 1 });
    expect(after.version).toBe(before.version + 1);
    expect(after.expiresAt.toISOString()).toBe(before.expiresAt.toISOString());
    expect(Object.values(lists(after.body.constraints)).flat()).not.toContain(m.books.id);
    expect((await allowedShops(db, familyId))!.domains).not.toContain(m.books.domain);
  });

  it("add: a higher-level shop opens now; a new domain gets a family-only merchant", async () => {
    const { familyId, m } = await seed(2);
    const before = await active(familyId);
    const r = await addShop(deps(), familyId, { domain: m.nike.domain, name: "Nike" });
    expect(r.version).toBe(before.version + 1);
    expect(await payees(familyId)).toContain(m.nike.id);
    expect((await active(familyId)).expiresAt.toISOString()).toBe(before.expiresAt.toISOString());

    await addShop(deps(), familyId, { domain: "HTTPS://www.Lego.com/en-us", name: "Lego" });
    const [lego] = await db.select().from(t.merchants).where(eq(t.merchants.channel3WebsiteId, "lego.com"));
    expect(lego).toMatchObject({ name: "Lego", class: "general", addedByFamilyId: familyId });
    expect(await payees(familyId)).toContain(lego.id);
  });

  it("removing then adding back a bookshop puts it back under the books-only check", async () => {
    const { familyId, m } = await seed(2);
    await removeShop(deps(), familyId, m.books.id);
    await addShop(deps(), familyId, { domain: m.books.domain, name: "Barnes & Noble" });
    const l = lists((await active(familyId)).body.constraints);
    expect(l["payment.allowed_payees"]).toContain(m.books.id);
    expect(l["checkout.semantic_category"]).toContain(m.books.id);
  });

  it("with no rules in force the choice is only recorded, and applies at the next signing", async () => {
    const { familyId, m } = await seed(1);
    await revoke(deps(), familyId);
    const versions = async () => (await db.select().from(t.grants).where(eq(t.grants.familyId, familyId))).length;
    const count = await versions();
    expect(await addShop(deps(), familyId, { domain: m.nike.domain, name: "Nike" })).toEqual({ name: "Nike", version: null });
    expect(await removeShop(deps(), familyId, m.target.id)).toEqual({ name: "Target", version: null });
    expect(await versions()).toBe(count);
    await signGrant(deps(), familyId, { level: 1 });
    expect(await payees(familyId)).toContain(m.nike.id);
    expect(await payees(familyId)).not.toContain(m.target.id);
  });

  it("refuses a junk domain and a merchant she can't see", async () => {
    const { familyId } = await seed(1);
    await expect(addShop(deps(), familyId, { domain: "not a shop", name: "x" })).rejects.toThrow();
    const other = await seed(1);
    await db.insert(t.merchants).values({ id: `own${n}`, name: "Theirs", domain: "theirs.com", class: "general", opensAtLevel: 1, addedByFamilyId: other.familyId });
    await expect(removeShop(deps(), familyId, `own${n}`)).rejects.toThrow();
  });
});

describe("a purchase ask waiting at a removed shop", () => {
  it("is refused when Amara approves it, and PayPal is never called", async () => {
    const { familyId, m } = await seed(1);
    const d = deps();
    const cart = { merchantId: m.target.id, items: [{ sku: "s1", title: "Shirt", qty: 1, unitCents: 600 }], totalCents: 600 };
    const { purchaseId } = await proposePurchase(d, familyId, cart);
    expect((await settlePurchase(d, purchaseId)).status).toBe("needs_approval"); // first time at Target
    const p = (await repo.getPurchase(db, purchaseId))!;
    const { approvalId } = await requestApproval(d, familyId, "purchase", purchaseId, p.cartHash);
    await removeShop(d, familyId, m.target.id);
    paypalCalls.mockClear();
    expect(await approveAndSettle(d, familyId, approvalId)).toBe("rules");
    expect(paypalCalls).not.toHaveBeenCalled();
    expect((await repo.getPurchase(db, purchaseId))!.status).toBe("refused");
  });
});

describe("Zoe asks for a shop", () => {
  it("a higher-level shop and a removed shop can be suggested; approving adds it and records the choice", async () => {
    const { familyId, m } = await seed(1);
    await removeShop(deps(), familyId, m.target.id);
    expect(await suggestShop(deps(), familyId, m.nike.domain, "running shoes")).toEqual({ ok: true, domain: m.nike.domain });
    expect(await suggestShop(deps(), familyId, m.target.domain, "school stuff")).toEqual({ ok: true, domain: m.target.domain });
    expect(await suggestShop(deps(), familyId, m.bestbuy.domain, "x")).toEqual({ ok: false, error: "have" });
    const open = await db.select().from(t.approvals).where(eq(t.approvals.familyId, familyId));
    for (const a of open) await decideApproval(deps(), a.id, "approved", familyId);
    expect(await payees(familyId)).toEqual(expect.arrayContaining([m.nike.id, m.target.id]));
    const choices = await db.select().from(t.shopChoices).where(eq(t.shopChoices.familyId, familyId));
    expect(choices.filter((c) => c.choice === "added").map((c) => c.merchantId).sort()).toEqual([m.nike.id, m.target.id].sort());
    await signGrant(deps(), familyId, { level: 1 }); // and it sticks
    expect(await payees(familyId)).toEqual(expect.arrayContaining([m.nike.id, m.target.id]));
  });
});

describe("shop search", () => {
  it("marks shops on her list and ones that usually open higher; validates the query", async () => {
    const { familyId, m } = await seed(1);
    websites.mockResolvedValueOnce([
      { domain: m.target.domain, name: "Target" }, { domain: m.nike.domain, name: "Nike" }, { domain: "etsy.com", name: "Etsy" },
    ]);
    const r = await searchShopSites(deps(), familyId, "  shops ", "shop_sites");
    expect(websites).toHaveBeenLastCalledWith("shops");
    expect(r).toEqual({ ok: true, selling: [], named: [
      { domain: m.target.domain, name: "Target", onList: true, opensAt: null },
      { domain: m.nike.domain, name: "Nike", onList: false, opensAt: 3 },
      { domain: "etsy.com", name: "Etsy", onList: false, opensAt: null },
    ] });
    websites.mockClear();
    expect(await searchShopSites(deps(), familyId, "   ", "shop_sites")).toEqual({ ok: false, error: "query" });
    expect(await searchShopSites(deps(), familyId, "x".repeat(61), "teen_shop_sites")).toEqual({ ok: false, error: "query" });
    expect(websites).not.toHaveBeenCalled();
  });

  it("shops that sell it come first (top 6, named by domain, with a product count, 1-product shops dropped when 3+ have more); a shop is never in both groups", async () => {
    const { familyId, m } = await seed(1);
    shopsSelling.mockResolvedValueOnce([
      { domain: "kickscrew.com", products: 14 }, { domain: m.nike.domain, products: 9 }, { domain: "not a domain", products: 5 },
      { domain: "zulily.com", products: 3 }, { domain: "stadiumgoods.com", products: 3 }, { domain: "dtlr.com", products: 2 },
      { domain: m.target.domain, products: 1 }, { domain: "shiekh.com", products: 1 },
    ]);
    websites.mockResolvedValueOnce([
      { domain: "www.sneakers.com", name: "Sneakers.com" }, { domain: "kickscrew.com", name: "KicksCrew" },
      { domain: "sneakerask.com", name: "Sneakerask" }, { domain: "sistersandseekers.com", name: "S&S" }, { domain: "four.com", name: "4" },
    ]);
    const r = await searchShopSites(deps(), familyId, "sneakers", "shop_sites");
    expect(shopsSelling).toHaveBeenLastCalledWith("sneakers");
    expect(r).toEqual({
      ok: true,
      selling: [
        { domain: "kickscrew.com", name: "kickscrew.com", products: 14, onList: false, opensAt: null },
        { domain: m.nike.domain, name: m.nike.domain, products: 9, onList: false, opensAt: 3 },
        { domain: "zulily.com", name: "zulily.com", products: 3, onList: false, opensAt: null },
        { domain: "stadiumgoods.com", name: "stadiumgoods.com", products: 3, onList: false, opensAt: null },
        { domain: "dtlr.com", name: "dtlr.com", products: 2, onList: false, opensAt: null },
      ], // target (1 product) and shiekh (1) dropped: five shops have 2+
      named: [ // kickscrew.com is already under "sells": not repeated
        { domain: "sneakers.com", name: "Sneakers.com", onList: false, opensAt: null },
        { domain: "sneakerask.com", name: "Sneakerask", onList: false, opensAt: null },
        { domain: "sistersandseekers.com", name: "S&S", onList: false, opensAt: null },
      ],
    });
  });

  it("with fewer than 3 shops at 2+ products, 1-product shops stay (a small result is still usable)", async () => {
    const { familyId } = await seed(1);
    shopsSelling.mockResolvedValueOnce([
      { domain: "michaels.com", products: 3 }, { domain: "dickblick.com", products: 2 }, { domain: "etsy.com", products: 1 },
    ]);
    websites.mockResolvedValueOnce([]);
    const r = await searchShopSites(deps(), familyId, "easel", "shop_sites");
    expect(r.ok && r.selling.map((s) => [s.domain, s.products])).toEqual([["michaels.com", 3], ["dickblick.com", 2], ["etsy.com", 1]]);
  });

  it("product search slower than the limit: the named shops come back alone, flagged so the page can say so", async () => {
    const { familyId } = await seed(1);
    shopsSelling.mockReturnValueOnce(new Promise(() => {})); // never answers
    websites.mockResolvedValueOnce([{ domain: "lego.com", name: "Lego" }]);
    expect(await searchShopSites(deps(), familyId, "lego", "shop_sites", 20)).toEqual({ ok: true, selling: [], sellsTimedOut: true,
      named: [{ domain: "lego.com", name: "Lego", onList: false, opensAt: null }] });
    shopsSelling.mockReturnValueOnce(new Promise(() => {}));
    websites.mockRejectedValueOnce(new Error("down")); // and the name search failing too: the error path
    await expect(searchShopSites(deps(), familyId, "lego", "shop_sites", 20)).rejects.toThrow("down");
  });

  it("one search counts once against the cap; one Channel3 call failing still returns the other's shops; both failing throws", async () => {
    const { familyId } = await seed(1);
    const day = new Date().toISOString().slice(0, 10);
    const count = async () => (await db.select().from(t.usage).where(eq(t.usage.familyId, familyId)))
      .find((u) => u.kind === "shop_sites" && u.day === day)?.count ?? 0;
    shopsSelling.mockRejectedValueOnce(new Error("Channel3 504"));
    websites.mockResolvedValueOnce([{ domain: "lego.com", name: "Lego" }]);
    expect(await searchShopSites(deps(), familyId, "lego", "shop_sites")).toEqual({ ok: true, selling: [],
      named: [{ domain: "lego.com", name: "Lego", onList: false, opensAt: null }] });
    expect(await count()).toBe(1);
    shopsSelling.mockResolvedValueOnce([{ domain: "toynk.com", products: 4 }]);
    websites.mockRejectedValueOnce(new Error("Channel3 500"));
    expect(await searchShopSites(deps(), familyId, "lego", "shop_sites")).toEqual({ ok: true, named: [],
      selling: [{ domain: "toynk.com", name: "toynk.com", products: 4, onList: false, opensAt: null }] });
    expect(await count()).toBe(2);
    shopsSelling.mockRejectedValueOnce(new Error("down"));
    websites.mockRejectedValueOnce(new Error("down"));
    await expect(searchShopSites(deps(), familyId, "lego", "shop_sites")).rejects.toThrow("down");
  });

  it("the 201st search in a day returns the cap without calling Channel3; Zoe's counter is separate from Amara's", async () => {
    const { familyId } = await seed(1);
    const day = new Date().toISOString().slice(0, 10);
    expect(DAILY_CAPS.shop_sites).toBe(200);
    expect(DAILY_CAPS.teen_shop_sites).toBe(200);
    await db.insert(t.usage).values({ familyId, kind: "teen_shop_sites", day, count: 200 });
    websites.mockClear();
    shopsSelling.mockClear();
    expect(await searchShopSites(deps(), familyId, "lego", "teen_shop_sites")).toEqual({ ok: false, error: "cap" });
    expect(websites).not.toHaveBeenCalled();
    expect(shopsSelling).not.toHaveBeenCalled();
    expect((await searchShopSites(deps(), familyId, "lego", "shop_sites")).ok).toBe(true); // Zoe used hers up; Amara's still works
    await db.update(t.usage).set({ count: 200 }).where(eq(t.usage.kind, "shop_sites"));
    websites.mockClear();
    shopsSelling.mockClear();
    expect(await searchShopSites(deps(), familyId, "lego", "shop_sites")).toEqual({ ok: false, error: "cap" });
    expect(websites).not.toHaveBeenCalled();
    expect(shopsSelling).not.toHaveBeenCalled();
  });
});

describe("fix round 1", () => {
  it("I1: Remove takes off a shop on her rules even when another family owns the merchant row (legacy approvals)", async () => {
    const a = await seed(1);
    const b = await seed(1);
    const legacy = `legacy${n}`;
    await db.insert(t.merchants).values({ id: legacy, name: "etsy.com", domain: `etsy${n}.com`, class: "general", channel3WebsiteId: `etsy${n}.com`, opensAtLevel: 1, addedByFamilyId: a.familyId });
    // The old applyShop reused A's row for B: B's rules name a merchant row B can't "see".
    const g = await active(b.familyId);
    const body = { ...g.body, constraints: g.body.constraints.map((c) => c.type === "payment.allowed_payees"
      ? { ...c, merchantIds: [...(c as { merchantIds: string[] }).merchantIds, legacy] } : c) };
    await db.update(t.grants).set({ body }).where(eq(t.grants.id, g.id));
    expect((await guardianShops(db, b.familyId, NOW)).shops.map((s) => s.merchantId)).toContain(legacy);

    expect(await removeShop(deps(), b.familyId, legacy)).toEqual({ name: "etsy.com", version: g.version + 1 });
    expect(Object.values(lists((await active(b.familyId)).body.constraints)).flat()).not.toContain(legacy);
    await signGrant(deps(), b.familyId, { level: 1 });
    expect(Object.values(lists((await active(b.familyId)).body.constraints)).flat()).not.toContain(legacy);
    // A row that is neither hers nor on her rules is still refused.
    await expect(removeShop(deps(), b.familyId, `own-${n}-x`)).rejects.toThrow();
  });

  it("M3: rules past their end date are not in force: a change is only recorded, and renewing can't bring a removed shop back", async () => {
    const { familyId, m } = await seed(1);
    const g = await active(familyId);
    const after = { ...deps(), now: async () => new Date(g.expiresAt.getTime() + 60_000) };
    const versions = async () => (await db.select().from(t.grants).where(eq(t.grants.familyId, familyId))).length;
    const count = await versions();
    expect(await removeShop(after, familyId, m.target.id)).toEqual({ name: "Target", version: null });
    expect(await addShop(after, familyId, { domain: m.nike.domain, name: "Nike" })).toEqual({ name: "Nike", version: null });
    expect(await versions()).toBe(count);
    expect((await guardianShops(db, familyId, new Date(g.expiresAt.getTime() + 60_000))).inForce).toBe(false);
    await renewGrant(after, familyId); // same level and settings, fresh week: her choices still apply
    expect(await payees(familyId)).not.toContain(m.target.id);
    expect(await payees(familyId)).toContain(m.nike.id);
  });

  it("M2: approving Zoe's shop with no rules in force says it applies at the next signing", async () => {
    const { familyId, m } = await seed(1);
    const d = deps();
    const live = await proposeShop(d, familyId, m.nike.domain, "running");
    expect(await approveAndSettle(d, familyId, live.approvalId)).toBe("shop");
    const later = await proposeShop(d, familyId, "etsy.com", "gifts");
    await revoke(d, familyId);
    expect(await approveAndSettle(d, familyId, later.approvalId)).toBe("shop-later");
    expect(approveWords("shop-later", "Zoe").text).toBe("Approved. The shop goes into Zoe's rules when you next sign them.");
    expect(approveWords("shop", "Zoe").text).toBe("Approved. Zoe can now use that shop.");
  });
});
