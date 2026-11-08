// Decision 030: Amara chooses consent (spending mode, pause, investing), refunds give the money back, and the total
// includes Tether's tax and shipping estimates all the way to PayPal.
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import type { PaypalHttp } from "@/adapters/paypal/http";
import type { Channel3Adapter } from "@/adapters/channel3/client";
import { cartHash } from "@/engine/hash";
import { decideInvestment } from "@/engine/invest";
import { costSplit, itemOf, pricedCart, taxCents } from "@/engine/pricing";
import { orderAmount, usd } from "@/adapters/paypal/orders";
import { requestApproval } from "@/flows/approvals";
import { approveAndSettle, type ApproveDeps } from "@/flows/approve";
import { GrantError, setCosts, setInvesting, setPaused, setSpending, signGrant } from "@/flows/grant";
import { proposePurchase, settlePurchase } from "@/flows/purchase";
import { applyRefunds, refundedByCapture } from "@/flows/refunds";
import { teenWeek } from "@/flows/teen";
import { closeWeek } from "@/flows/week";
import { ledgerView, savingsCents } from "@/ledger/ledger";
import type { Cart } from "@/engine/types";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const WED = new Date("2026-11-04T12:00:00Z"); // W45
let clock = WED;
let n = 0;
let sent: Record<string, unknown>[] = []; // PayPal create-order bodies

function deps(price: number): ApproveDeps {
  let k = 0;
  const paypal: PaypalHttp = {
    async request<T>(method: string, _path: string, opts?: { body?: unknown }) {
      if (method === "DELETE") return { status: 204, headers: new Headers(), data: {} as T };
      if (opts?.body) sent.push(opts.body as Record<string, unknown>);
      const data = { id: `O${++k}`, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `CO-CAP-${n}-${k}`, status: "COMPLETED" }] } }] };
      return { status: 201, headers: new Headers(), data: data as T };
    },
  };
  const no = async () => { throw new Error("unused"); };
  const channel3: Channel3Adapter = {
    retrieve: async (sku, allowed) => ({ id: sku, title: "Thing", priceCents: price, domain: allowed[0], available: true, condition: "new" }),
    search: no, lookup: no, websites: no, shopsSelling: no,
  };
  return {
    db, paypal, channel3, secret: "consent-secret", now: async () => clock,
    classifier: { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) },
    alpaca: () => { throw new Error("no alpaca"); },
  } as ApproveDeps;
}

/** A family at `level` with one general shop it has already bought from (so first-shop approval doesn't apply). */
async function family(level: 1 | 2 | 3) {
  n++;
  clock = WED;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `co-${n}`, guardianName: "Amara", teenName: "Zoe" });
  const mid = `co-m${n}`, fresh = `co-new${n}`;
  await db.insert(t.merchants).values([
    { id: mid, name: "Target", domain: `co${n}.example`, class: "general", channel3WebsiteId: `co${n}.example`, opensAtLevel: 1 },
    { id: fresh, name: "New Shop", domain: `cn${n}.example`, class: "general", channel3WebsiteId: `cn${n}.example`, opensAtLevel: 1 },
  ]);
  await repo.saveVault(db, fam.id, `V-co-${n}`);
  await signGrant(deps(100), fam.id, { level });
  const used = await repo.insertPurchase(db, { familyId: fam.id, cart: cart(mid, 100), cartHash: "x", status: "paid", decision: { outcome: "ALLOW", reasons: [], semanticRules: [] } });
  await repo.appendJournal(db, { familyId: fam.id, kind: "spend", amountCents: 0, at: new Date("2026-10-01T00:00:00Z"), ref: used.id });
  return { familyId: fam.id, mid, fresh };
}
const cart = (merchantId: string, cents: number): Cart => pricedCart(merchantId, [{ sku: `s${cents}`, title: "Thing", qty: 1, unitCents: cents }]);
const outcome = async (familyId: string, c: Cart) => (await proposePurchase(deps(c.items[0].unitCents), familyId, c)).decision.outcome;

describe("spending mode (030)", () => {
  it("Up to $15 at Level 2: $15.00 exactly goes through, $15.01 asks Amara (not refused)", async () => {
    const f = await family(2);
    expect(await outcome(f.familyId, cart(f.mid, 1600))).toBe("ALLOW"); // the level's own rule: over $20 asks
    await setSpending(deps(100), f.familyId, { mode: "upTo", upToCents: 1500 });
    expect(await outcome(f.familyId, cart(f.mid, 1500))).toBe("ALLOW");
    expect(await outcome(f.familyId, cart(f.mid, 1501))).toBe("NEEDS_APPROVAL");
  });

  it("Level 1 keeps its first-shop check under an Up-to amount; 'every purchase' asks even for $1", async () => {
    const f = await family(1);
    await setSpending(deps(100), f.familyId, { mode: "upTo", upToCents: 1500 });
    expect(await outcome(f.familyId, cart(f.mid, 1200))).toBe("ALLOW");
    expect(await outcome(f.familyId, cart(f.fresh, 100))).toBe("NEEDS_APPROVAL"); // a shop she hasn't used
    await setSpending(deps(100), f.familyId, { mode: "every" });
    expect(await outcome(f.familyId, cart(f.mid, 100))).toBe("NEEDS_APPROVAL");
    expect((await repo.getActiveGrant(db, f.familyId))!.body.constraints.filter((c) => String(c.type).startsWith("approval.")))
      .toEqual([{ type: "approval.every_purchase" }]);
  });

  it("Level 3 has no per-purchase limit by default; the amount must be $1 to the weekly amount", async () => {
    const f = await family(3);
    expect(await outcome(f.familyId, cart(f.mid, 5000))).toBe("ALLOW");
    await expect(setSpending(deps(100), f.familyId, { mode: "upTo", upToCents: 99 })).rejects.toBeInstanceOf(GrantError);
    await expect(setSpending(deps(100), f.familyId, { mode: "upTo", upToCents: 5001 })).rejects.toBeInstanceOf(GrantError);
    await setSpending(deps(100), f.familyId, { mode: "upTo", upToCents: 5000 });
    await setSpending(deps(100), f.familyId, { mode: "upTo", upToCents: null });
    expect(await outcome(f.familyId, cart(f.mid, 5000))).toBe("ALLOW");
  });

  it("each change is a new rules version; 'every purchase' survives a level change, a custom amount doesn't", async () => {
    const f = await family(2);
    const v = (await repo.getActiveGrant(db, f.familyId))!.version;
    await setSpending(deps(100), f.familyId, { mode: "upTo", upToCents: 1500 });
    expect((await repo.getActiveGrant(db, f.familyId))!.version).toBe(v + 1);
    await signGrant(deps(100), f.familyId, { level: 3, reason: "ready" });
    expect((await repo.getActiveGrant(db, f.familyId))!.body.spending).toBeUndefined();
    await setSpending(deps(100), f.familyId, { mode: "every" });
    await signGrant(deps(100), f.familyId, { level: 2, reason: "back" });
    expect((await repo.getActiveGrant(db, f.familyId))!.body.spending).toEqual({ mode: "every" });
  });
});

describe("pause (030)", () => {
  it("blocks buying, lets her ask, lets Amara approve; keeps the saved PayPal and the week", async () => {
    const f = await family(2);
    const before = await proposePurchase(deps(800), f.familyId, cart(f.mid, 800)); // proposed before the pause
    expect(before.decision.outcome).toBe("ALLOW");
    await setPaused(deps(800), f.familyId, true);
    expect((await teenWeek(db, f.familyId, clock)).pausedBy).toBe("Amara");
    expect((await teenWeek(db, f.familyId, clock)).state).toBe("active");
    // A card proposed before the pause can't be bought now: the engine re-checks under the lock.
    expect((await settlePurchase(deps(800), before.purchaseId)).status).toBe("needs_approval");
    const asked = await proposePurchase(deps(800), f.familyId, cart(f.mid, 800));
    expect(asked.decision.outcome).toBe("NEEDS_APPROVAL");
    expect(asked.decision.reasons.map((r) => r.constraint)).toEqual(["approval.paused"]);
    const { approvalId } = await requestApproval(deps(800), f.familyId, "purchase", asked.purchaseId, cartHash(cart(f.mid, 800)));
    expect(await approveAndSettle(deps(800), f.familyId, approvalId)).toBe("paid"); // her deliberate yes
    expect(await repo.getVault(db, f.familyId)).not.toBeNull();
    expect((await repo.getActiveGrant(db, f.familyId))!.status).toBe("active");
    await setPaused(deps(800), f.familyId, false);
    expect(await outcome(f.familyId, cart(f.mid, 800))).toBe("ALLOW");
  });
});

describe("investing on/off (030)", () => {
  it("off refuses proposals in the engine; on again allows them", async () => {
    const f = await family(2);
    await setInvesting(deps(100), f.familyId, false);
    const g = (await repo.getActiveGrant(db, f.familyId))!.body;
    expect(g.investing).toBe(false);
    const off = decideInvestment({ ...g, fundAllowlist: ["VTI"] }, { symbol: "VTI", amountCents: 500 }, 10_000);
    expect(off.outcome).toBe("REFUSE");
    expect(off.reasons.map((r) => r.constraint)).toEqual(["invest.off"]);
    expect((await teenWeek(db, f.familyId, clock)).investingOff).toBe(true);
    await setInvesting(deps(100), f.familyId, true);
    const on = (await repo.getActiveGrant(db, f.familyId))!.body;
    expect(on.investing).toBeUndefined();
    expect(decideInvestment({ ...on, fundAllowlist: ["VTI"] }, { symbol: "VTI", amountCents: 500 }, 10_000).outcome).toBe("NEEDS_APPROVAL");
  });
});

describe("estimated tax and shipping in the total (030)", () => {
  it("tax rounds half up on the items, to the cent", () => {
    expect(taxCents(1299, 800)).toBe(104); // 103.92
    expect(taxCents(1000, 825)).toBe(83); // 82.5 → 83
    expect(taxCents(999, 825)).toBe(82); // 82.4175
    expect(taxCents(200, 625)).toBe(13); // 12.5 → 13
    expect(taxCents(0, 825)).toBe(0);
    const c = pricedCart("m", [itemOf({ id: "a", title: "A", priceCents: 1299 })], { salesTaxBps: 800, shippingCents: 599 });
    expect(c).toMatchObject({ itemsCents: 1299, estTaxCents: 104, estShippingCents: 599, totalCents: 2002 });
  });

  it("PayPal's amount and breakdown come from integer cents and always add up", () => {
    expect(usd(2002)).toBe("20.02");
    expect(usd(5)).toBe("0.05");
    for (const [items, bps, ship] of [[1299, 800, 599], [1, 825, 0], [99_999, 1500, 5000], [333, 725, 1]] as const) {
      const c = pricedCart("m", [{ sku: "x", title: "X", qty: 1, unitCents: items }], { salesTaxBps: bps, shippingCents: ship });
      const split = costSplit(c)!;
      const a = orderAmount(c.totalCents, split) as { value: string; breakdown: Record<string, { value: string }> };
      const cents = (v: string) => Number(v.replace(".", ""));
      expect(cents(a.breakdown.item_total.value) + cents(a.breakdown.tax_total.value) + cents(a.breakdown.shipping.value)).toBe(cents(a.value));
      expect(cents(a.value)).toBe(c.totalCents);
    }
    expect(orderAmount(1000, { itemCents: 900, taxCents: 50, shippingCents: 49 })).toBeNull(); // never sent if it doesn't add up
  });

  it("a cart with estimates: the budget, the slip, PayPal's breakdown and the receipt all use the total", async () => {
    const f = await family(2);
    await setCosts(deps(100), f.familyId, { salesTaxBps: 800, shippingCents: 599 });
    const costs = (await repo.getActiveGrant(db, f.familyId))!.body.costs;
    const c = pricedCart(f.mid, [itemOf({ id: "s1299", title: "Thing", priceCents: 1299, condition: "new" })], costs);
    expect(c.totalCents).toBe(2002);
    // $30 week, $12.99 item: fits by price, but $20.02 is over Level 2's $20 per-purchase rule, so it asks.
    const p = await proposePurchase(deps(1299), f.familyId, c);
    expect(p.decision.outcome).toBe("NEEDS_APPROVAL");
    const { approvalId } = await requestApproval(deps(1299), f.familyId, "purchase", p.purchaseId, cartHash(c));
    sent = [];
    expect(await approveAndSettle(deps(1299), f.familyId, approvalId)).toBe("paid");
    const unit = (sent[0].purchase_units as { amount: { value: string; breakdown: Record<string, { value: string }> } }[])[0];
    expect(unit.amount).toEqual({
      currency_code: "USD", value: "20.02",
      breakdown: { item_total: { currency_code: "USD", value: "12.99" }, tax_total: { currency_code: "USD", value: "1.04" }, shipping: { currency_code: "USD", value: "5.99" } },
    });
    const [row] = await db.select().from(t.purchases).where(eq(t.purchases.id, p.purchaseId));
    expect(row.charge!.token.amountCents).toBe(2002);
    expect((await ledgerView(db, f.familyId, clock)).spentThisWeekCents).toBe(2002);
    const [receipt] = await repo.receiptsForMonth(db, f.familyId, "2026-11");
    expect(receipt).toMatchObject({ amountCents: 2002, split: { itemsCents: 1299, estTaxCents: 104, estShippingCents: 599 } });
  });

  it("an offer that turned used since she saw it is refused at payment (its fingerprint changed)", async () => {
    const f = await family(2);
    const c = pricedCart(f.mid, [itemOf({ id: "s500", title: "Thing", priceCents: 500, condition: "new" })]);
    const p = await proposePurchase(deps(500), f.familyId, c);
    const used = { ...deps(500), channel3: { ...deps(500).channel3, retrieve: async (sku: string, allowed: string[]) => ({ id: sku, title: "Thing", priceCents: 500, domain: allowed[0], available: true, condition: "used" as const }) } };
    expect(await settlePurchase(used, p.purchaseId)).toMatchObject({ status: "refused", reason: "CART_MISMATCH" });
  });
});

describe("refunds give the money back (030)", () => {
  /** A paid $8 purchase this week, with its receipt and capture id. */
  async function paid(f: { familyId: string; mid: string }, cents = 800) {
    const c = cart(f.mid, cents);
    const p = await proposePurchase(deps(cents), f.familyId, c);
    expect(await settlePurchase(deps(cents), p.purchaseId)).toMatchObject({ status: "paid" });
    const [r] = await db.select().from(t.receipts).where(eq(t.receipts.purchaseId, p.purchaseId));
    return { purchaseId: p.purchaseId, captureId: r.captureId };
  }
  const refundRows = (familyId: string) => db.select().from(t.journal)
    .where(and(eq(t.journal.familyId, familyId), eq(t.journal.ref, t.journal.ref))).then((rows) => rows.filter((j) => j.kind.startsWith("refund")));

  it("open week: back into that week; replaying writes nothing", async () => {
    const f = await family(2);
    const { captureId } = await paid(f);
    expect((await ledgerView(db, f.familyId, clock)).spentThisWeekCents).toBe(800);
    const back = await applyRefunds(deps(800), f.familyId, new Map([[captureId, 800]]));
    expect(back.get(captureId)).toEqual({ weekCents: 800, promisedCents: 0 });
    await applyRefunds(deps(800), f.familyId, new Map([[captureId, 800]])); // replayed
    expect(await refundRows(f.familyId)).toHaveLength(1);
    expect((await ledgerView(db, f.familyId, clock)).spentThisWeekCents).toBe(0);
  });

  it("closed week: added to what Amara has promised; partial refunds add up, never past the charge", async () => {
    const f = await family(2);
    const { captureId } = await paid(f);
    clock = new Date("2026-11-10T09:00:00Z");
    await closeWeek(deps(800), f.familyId); // W45 closes: $30 − $8 = $22 recorded
    expect(await savingsCents(db, f.familyId)).toBe(2200);
    await applyRefunds(deps(800), f.familyId, new Map([[captureId, 300]]));
    await applyRefunds(deps(800), f.familyId, new Map([[captureId, 500]]));
    await applyRefunds(deps(800), f.familyId, new Map([[captureId, 5000]])); // more than charged: capped at $8
    const rows = await refundRows(f.familyId);
    expect(rows.map((r) => [r.kind, r.amountCents, r.ref])).toEqual([
      ["refund_promised", 300, `${captureId}#300`], ["refund_promised", 200, `${captureId}#500`], ["refund_promised", 300, `${captureId}#800`],
    ]);
    expect(await savingsCents(db, f.familyId)).toBe(2200 + 800);
  });

  it("PayPal's rows: undo rows add up; a reversed capture counts once, with or without its undo row", () => {
    const charged = new Map([["C1", 800], ["C2", 500]]);
    const rows = [
      { id: "R1", amountCents: -300, status: "S", referenceId: "C1", eventCode: "T1107" },
      { id: "R2", amountCents: -200, status: "S", referenceId: "C1", eventCode: "T1107" },
      { id: "SW", amountCents: -800, status: "S", referenceId: "C1", eventCode: "T2002" }, // a sweep, not a refund
      { id: "C2", amountCents: 500, status: "V" },
      { id: "R3", amountCents: -500, status: "S", referenceId: "C2", eventCode: "T1107" },
    ];
    expect(refundedByCapture(rows, charged)).toEqual(new Map([["C1", 500], ["C2", 500]]));
  });

  it("a declined charge (already reversed) is never refunded on top", async () => {
    const f = await family(2);
    const p = await repo.insertPurchase(db, { familyId: f.familyId, cart: cart(f.mid, 800), cartHash: "h", status: "paid", decision: { outcome: "ALLOW", reasons: [], semanticRules: [] } });
    await repo.appendJournal(db, { familyId: f.familyId, kind: "spend", amountCents: 800, at: clock, ref: p.id });
    await repo.appendJournal(db, { familyId: f.familyId, kind: "spend_reversal", amountCents: 800, at: clock, ref: p.id });
    const grant = (await repo.getActiveGrant(db, f.familyId))!;
    await repo.insertReceipt(db, { purchaseId: p.id, captureId: `DECL-${n}`, grantId: grant.id, grantVersion: grant.version, cartHash: "h", decision: p.decision, approvalId: null });
    await applyRefunds(deps(800), f.familyId, new Map([[`DECL-${n}`, 800]]));
    expect(await refundRows(f.familyId)).toHaveLength(0);
  });
});
