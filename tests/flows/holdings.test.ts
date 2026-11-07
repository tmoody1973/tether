import { beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { advance } from "@/clock/clock";
import type { Close } from "@/adapters/alpaca/data";
import type { FilledOrder } from "@/adapters/alpaca/broker";
import { familyHoldings, type HoldingsDeps } from "@/flows/holdings";
import { QUESTIONS } from "@/ui/investQuestions";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const DAY = 86_400_000;
/** Every weekday in October 2026, stamped as Alpaca stamps daily bars (midnight New York). */
const DAYS = Array.from({ length: 31 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i, 4))).filter((d) => d.getUTCDay() % 6 !== 0);
const closes = (start: number, step: number): Close[] => DAYS.map((day, i) => ({ day, cents: start + step * i }));
const VTI = closes(30_000, 100); // $300.00, then +$1 a session
const SPY = closes(60_000, 150);
const REAL_NOW = Date.parse("2026-11-02T15:00:00Z"); // the Monday after the last close
const idx = (iso: string) => DAYS.findIndex((d) => d.toISOString().slice(0, 10) === iso);

function market(series: Record<string, Close[]> = { VTI, SPY }): HoldingsDeps["market"] {
  return {
    latestClose: async (s) => series[s]?.at(-1) ?? null,
    dailyCloses: async (s, from, to) => {
      if (!series[s]) throw new Error(`no bars for ${s}`);
      return series[s].filter((c) => c.day >= from && c.day <= to);
    },
  };
}

let n = 0;
type LotSeed = { symbol?: string; amountCents: number; status?: (typeof t.investments.$inferSelect)["status"]; fill?: FilledOrder | "fails"; answers?: Record<string, string> };
async function seed(lots: LotSeed[]) {
  n++;
  const familyId = (await repo.insertFamily(db, { name: "F", teenToken: `hold-${n}`, guardianName: "Amara", teenName: "Zoe" })).id;
  const fills = new Map<string, FilledOrder | "fails">();
  const ids: string[] = [];
  for (const [i, l] of lots.entries()) {
    const id = `inv-${n}-${i}`;
    ids.push(id);
    const orderId = `ord-${n}-${i}`;
    if (l.fill) fills.set(orderId, l.fill);
    await db.insert(t.investments).values({
      id, familyId, symbol: l.symbol ?? "VTI", amountCents: l.amountCents, status: l.status ?? "filled",
      answers: l.answers ?? { [QUESTIONS.why]: `why ${i}`, [QUESTIONS.drop]: `drop ${i}` }, alpacaAccountId: "acct", orderId,
    });
  }
  const order = vi.fn(async (_acct: string, orderId: string) => {
    const f = fills.get(orderId);
    if (!f || f === "fails") throw new Error("lookup failed");
    return f;
  });
  const deps = (m = market()): HoldingsDeps => ({ db, order, market: m, realNow: () => REAL_NOW });
  return { familyId, ids, order, deps };
}
/** A fill as Alpaca reports it: $amount at that session's VTI close. */
const fillOn = (iso: string, amountCents: number): FilledOrder => {
  const price = VTI[idx(iso)].cents / 100;
  return { qty: Number((amountCents / 100 / price).toFixed(9)), avgPrice: price, at: new Date(`${iso}T14:30:00Z`) };
};

describe("familyHoldings", () => {
  it("one lot: Alpaca's shares, what she put in, worth at the latest close, and the same money in SPY", async () => {
    const fill = fillOn("2026-10-01", 500);
    const s = await seed([{ amountCents: 500, fill }]);
    const [h] = await familyHoldings(s.deps(), s.familyId);
    const vtiNow = VTI.at(-1)!.cents, spyNow = SPY.at(-1)!.cents;
    expect(h).toMatchObject({
      symbol: "VTI", shares: fill.qty, putInCents: 500, worthCents: Math.round(fill.qty * vtiNow), since: fill.at,
      daysHeld: 32, marketCents: Math.round((500 / SPY[0].cents) * spyNow), investmentIds: s.ids,
      words: { why: "why 0", drop: "drop 0" },
    });
    expect(h.line!.mine[0]).toBe(500); // bought at that day's close
    expect(h.line!.market[0]).toBe(500);
    expect(h.line!.mine.at(-1)).toBe(h.worthCents);
    expect(h.line!.market.at(-1)).toBe(h.marketCents);
  });

  it("two lots on different days: each counts from its own fill day, and the market side uses each lot's own SPY price", async () => {
    const a = fillOn("2026-10-01", 500), b = fillOn("2026-10-15", 1000);
    const s = await seed([{ amountCents: 500, fill: a }, { amountCents: 1000, fill: b, answers: { [QUESTIONS.why]: "the newer why", [QUESTIONS.drop]: "the newer drop" } }]);
    const [h] = await familyHoldings(s.deps(), s.familyId);
    const spyNow = SPY.at(-1)!.cents;
    expect(h.shares).toBeCloseTo(a.qty + b.qty, 12);
    expect(h.putInCents).toBe(1500);
    expect(h.since).toEqual(a.at);
    expect(h.marketCents).toBe(Math.round((500 / SPY[0].cents) * spyNow + (1000 / SPY[idx("2026-10-15")].cents) * spyNow));
    expect(h.words).toEqual({ why: "the newer why", drop: "the newer drop" }); // the most recent lot
    // The day before the second fill, only the first lot is held: on the line, before thinning (21 sessions, < 61).
    const before = idx("2026-10-14");
    expect(h.line!.mine[before]).toBe(Math.round(a.qty * VTI[before].cents));
    expect(h.line!.market[before]).toBe(Math.round((500 / SPY[0].cents) * SPY[before].cents));
    expect(h.line!.mine[before + 1]).toBe(Math.round((a.qty + b.qty) * VTI[before + 1].cents));
  });

  it("too soon: fewer than 5 closes since she bought means no line and no market comparison", async () => {
    const s = await seed([{ amountCents: 500, fill: fillOn("2026-10-27", 500) }]); // 27th–30th: 4 closes
    const [h] = await familyHoldings(s.deps(), s.familyId);
    expect(h.line).toBeNull();
    expect(h.marketCents).toBeNull();
    expect(h.daysHeld).toBe(6); // real days, for the under-30 hint
    expect(h.worthCents).toBe(Math.round(h.shares * VTI.at(-1)!.cents));
  });

  it("only FILLED investments; a filled one whose order lookup fails is left to today's row", async () => {
    const s = await seed([
      { amountCents: 500, fill: fillOn("2026-10-01", 500) },
      { amountCents: 700, fill: "fails" },
      { amountCents: 900, status: "queued", fill: fillOn("2026-10-02", 900) },
      { amountCents: 300, status: "proposed" },
    ]);
    const hs = await familyHoldings(s.deps(), s.familyId);
    expect(hs).toHaveLength(1);
    expect(hs[0].investmentIds).toEqual([s.ids[0]]);
    expect(hs[0].putInCents).toBe(500);
    expect(s.order).toHaveBeenCalledTimes(2); // never asked about the queued or proposed rows
  });

  it("no latest price: no card (her rows stay as they are); no market data: a card without a line", async () => {
    const s = await seed([{ amountCents: 500, fill: fillOn("2026-10-01", 500) }]);
    expect(await familyHoldings(s.deps(market({ SPY })), s.familyId)).toEqual([]);
    const [h] = await familyHoldings(s.deps(market({ VTI })), s.familyId); // SPY unavailable
    expect(h.worthCents).toBeGreaterThan(0);
    expect(h.line).toBeNull();
    expect(h.marketCents).toBeNull();
  });

  it("the demo clock moved a month ahead changes nothing: real dates only", async () => {
    const s = await seed([{ amountCents: 500, fill: fillOn("2026-10-27", 500) }]);
    const before = await familyHoldings(s.deps(), s.familyId);
    await advance(db, s.familyId, 30 * DAY);
    expect(await familyHoldings(s.deps(), s.familyId)).toEqual(before);
  });
});
