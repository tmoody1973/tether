import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getFamily, insertFamily } from "@/db/repo";
import { clockFor, now as clockNow } from "@/clock/clock";
import type { PaypalHttp } from "@/adapters/paypal/http";
import type { Channel3Adapter, Product } from "@/adapters/channel3/client";
import type { AlpacaBroker } from "@/adapters/alpaca/broker";
import { approveAndSettle, type ApproveDeps } from "@/flows/approve";
import { advanceDemoClock } from "@/flows/demo";
import { resetTeenLink, revoke, setPaused, signGrant } from "@/flows/grant";
import { addShop, removeShop } from "@/flows/shops";
import { guardianHome } from "@/flows/home";
import { DEMO_STALE_MS, DemoResetError, freshenDemoIfStale, resetDemo } from "@/flows/reset";
import { DEMO_COMMITMENT_CENTS, DEMO_NOW, seedDemo, type SeedResult } from "@/flows/seed";
import { ledgerView } from "@/ledger/ledger";
import { appendJournal, insertPurchase, receiptsForMonth } from "@/db/repo";
import { readRecord } from "@/ai/monthAssistant";
import { confirmRelease } from "@/flows/month";
import { closingStatement } from "@/flows/statement";
import { commitmentKept } from "@/engine/ladder";
import { weekRecords } from "@/ledger/ledger";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

// Fake Channel3: cheap things at Target / Best Buy, a few over-budget ones, and a goal. Prices change only via `bump`.
const catalog: Product[] = [
  ...["Spiral notebook", "Gel pens", "Sticky notes", "Charger cable", "Hair ties", "Highlighters"].map((title, i) =>
    ({ id: `small-${i}`, title, priceCents: 350 + i * 100, domain: i % 2 ? "bestbuy.com" : "target.com", available: true })),
  { id: "over-1", title: "Bluetooth speaker", priceCents: 2499, domain: "target.com", available: true },
  { id: "goal-1", title: "Sony WH-CH720N Wireless Noise Canceling Headphones", priceCents: 8999, domain: "bestbuy.com", available: true },
];
const channel3: Channel3Adapter = {
  search: async (q) => catalog.filter((p) =>
    q === "wireless headphones" ? p.id.startsWith("goal") : q === "bluetooth speaker" ? p.id.startsWith("over") : p.id.startsWith("small")),
  retrieve: async (id) => {
    const p = catalog.find((x) => x.id === id);
    if (p && id.startsWith("over") && bump === "down") throw new Error("Channel3 down");
    return p && id.startsWith("over") && typeof bump === "number" ? { ...p, priceCents: p.priceCents + bump } : p ?? null;
  },
  lookup: async () => { throw new Error("unused"); },
  websites: async () => [],
  shopsSelling: async () => [],
};

let bump: number | "down" | null = null; // M7: the over-budget product's price moves, or Channel3 is down for it
let cap = 0;
const paypal: PaypalHttp = {
  async request<T>(method: string) {
    if (method === "DELETE") return { status: 204, headers: new Headers(), data: {} as T };
    const id = `SEED-CAP-${++cap}`;
    const data = { id: `O-${cap}`, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id, status: "COMPLETED" }] } }] };
    return { status: 201, headers: new Headers(), data: data as T };
  },
};

const transfers: Array<{ transferId: string; amount: number; createdAt: number; incoming: boolean; status: string }> = [];
const alpaca = {
  createCustodialAccount: async () => ({ accountId: `acct-${transfers.length}`, custodial: false }),
  deposit: async (_a: string, cents: number) => {
    const transferId = `tr-${transfers.length}`;
    transfers.push({ transferId, amount: cents / 100, createdAt: Date.now(), incoming: true, status: "QUEUED" });
    return { transferId };
  },
  listTransfers: async () => transfers,
} as unknown as AlpacaBroker;

const deps: ApproveDeps = {
  db: undefined as unknown as Db, paypal, channel3, secret: "seed-secret",
  classifier: { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) },
  now: async (familyId, conn) => clockFor(db)(familyId, conn),
  alpaca: () => alpaca,
};
const d = (): ApproveDeps => ({ ...deps, db });

let n = 0;
async function seeded(): Promise<{ r: SeedResult; keys: { guardianKey: string; teenToken: string } }> {
  n++;
  const keys = { guardianKey: `demo-key-${n}`, teenToken: `demo-teen-${n}` };
  const r = await seedDemo({ ...d(), alpaca, wait: async () => undefined }, { ...keys, vaultId: "VAULT-DEMO" });
  return { r, keys };
}

const openApprovals = (familyId: string) => db.select().from(t.approvals)
  .where(and(eq(t.approvals.familyId, familyId), isNull(t.approvals.result), isNull(t.approvals.expiredAt)));

describe("seedDemo (Task 19, R43)", () => {
  it("every seeded receipt has a non-empty capture id", async () => {
    const { r } = await seeded();
    const rows = await db.select({ c: t.receipts.captureId }).from(t.receipts)
      .innerJoin(t.purchases, eq(t.purchases.id, t.receipts.purchaseId)).where(eq(t.purchases.familyId, r.familyId));
    const expected = [...r.weeks.flatMap((w) => w.captureIds), ...r.thisWeekCaptureIds];
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.map((x) => x.c).sort()).toEqual(expected.sort());
    for (const x of rows) expect(x.c).toMatch(/\S/);
    // Every slip is tied to its purchase, so PayPal rows reconcile (R35).
    const slips = await db.select().from(t.consumedTokens).innerJoin(t.purchases, eq(t.purchases.id, t.consumedTokens.purchaseId))
      .where(eq(t.purchases.familyId, r.familyId));
    expect(slips).toHaveLength(rows.length);
    expect(r.investing).toMatchObject({ transferId: expect.any(String) });
  });

  it("seeded weeks are all kept and end-of-month promotes to level 3", async () => {
    const { r } = await seeded();
    expect(r.weeks.map((w) => w.weekKey)).toEqual(["2026-W49", "2026-W50", "2026-W51", "2026-W52"]);
    expect(r.weeks.every((w) => w.kept && w.savedCents >= DEMO_COMMITMENT_CENTS)).toBe(true);
    expect((await getActiveGrant(db, r.familyId))!.level).toBe(2);
    expect((await clockNow(db, r.familyId)).getTime() - DEMO_NOW.getTime()).toBeLessThan(60_000);
    expect((await getFamily(db, r.familyId))!.commitmentCents).toBe(DEMO_COMMITMENT_CENTS);
    expect(r.goal).toEqual({ title: "Sony WH-CH720N Wireless Noise…", targetCents: 8999, channel3ProductId: "goal-1" }); // a real product, cut at a word
    const open = await openApprovals(r.familyId);
    expect(open.map((a) => a.subject).sort()).toEqual(["purchase", "shop"]);
    expect(open.find((a) => a.subject === "purchase")!.liftsBudget).toBe(true); // over budget: Amara may lift it (R40)

    const { review } = await advanceDemoClock(d(), r.familyId, "endOfMonth");
    expect(review?.action).toBe("PROMOTE");
    expect((await getActiveGrant(db, r.familyId))!.level).toBe(3);
  });
});

describe("resetDemo (Task 19, R43)", () => {
  it("reset restores level 2, pending approvals cleared, teen token unchanged", async () => {
    const { r, keys } = await seeded();
    const fam = r.familyId;
    const before = await ledgerView(db, fam, await clockNow(db, fam));
    const spentBefore = before.spentThisWeekCents;
    const receiptsBefore = (await db.select().from(t.receipts)).length;

    // A judge plays: approves the over-budget ask (a real charge), resets Zoe's link, jumps to month end (Level 3).
    const ask = (await openApprovals(fam)).find((a) => a.subject === "purchase")!;
    expect(await approveAndSettle(d(), fam, ask.id)).toBe("paid");
    await resetTeenLink(d(), fam);
    expect((await advanceDemoClock(d(), fam, "endOfMonth")).review?.action).toBe("PROMOTE");
    await advanceDemoClock(d(), fam, "endOfWeek"); // closes 2026-W53 (not kept: the ask went over)

    await resetDemo(d(), fam, keys);

    const g = (await getActiveGrant(db, fam))!;
    expect(g.level).toBe(2);
    expect(g.version).toBeGreaterThan(r.weeks.length + 1);
    expect((await getFamily(db, fam))!.teenToken).toBe(keys.teenToken);
    const open = await openApprovals(fam);
    expect(open.map((a) => a.subject).sort()).toEqual(["purchase", "shop"]); // only the seeded two, reopened
    expect(open.some((a) => a.id === ask.id)).toBe(false);
    expect((await clockNow(db, fam)).getTime() - DEMO_NOW.getTime()).toBeLessThan(60_000);
    // The judge's PayPal charge stays on the record, but no longer counts toward Zoe's week.
    expect((await db.select().from(t.receipts)).length).toBe(receiptsBefore + 1);
    const after = await ledgerView(db, fam, await clockNow(db, fam));
    expect(after.spentThisWeekCents).toBe(spentBefore);
    expect(after.savingsCents).toBe(before.savingsCents);
    expect(await db.select().from(t.releases).where(eq(t.releases.familyId, fam))).toHaveLength(0); // the unconfirmed one
    // R44: the record labels it; the month assistant leaves it out, as Activity does, with one count line.
    const dec = await receiptsForMonth(db, fam, "2026-12");
    const judged = dec.find((x) => x.approvalId === ask.id)!;
    expect(judged.setAside).toBe(true);
    expect(dec.filter((x) => x.setAside)).toHaveLength(1);
    const told = await readRecord(db, fam, "2026-12");
    expect(told.receipts).toHaveLength(dec.length - 1);
    expect(told.setAsideNote).toBe("1 payment from an earlier demo reset is hidden.");
    // A reversal of that set-aside spend, written after the reset, can't count on its own (R44 Q5).
    await appendJournal(db, { familyId: fam, kind: "spend_reversal", amountCents: judged.amountCents, ref: judged.purchaseId, at: await clockNow(db, fam), note: null });
    expect((await ledgerView(db, fam, await clockNow(db, fam))).spentThisWeekCents).toBe(spentBefore);
    // And the on-camera promotion works again.
    expect((await advanceDemoClock(d(), fam, "endOfMonth")).review?.action).toBe("PROMOTE");
  });

  it("Stop on the demo keeps its saved PayPal, so a reset needs no re-save (C1)", async () => {
    const { r, keys } = await seeded();
    expect(await revoke(d(), r.familyId)).toEqual({ revoked: true, paypalTokenDeleted: false, reason: "demo_kept" });
    expect(await resetDemo(d(), r.familyId, keys)).toEqual({ needsPaypal: false });
  });

  it("reset re-prices the seeded ask, so approving it pays instead of hitting a price change (M7)", async () => {
    const { r, keys } = await seeded();
    bump = 37;
    try {
      await resetDemo(d(), r.familyId, keys);
      const ask = (await openApprovals(r.familyId)).find((a) => a.subject === "purchase")!;
      const [p] = await db.select().from(t.purchases).where(eq(t.purchases.id, ask.subjectId));
      expect(p.cart.totalCents).toBe(catalog.find((x) => x.id === p.cart.items[0].sku)!.priceCents + 37);
      expect(await approveAndSettle(d(), r.familyId, ask.id)).toBe("paid");
    } finally { bump = null; }
  });

  it("reset keeps the stored cart when Channel3 is down (M7)", async () => {
    const { r, keys } = await seeded();
    const stored = (await getFamily(db, r.familyId))!.demo!.ask!.cart;
    bump = "down";
    try {
      await resetDemo(d(), r.familyId, keys);
    } finally { bump = null; }
    const ask = (await openApprovals(r.familyId)).find((a) => a.subject === "purchase")!;
    const [p] = await db.select().from(t.purchases).where(eq(t.purchases.id, ask.subjectId));
    expect(p.cart).toEqual(stored);
  });

  it("reset with a genuinely deleted vault shows the save-again message", async () => {
    const { r, keys } = await seeded();
    await db.update(t.vault).set({ deletedAt: new Date() }).where(eq(t.vault.familyId, r.familyId)); // e.g. removed in PayPal
    expect(await resetDemo(d(), r.familyId, keys)).toEqual({ needsPaypal: true });
    const h = await guardianHome(db, r.familyId, await clockNow(db, r.familyId));
    expect(h.level).toBe(2);
    expect(h.needsYou).toContainEqual({ kind: "paypal", removedByRevoke: true });
  });

  it("reset refuses for a non-demo family", async () => {
    const { r, keys } = await seeded();
    const other = await insertFamily(db, { name: "S", guardianName: "Sam", teenName: "Kai", teenToken: "not-demo-teen", guardianToken: "not-demo" });
    await expect(resetDemo(d(), other.id, { guardianKey: "not-demo", teenToken: "not-demo-teen" })).rejects.toThrow(DemoResetError);
    await expect(resetDemo(d(), r.familyId, { guardianKey: "some-other-key", teenToken: keys.teenToken })).rejects.toThrow(DemoResetError);
    await expect(resetDemo(d(), r.familyId, {})).rejects.toThrow(DemoResetError);
  });

  it("a confirmed release survives a reset; an unconfirmed one doesn't", async () => {
    const { r, keys } = await seeded();
    const { review } = await advanceDemoClock(d(), r.familyId, "endOfMonth");
    await confirmRelease(d(), review!.release!.releaseId, r.familyId);
    await resetDemo(d(), r.familyId, keys);
    const rows = await db.select().from(t.releases).where(eq(t.releases.familyId, r.familyId));
    expect(rows).toHaveLength(1);
    expect(rows[0].confirmedAt).not.toBeNull();
  });

  it("reset clears Amara's shop choices: a removed shop is back and an added one is gone", async () => {
    const { r, keys } = await seeded();
    const fam = r.familyId;
    await removeShop(d(), fam, "m_target");
    await addShop(d(), fam, { domain: "nike.com", name: "Nike" });
    await resetDemo(d(), fam, keys);
    expect(await db.select().from(t.shopChoices).where(eq(t.shopChoices.familyId, fam))).toHaveLength(0);
    const payees = () => getActiveGrant(db, fam).then((g) =>
      (g!.body.constraints.find((c) => c.type === "payment.allowed_payees") as { merchantIds: string[] }).merchantIds);
    expect(await payees()).toContain("m_target");
    expect(await payees()).not.toContain("m_nike");
    await signGrant(d(), fam, { level: 2 }); // nothing left over to come back on the next signing
    expect(await payees()).toContain("m_target");
    expect(await payees()).not.toContain("m_nike");
  });

  it("a shop first used after the seed is a first-time shop again after a reset", async () => {
    const { r, keys } = await seeded();
    const at = await clockNow(db, r.familyId);
    const cart = { merchantId: "m_barnesandnoble", items: [{ sku: "b", title: "Book", qty: 1, unitCents: 500 }], totalCents: 500 };
    const p = await insertPurchase(db, { familyId: r.familyId, cart, cartHash: "h", status: "paid", decision: { outcome: "ALLOW", reasons: [], semanticRules: [] } });
    await appendJournal(db, { familyId: r.familyId, kind: "spend", amountCents: 500, ref: p.id, at, note: null });
    expect((await ledgerView(db, r.familyId, at)).merchantsUsed.has("m_barnesandnoble")).toBe(true);
    await resetDemo(d(), r.familyId, keys);
    expect((await ledgerView(db, r.familyId, at)).merchantsUsed.has("m_barnesandnoble")).toBe(false);
  });
});

describe("decision 029 on the shared demo family", () => {
  it("after a reset, the statement's payments agree with its paid total and Remaining (review HIGH 1)", async () => {
    const { r, keys } = await seeded();
    const { review } = await advanceDemoClock(d(), r.familyId, "endOfMonth"); // promotes, opens a release
    await confirmRelease(d(), review!.release!.releaseId, r.familyId); // judge 1 records paying Zoe
    let st = await closingStatement(db, r.familyId, await clockNow(db, r.familyId));
    expect(st.payments.map((p) => p.savedCents)).toEqual([5650]);
    expect(st.paidCents).toBe(5650);

    await resetDemo(d(), r.familyId, keys); // judge 2 arrives: the release stays on record, its journal row is set aside
    st = await closingStatement(db, r.familyId, await clockNow(db, r.familyId));
    expect(st).toMatchObject({ payments: [], paidCents: 0, recordedCents: 5650, remainingCents: 5650 });
    expect(st.payments.reduce((sum, p) => sum + p.savedCents, 0)).toBe(st.paidCents);
    expect(st.remainingCents).toBe((await ledgerView(db, r.familyId, await clockNow(db, r.familyId))).savingsCents);
  });

  it("'You owe Zoe' includes the match already worked out on a waiting release (re-review LOW 1)", async () => {
    const { r } = await seeded();
    const { review } = await advanceDemoClock(d(), r.familyId, "endOfMonth"); // promotes: $56.50 saved + $56.50 match, unpaid
    expect(review!.release).toMatchObject({ savedCents: 5650, matchCents: 5650 });
    const now = await clockNow(db, r.familyId);
    const st = await closingStatement(db, r.familyId, now);
    expect(st.remainingCents).toBe((await ledgerView(db, r.familyId, now)).savingsCents); // the ledger figure
    expect(st.remainingCents).toBe(5650);
    expect(st.waiting).toEqual({ savedCents: 5650, matchCents: 5650 });
    expect(st.current.state).toBe("in_force");
    expect(st.owedCents).toBe(5650 + 5650 + st.current.addsCents);
  });

  it("decision 030: the seed ends with the demo cost estimates; a reset keeps them and clears a judge's pause", async () => {
    const { r, keys } = await seeded();
    expect((await getActiveGrant(db, r.familyId))!.body.costs).toEqual({ salesTaxBps: 800, shippingCents: 599 });
    await setPaused(d(), r.familyId, true);
    await resetDemo(d(), r.familyId, keys);
    expect((await getFamily(db, r.familyId))!.pausedAt).toBeNull();
    expect((await getActiveGrant(db, r.familyId))!.body.costs).toEqual({ salesTaxBps: 800, shippingCents: 599 });
  });

  it("an earlier judge's Stop doesn't mark the next judge's week stopped or not kept (review MEDIUM 2)", async () => {
    const { r, keys } = await seeded();
    await revoke(d(), r.familyId); // judge 1 stops in W53
    await resetDemo(d(), r.familyId, keys); // the stop time is cleared with the rest of judge 1's play
    await advanceDemoClock(d(), r.familyId, "endOfWeek"); // judge 2 closes W53
    const w53 = (await weekRecords(db, r.familyId)).find((w) => w.weekKey === "2026-W53")!;
    expect(w53).toMatchObject({ allowanceCents: 3000, spentCents: 1200, commitmentCents: DEMO_COMMITMENT_CENTS });
    expect(w53.stopped).toBeUndefined();
    expect(commitmentKept(w53)).toBe(true);
  });
});

describe("freshenDemoIfStale (R44)", () => {
  const version = async (familyId: string) => (await getActiveGrant(db, familyId))!.version;
  /** Pretend the last reset happened `ms` ago in real time (DB clock), without touching the seed's own window start. */
  const lastResetAgo = async (familyId: string, keys: { guardianKey: string; teenToken: string }, ms: number) => {
    await resetDemo(d(), familyId, keys);
    await db.update(t.families).set({ ledgerVoidTo: sql`now() - ${ms} * interval '1 millisecond'` }).where(eq(t.families.id, familyId));
  };

  it("an entry within 6 hours of the last seed or reset changes nothing, so a judge's level-up survives", async () => {
    const { r, keys } = await seeded();
    expect((await advanceDemoClock(d(), r.familyId, "endOfMonth")).review?.action).toBe("PROMOTE");
    const v = await version(r.familyId);
    expect(await freshenDemoIfStale(d(), keys)).toBe(false);
    expect(await version(r.familyId)).toBe(v);
    expect((await getActiveGrant(db, r.familyId))!.level).toBe(3);
  });

  it("an entry more than 6 hours after the last reset resets the demo", async () => {
    const { r, keys } = await seeded();
    await lastResetAgo(r.familyId, keys, DEMO_STALE_MS + 60_000);
    expect((await advanceDemoClock(d(), r.familyId, "endOfMonth")).review?.action).toBe("PROMOTE");
    expect(await freshenDemoIfStale(d(), keys)).toBe(true);
    expect((await getActiveGrant(db, r.familyId))!.level).toBe(2);
    expect((await clockNow(db, r.familyId)).getTime() - DEMO_NOW.getTime()).toBeLessThan(60_000);
    expect(await freshenDemoIfStale(d(), keys)).toBe(false); // fresh again
  });

  it("two concurrent entries reset once", async () => {
    const { r, keys } = await seeded();
    await lastResetAgo(r.familyId, keys, DEMO_STALE_MS + 60_000);
    const v = await version(r.familyId);
    const results = await Promise.all([freshenDemoIfStale(d(), keys), freshenDemoIfStale(d(), keys)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await version(r.familyId)).toBe(v + 1);
  });

  it("a freshen that fails while reopening the asks undoes its claim, so the next entry retries (M8)", async () => {
    const { r, keys } = await seeded();
    await lastResetAgo(r.familyId, keys, DEMO_STALE_MS + 60_000);
    const before = (await getFamily(db, r.familyId))!.ledgerVoidTo;
    // The clock read outside the lock (proposePurchase, requestApproval) fails: the claim and state reset already ran.
    const broken: ApproveDeps = { ...d(), now: async (f, conn) => { if (!conn) throw new Error("clock down"); return clockFor(db)(f, conn); } };
    await expect(freshenDemoIfStale(broken, keys)).rejects.toThrow("clock down");
    expect((await getFamily(db, r.familyId))!.ledgerVoidTo).toEqual(before);
    expect(await freshenDemoIfStale(d(), keys)).toBe(true);
    expect((await openApprovals(r.familyId)).map((a) => a.subject).sort()).toEqual(["purchase", "shop"]);
  });

  it("only the demo keys can freshen", async () => {
    await seeded();
    expect(await freshenDemoIfStale(d(), { guardianKey: "nobody", teenToken: "nobody" })).toBe(false);
    expect(await freshenDemoIfStale(d(), {})).toBe(false);
  });
});

