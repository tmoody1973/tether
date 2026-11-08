// Decision 029: weekly changes wait for next week, stopping keeps this week's promise, and the closing statement
// reads the same savings figure Zoe and Amara see.
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import type { Cart } from "@/engine/types";
import { asOf, commitmentKept, streak } from "@/engine/ladder";
import { proposePurchase, type Deps } from "@/flows/purchase";
import { WeekChangedError, guardianSetLevel, revoke, signGrant } from "@/flows/grant";
import { closeWeek } from "@/flows/week";
import { confirmRelease, runMonthReview } from "@/flows/month";
import { guardianHome } from "@/flows/home";
import { teenWeek } from "@/flows/teen";
import { closingStatement } from "@/flows/statement";
import { savingsCents, weekRecords } from "@/ledger/ledger";
import { weekChangeWords } from "@/ui/grantWords";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const WED = "2026-11-04T12:00:00Z"; // 2026-W45; next Monday is 9 Nov
let nowMs = 0;
let n = 0;
const at = (iso: string) => { nowMs = new Date(iso).getTime(); };
const deps = (): Deps => ({
  db, now: async () => new Date(nowMs), secret: "s",
  paypal: { configured: true, request: async <T,>() => ({ status: 204, headers: new Headers(), data: {} as T }) },
  channel3: { search: async () => [], lookup: async () => ({ kind: "not_a_product" }), retrieve: async () => null, websites: async () => [], shopsSelling: async () => [] },
  classifier: { ask: async () => ({ probability: 0.99, model: "m", modelVersion: "1" }) },
} as unknown as Deps);

/** A Level-`level` family signed on Mon 2 Nov, with a general shop, a bookshop and a saved PayPal. */
async function seed(level: 1 | 2 = 1) {
  n++;
  at("2026-11-02T08:00:00Z");
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `sp-${n}`, guardianName: "Amara", teenName: "Zoe" });
  await db.insert(t.merchants).values([
    { id: `sg${n}`, name: "Gen", domain: `sg${n}.example`, class: "general", opensAtLevel: 1 },
    { id: `sb${n}`, name: "Books", domain: `sb${n}.example`, class: "books", opensAtLevel: 2 },
  ]);
  await repo.saveVault(db, fam.id, `SPV${n}`);
  await signGrant(deps(), fam.id, { level });
  return { familyId: fam.id, gen: `sg${n}`, book: `sb${n}` };
}

const cart = (merchantId: string, cents: number): Cart =>
  ({ merchantId, items: [{ sku: `k${cents}`, title: "Thing", qty: 1, unitCents: cents }], totalCents: cents });
const spend = (familyId: string, cents: number) => repo.appendJournal(db, { familyId, kind: "spend", amountCents: cents, at: new Date(nowMs) });
const active = async (familyId: string) => (await repo.getActiveGrant(db, familyId))!;
const outcome = async (familyId: string, c: Cart) => (await proposePurchase(deps(), familyId, c)).decision.outcome;

describe("a weekly change waits for next week (029)", () => {
  it("moving up mid-week: this week stays $20 for the engine, Zoe and Amara; next week is $30", async () => {
    const s = await seed(1);
    at(WED);
    await spend(s.familyId, 1200);
    await guardianSetLevel(deps(), s.familyId, 2, "ready");
    const g = await active(s.familyId);
    expect(g.version).toBe(2); // a new version now: receipts keep tracing the rules that allowed them
    expect(g.body.weeklyCents).toBe(3000); // what she signed
    expect(g.body.thisWeek).toEqual({ weeklyCents: 2000, until: "2026-11-09T00:00:00.000Z" });
    expect(asOf(g.body, new Date(nowMs)).weeklyCents).toBe(2000);

    // "left this week" agrees everywhere with what the week will close with: $8
    expect((await teenWeek(db, s.familyId, new Date(nowMs))).leftCents).toBe(800);
    expect((await guardianHome(db, s.familyId, new Date(nowMs))).weeklyCents).toBe(2000);
    expect(await outcome(s.familyId, cart(s.gen, 800))).toBe("ALLOW");
    expect(await outcome(s.familyId, cart(s.gen, 900))).toBe("REFUSE"); // $30 would allow it; this week is $20

    at("2026-11-16T09:00:00Z"); // W47: closes W45 and W46
    await closeWeek(deps(), s.familyId);
    const ws = await weekRecords(db, s.familyId);
    expect(ws.map((w) => [w.weekKey, w.allowanceCents])).toEqual([["2026-W45", 2000], ["2026-W46", 3000]]);
    expect(await savingsCents(db, s.familyId)).toBe(800 + 3000);
    expect(asOf(g.body, new Date("2026-11-09T00:00:00Z")).weeklyCents).toBe(3000);
  });

  it("moving down mid-week: shops and approvals tighten now; the $30 week stays $30", async () => {
    const s = await seed(2);
    at(WED);
    expect(await outcome(s.familyId, cart(s.book, 500))).toBe("ALLOW"); // a bookshop at Level 2 (first visit is fine there)
    await guardianSetLevel(deps(), s.familyId, 1, "slow down");
    expect(await outcome(s.familyId, cart(s.book, 500))).toBe("REFUSE"); // bookshop gone at once
    expect(await outcome(s.familyId, cart(s.gen, 1500))).toBe("NEEDS_APPROVAL"); // Level 1 asks over $10, at once
    const g = await active(s.familyId);
    expect(asOf(g.body, new Date(nowMs)).weeklyCents).toBe(3000);
    expect(asOf(g.body, new Date(nowMs)).constraints).toContainEqual({ type: "approval.over_amount", overCents: 1000 });
    at("2026-11-10T09:00:00Z");
    await closeWeek(deps(), s.familyId);
    expect((await weekRecords(db, s.familyId))[0]).toMatchObject({ weekKey: "2026-W45", allowanceCents: 3000 });
  });

  it("two changes in one week keep the week's original amount", async () => {
    const s = await seed(1);
    at(WED);
    await guardianSetLevel(deps(), s.familyId, 2, "ready");
    at("2026-11-05T12:00:00Z");
    await guardianSetLevel(deps(), s.familyId, 3, "really ready");
    await signGrant(deps(), s.familyId, { level: 3, commitmentFloorPct: 20 }); // a saving change re-signs: still $20 this week
    expect((await active(s.familyId)).body.thisWeek?.weeklyCents).toBe(2000);
    at("2026-11-10T09:00:00Z");
    await closeWeek(deps(), s.familyId);
    expect((await weekRecords(db, s.familyId))[0].allowanceCents).toBe(2000);
  });

  it("an engine level-up applies now (it isn't Amara re-signing)", async () => {
    const s = await seed(1);
    at(WED);
    await db.insert(t.weeks).values(["2026-W41", "2026-W42", "2026-W43", "2026-W44"].map((weekKey) => ({
      familyId: s.familyId, weekKey, allowanceCents: 2000, commitmentCents: 200, closedAt: new Date("2026-11-02T00:00:00Z"),
    })));
    expect((await runMonthReview(deps(), s.familyId)).action).toBe("PROMOTE");
    expect((await active(s.familyId)).body.thisWeek).toBeUndefined();
  });
});

describe("Change this week too (029)", () => {
  const MON = new Date("2026-11-09T00:00:00Z");

  it("applies now, the week adds exactly what the confirm said, and it says the week won't count toward a level-up", async () => {
    const s = await seed(2);
    await db.update(t.families).set({ commitmentCents: 1000 }).where(eq(t.families.id, s.familyId)); // she promised $10 a week
    at(WED);
    await spend(s.familyId, 1200);
    const words = weekChangeWords({ teenName: "Zoe", fromCents: 3000, toCents: 2000, spentCents: 1200, promisedCents: 1000, startsOn: MON });
    expect(words.now).toBe("This week becomes $20.00. Zoe has spent $12.00, so she has $8.00 left, and this week adds $8.00 to what you've promised "
      + "instead of $18.00. That's less than the $10.00 she promised to save, so this week won't count toward her next level.");
    expect(words.later).toBe("From Mon 9 Nov: $20.00/week. This week stays $30.00.");
    await guardianSetLevel(deps(), s.familyId, 1, "slow down", { shownFromCents: 3000, shownSpentCents: 1200, shownPromisedCents: 1000 });
    const g = await active(s.familyId);
    expect(g.body.thisWeek).toBeUndefined();
    expect((await teenWeek(db, s.familyId, new Date(nowMs))).leftCents).toBe(800);
    at("2026-11-10T09:00:00Z");
    await closeWeek(deps(), s.familyId);
    expect(await savingsCents(db, s.familyId)).toBe(800);
    const [w] = await weekRecords(db, s.familyId);
    expect(w.commitmentCents).toBe(1000);
    expect(commitmentKept(w)).toBe(false); // what the words said
  });

  it("enough left for her promise: no level-up sentence", () => {
    expect(weekChangeWords({ teenName: "Zoe", fromCents: 2000, toCents: 3000, spentCents: 500, promisedCents: 300, startsOn: MON }).now)
      .toBe("This week becomes $30.00. Zoe has spent $5.00, so she has $25.00 left, and this week adds $25.00 to what you've promised instead of $15.00.");
  });

  it("spent past the new amount: says how far over, $0 left, adds $0, and the week won't count", () => {
    expect(weekChangeWords({ teenName: "Zoe", fromCents: 3000, toCents: 2000, spentCents: 2500, promisedCents: 1000, startsOn: MON }).now)
      .toBe("This week becomes $20.00. Zoe has already spent $25.00, $5.00 more than that, so she has $0.00 left, and this week adds $0.00 "
        + "to what you've promised instead of $5.00. That's less than the $10.00 she promised to save, so this week won't count toward her next level.");
  });

  it("refuses, changing nothing, when she spent since the numbers were shown; says what it means now (review MEDIUM 4)", async () => {
    const s = await seed(2);
    at(WED);
    await spend(s.familyId, 1500); // the page showed $15 spent
    await spend(s.familyId, 1000); // then Zoe bought a $10 item
    const before = await active(s.familyId);
    const err = await guardianSetLevel(deps(), s.familyId, 1, "slow down", { shownFromCents: 3000, shownSpentCents: 1500, shownPromisedCents: 200 }).catch((e) => e);
    expect(err).toBeInstanceOf(WeekChangedError);
    expect((err as WeekChangedError).change).toEqual({ fromCents: 3000, toCents: 2000, spentCents: 2500, promisedCents: 200 });
    expect((await active(s.familyId)).version).toBe(before.version); // nothing changed
    expect(await db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, s.familyId))).toHaveLength(0);
    const err2 = await signGrant(deps(), s.familyId, { level: 1, reason: "x", applyNow: { shownFromCents: 3000, shownSpentCents: -1, shownPromisedCents: 200 } }).catch((e) => e);
    expect(err2).toBeInstanceOf(WeekChangedError); // a missing number never matches
    // Re-confirmed on the new numbers, it applies.
    await guardianSetLevel(deps(), s.familyId, 1, "slow down", { shownFromCents: 3000, shownSpentCents: 2500, shownPromisedCents: 200 });
    expect((await active(s.familyId)).level).toBe(1);
  });

  it("refuses when the savings promise behind the level-up warning changed since it was shown (re-review gap)", async () => {
    const s = await seed(2);
    at(WED);
    await spend(s.familyId, 1200);
    // Shown: promise $2 (the floor), so $8 left keeps the week and no warning. Then a pending $10 promise took effect
    // (a week closed in another tab): now $8 left would NOT keep it, and the confirm must not go through on the old words.
    await db.update(t.families).set({ commitmentCents: 1000 }).where(eq(t.families.id, s.familyId));
    const before = await active(s.familyId);
    const err = await guardianSetLevel(deps(), s.familyId, 1, "slow down", { shownFromCents: 3000, shownSpentCents: 1200, shownPromisedCents: 200 }).catch((e) => e);
    expect(err).toBeInstanceOf(WeekChangedError);
    expect((err as WeekChangedError).change).toEqual({ fromCents: 3000, toCents: 2000, spentCents: 1200, promisedCents: 1000 });
    expect((await active(s.familyId)).version).toBe(before.version);
    expect(weekChangeWords({ teenName: "Zoe", ...(err as WeekChangedError).change, startsOn: MON }).now).toContain("won't count toward her next level");
  });

  it("signing (no rules in force) after a stop this week also waits unless chosen", async () => {
    const s = await seed(1);
    at(WED);
    await revoke(deps(), s.familyId);
    await signGrant(deps(), s.familyId, { level: 2, reason: "fresh start" });
    expect((await active(s.familyId)).body.thisWeek?.weeklyCents).toBe(2000);
    const t2 = await seed(1);
    at(WED);
    await revoke(deps(), t2.familyId);
    await signGrant(deps(), t2.familyId, { level: 2, reason: "fresh start", applyNow: true });
    expect((await active(t2.familyId)).body.thisWeek).toBeUndefined();
  });
});

describe("stopping keeps this week's promise (029)", () => {
  it("the stop week closes at the allowance in force; later weeks give nothing", async () => {
    const s = await seed(1);
    at(WED);
    await spend(s.familyId, 500);
    await revoke(deps(), s.familyId);
    const [g] = await db.select().from(t.grants).where(eq(t.grants.familyId, s.familyId));
    expect(g).toMatchObject({ status: "revoked", revokedAt: new Date(WED) });
    expect(await outcome(s.familyId, cart(s.gen, 100))).toBe("REFUSE"); // purchases stop at once
    at("2026-11-23T09:00:00Z");
    expect((await closeWeek(deps(), s.familyId)).weekKeys).toEqual(["2026-W45", "2026-W46", "2026-W47"]);
    const ws = await weekRecords(db, s.familyId);
    expect(ws.map((w) => w.allowanceCents)).toEqual([2000, 0, 0]);
    expect(ws[0]).toMatchObject({ stopped: true, spentCents: 500 });
    expect(await savingsCents(db, s.familyId)).toBe(1500);
    expect(ws.some(commitmentKept)).toBe(false);
  });

  it("a stopped week breaks the level-up run even if she re-signs that week", async () => {
    const s = await seed(1);
    await db.insert(t.weeks).values(["2026-W41", "2026-W42", "2026-W43", "2026-W44"].map((weekKey) => ({
      familyId: s.familyId, weekKey, allowanceCents: 2000, commitmentCents: 200, closedAt: new Date("2026-11-02T00:00:00Z"),
    })));
    at(WED);
    await revoke(deps(), s.familyId);
    at("2026-11-05T09:00:00Z");
    await signGrant(deps(), s.familyId, { level: 1 });
    at("2026-11-09T00:01:00Z");
    await closeWeek(deps(), s.familyId);
    const ws = await weekRecords(db, s.familyId);
    expect(ws.at(-1)).toMatchObject({ weekKey: "2026-W45", allowanceCents: 2000, stopped: true });
    expect(streak(ws)).toBe(0); // four kept weeks, then the stop week: the run starts again
    expect((await runMonthReview(deps(), s.familyId)).action).toBe("HOLD");
  });
});

describe("closing statement (029)", () => {
  it("remaining = the savings figure Zoe and Amara see, through releases and investing", async () => {
    const s = await seed(1);
    at("2026-11-17T09:00:00Z"); // closes W45 and W46 at $20 each, nothing spent: $40 recorded
    await closeWeek(deps(), s.familyId);
    await signGrant(deps(), s.familyId, { level: 1 }); // the first rules ended on 9 Nov: renew for this week
    await db.insert(t.releases).values({ id: `rel-sp-${n}`, familyId: s.familyId, savedCents: 1500, matchCents: 1500 });
    await confirmRelease(deps(), `rel-sp-${n}`, s.familyId); // $15 paid to Zoe
    await repo.appendJournal(db, { familyId: s.familyId, kind: "invest", amountCents: 1000, ref: `inv-sp-${n}`, at: new Date(nowMs) });
    await repo.appendJournal(db, { familyId: s.familyId, kind: "invest", amountCents: 400, ref: `inv2-sp-${n}`, at: new Date(nowMs) });
    await repo.appendJournal(db, { familyId: s.familyId, kind: "invest_reversal", amountCents: 400, ref: `inv2-sp-${n}`, at: new Date(nowMs) });
    await db.insert(t.releases).values({ id: `rel2-sp-${n}`, familyId: s.familyId, savedCents: 500, matchCents: 500 }); // open
    await spend(s.familyId, 300);
    await revoke(deps(), s.familyId);

    const now = new Date(nowMs);
    const st = await closingStatement(db, s.familyId, now);
    const figure = await savingsCents(db, s.familyId);
    expect(st.remainingCents).toBe(figure);
    expect(st.remainingCents).toBe((await teenWeek(db, s.familyId, now)).savingsCents);
    expect(st.remainingCents).toBe((await guardianHome(db, s.familyId, now)).savingsCents);
    expect(st).toMatchObject({ recordedCents: 4000, paidCents: 1500, investedCents: 1000, remainingCents: 1500, owedCents: 1500 + 500 + 1700 }); // + the waiting release's match
    expect(st.recordedCents - st.paidCents - st.investedCents).toBe(st.remainingCents);
    expect(st.weeks.map((w) => w.addedCents)).toEqual([2000, 2000]);
    expect(st.payments).toEqual([{ at: now, savedCents: 1500, matchCents: 1500 }]);
    expect(st.waiting).toEqual({ savedCents: 500, matchCents: 500 });
    expect(st.current).toMatchObject({ state: "stopped", stoppedAt: now, allowanceCents: 2000, spentCents: 300, addsCents: 1700 });
    expect(st.removesAt).toBeNull(); // not self-started

    at("2026-11-23T09:00:00Z"); // the stop week closes: exactly the statement's "adds"
    await closeWeek(deps(), s.familyId);
    expect(await savingsCents(db, s.familyId)).toBe(1500 + 1700);
    // The headline after a stop = what Zoe sees once the week closes, plus the match on the release waiting to be paid.
    expect(await savingsCents(db, s.familyId) + st.waiting!.matchCents).toBe(st.owedCents);
    expect(st.payments.reduce((sum, p) => sum + p.savedCents, 0)).toBe(st.paidCents);
    expect((await closingStatement(db, s.familyId, new Date(nowMs))).current.state).toBe("none");
  });

  it("stopped in the first week with nothing spent: the headline owes $20, not $0 (review MEDIUM 5)", async () => {
    const s = await seed(1);
    at(WED);
    await revoke(deps(), s.familyId);
    const st = await closingStatement(db, s.familyId, new Date(nowMs));
    expect(st).toMatchObject({ remainingCents: 0, owedCents: 2000, current: { state: "stopped", addsCents: 2000 } });
    at("2026-11-10T09:00:00Z");
    await closeWeek(deps(), s.familyId);
    expect(await savingsCents(db, s.familyId)).toBe(st.owedCents);
  });

  it("a self-started family's statement says when it is removed", async () => {
    const s = await seed(1);
    await db.update(t.families).set({ paypalSub: `sub-${n}`, createdAt: new Date("2026-11-01T00:00:00Z") }).where(eq(t.families.id, s.familyId));
    expect((await closingStatement(db, s.familyId, new Date(nowMs))).removesAt).toEqual(new Date("2026-11-08T00:00:00Z"));
  });
});
