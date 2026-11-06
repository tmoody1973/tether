// R37/R38: what happens when PayPal's answer to a charge is lost, and how Tether finds out later without ever
// charging twice (PayPal forgets a PayPal-Request-Id after 6 hours) or reversing money that may have moved.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { PaypalError, type PaypalHttp } from "@/adapters/paypal/http";
import type { Channel3Adapter } from "@/adapters/channel3/client";
import type { Cart, Grant } from "@/engine/types";
import { onCaptureCompleted, proposePurchase, resumePayingPurchase, resumePayingPurchases, settlePurchase, type Deps } from "@/flows/purchase";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const NOW = new Date("2026-11-04T12:00:00Z"); // demo clock
const T0 = Date.parse("2026-11-05T09:00:00Z"); // real clock at the first send
const MIN = 60_000, HOUR = 60 * MIN;

// ---- a fake PayPal that behaves like the real one where it matters --------------------------------------
type Order = { id: string; status: string; purchase_units: { custom_id?: string; amount?: { value: string }; payments?: { captures?: { id: string; status: string }[] } }[] };
type CreateMode = "ok" | "lost-answer" | "approved-only" | "422";
type CaptureMode = "ok" | "409" | "already-captured" | "lost-answer";

function fakePaypal() {
  const byRequestId = new Map<string, Order>(); // PayPal keeps the id → order mapping (we model the 6h expiry by never relying on it after 5h)
  const byId = new Map<string, Order>();
  const calls: string[] = [];
  const search: { transaction_info: Record<string, unknown> }[] = [];
  let create: CreateMode = "ok", capture: CaptureMode = "ok";
  const tag = `F${++fakes}`;
  let n = 0;
  const captureIt = (o: Order) => {
    o.status = "COMPLETED";
    o.purchase_units[0].payments = { captures: [{ id: `CAP-${o.id}`, status: "COMPLETED" }] };
    search.push({ transaction_info: { transaction_id: `CAP-${o.id}`, transaction_amount: { value: o.purchase_units[0].amount?.value }, transaction_status: "S", custom_field: o.purchase_units[0].custom_id } });
  };
  const reply = <T>(data: unknown) => ({ status: 200, headers: new Headers(), data: structuredClone(data) as T });
  const http: PaypalHttp = {
    async request<T>(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) {
      calls.push(`${method} ${path.split("?")[0]}`);
      if (method === "POST" && path === "/v2/checkout/orders") {
        if (create === "422") throw new PaypalError(422, "UNPROCESSABLE_ENTITY", "declined", undefined, "INSTRUMENT_DECLINED");
        const key = opts.headers?.["PayPal-Request-Id"] ?? "";
        let o = byRequestId.get(key);
        if (!o) {
          const unit = (opts.body as { purchase_units: { custom_id: string; amount: { value: string } }[] }).purchase_units[0];
          o = { id: `${tag}-O${++n}`, status: "APPROVED", purchase_units: [{ custom_id: unit.custom_id, amount: unit.amount }] };
          if (create !== "approved-only") captureIt(o);
          byRequestId.set(key, o);
          byId.set(o.id, o);
        }
        if (create === "lost-answer") throw new PaypalError(0, "TIMEOUT", "request timed out after 15000 ms");
        return reply<T>(o);
      }
      const cap = path.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/);
      if (method === "POST" && cap) {
        const o = byId.get(cap[1])!;
        if (capture === "409") throw new PaypalError(409, "RESOURCE_CONFLICT", "in progress", undefined, "DUPLICATE_REQUEST_ID");
        if (capture === "already-captured") {
          if (o.status !== "COMPLETED") captureIt(o);
          throw new PaypalError(422, "UNPROCESSABLE_ENTITY", "already", undefined, "ORDER_ALREADY_CAPTURED");
        }
        if (o.status !== "COMPLETED") captureIt(o);
        if (capture === "lost-answer") throw new PaypalError(0, "TIMEOUT", "request timed out after 15000 ms");
        return reply<T>(o);
      }
      const get = path.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
      if (method === "GET" && get) return reply<T>(byId.get(get[1]));
      if (method === "GET" && path.startsWith("/v1/reporting/transactions")) return reply<T>({ transaction_details: search, total_pages: 1 });
      throw new Error(`unexpected ${method} ${path}`);
    },
  };
  return {
    http, calls, byId, first: () => `${tag}-O1`,
    captureNow: (id: string) => captureIt(byId.get(id)!),
    set: (c: { create?: CreateMode; capture?: CaptureMode }) => { create = c.create ?? create; capture = c.capture ?? capture; },
    forgetCapture: () => { search.length = 0; },
    markSearchStatus: (status: string) => { for (const r of search) r.transaction_info.transaction_status = status; },
  };
}

// ---- fixtures -------------------------------------------------------------------------------------------
let n = 0;
let fakes = 0; // order ids are unique across this file's fakes: receipts are unique on capture id
let familyId: string;
let merchantId: string;
let pp: ReturnType<typeof fakePaypal>;
let real = T0;
let demo = NOW;

async function seed() {
  n++;
  familyId = (await repo.insertFamily(db, { name: "F", teenToken: `rs${n}`, guardianName: "G", teenName: "Z" })).id;
  merchantId = `rs-m${n}`;
  await db.insert(t.merchants).values({ id: merchantId, name: "Shop", domain: "shop.example", class: "general", channel3WebsiteId: "shop.example", opensAtLevel: 1 });
  await db.insert(t.vault).values({ familyId, paymentTokenId: `VAULT-${n}` });
  const body: Grant = {
    id: `rs-g${n}`, familyId, version: 1, level: 1, weeklyCents: 2000, commitmentFloorPct: 10, matchPct: 100,
    constraints: [{ type: "payment.budget", maxCents: 2000, period: "WEEKLY" }, { type: "payment.allowed_payees", merchantIds: [merchantId] }],
    fundAllowlist: [], signedAt: "2026-11-02T00:00:00Z", expiresAt: "2026-11-30T00:00:00Z",
  };
  await repo.insertGrant(db, { id: body.id, familyId, version: 1, level: 1, body, signedAt: new Date(body.signedAt), expiresAt: new Date(body.expiresAt), status: "active" });
}

function deps(): Deps {
  const no = async () => { throw new Error("unused"); };
  const channel3: Channel3Adapter = {
    retrieve: async (sku) => ({ id: sku, title: "Thing", priceCents: 600, domain: "shop.example", available: true }), search: no, lookup: no, websites: no,
  };
  return {
    db, paypal: pp.http, channel3, secret: "resume-secret", now: async () => demo, realNow: () => real,
    classifier: { ask: async () => ({ probability: 0.99, model: "m", modelVersion: "1" }) },
  };
}

const cart = (): Cart => ({ merchantId, items: [{ sku: "a", title: "Thing", qty: 1, unitCents: 600 }], totalCents: 600 });
const row = async (id: string) => (await db.select().from(t.purchases).where(eq(t.purchases.id, id)))[0];
const journal = async () => (await db.select().from(t.journal).where(eq(t.journal.familyId, familyId))).map((r) => [r.kind, r.amountCents]);
const receipts = async (id: string) => db.select().from(t.receipts).where(eq(t.receipts.purchaseId, id));
const posts = () => pp.calls.filter((c) => c === "POST /v2/checkout/orders").length;

/** A charge whose create-order answer was lost: PayPal made (and captured) the order, Tether doesn't know. */
async function lostAnswer(mode: CreateMode = "lost-answer") {
  await seed();
  const { purchaseId } = await proposePurchase(deps(), familyId, cart());
  pp.set({ create: mode });
  expect(await settlePurchase(deps(), purchaseId)).toMatchObject({ status: "paying" });
  pp.set({ create: "ok" });
  pp.calls.length = 0;
  return purchaseId;
}

beforeEach(() => { pp = fakePaypal(); real = T0; demo = NOW; });

describe("R38: resume never charges twice", () => {
  it("unknown create outcome: spend kept, real send time stored, no reversal", async () => {
    const id = await lostAnswer();
    const p = await row(id);
    expect(p.chargeSentAt?.getTime()).toBe(T0); // real time, not the demo clock
    expect(p.paypalOrderId).toBeNull();
    expect(await journal()).toEqual([["spend", 600]]);
  });

  it("at 4h59m (real) it re-sends create-order with the same request id: PayPal returns the same order", async () => {
    const id = await lostAnswer();
    real = T0 + 4 * HOUR + 59 * MIN;
    expect(await resumePayingPurchase(deps(), id)).toEqual({ status: "paid" });
    expect(posts()).toBe(1);
    expect(pp.byId.size).toBe(1); // one order at PayPal, ever
    expect(await receipts(id)).toHaveLength(1);
    expect((await row(id)).paypalOrderId).toBe(pp.first());
  });

  it("at 5h01m it never re-sends: Transaction Search finds the slip's charge ⇒ paid", async () => {
    const id = await lostAnswer();
    real = T0 + 5 * HOUR + MIN;
    expect(await resumePayingPurchase(deps(), id)).toEqual({ status: "paid" });
    expect(posts()).toBe(0);
    expect(pp.calls).toEqual(["GET /v1/reporting/transactions"]);
    expect((await receipts(id))[0].captureId).toBe(`CAP-${pp.first()}`);
  });

  it("at 5h01m with nothing in Transaction Search: stays paying with NEEDS_CHECK, never reverses", async () => {
    const id = await lostAnswer();
    pp.forgetCapture();
    real = T0 + 5 * HOUR + MIN;
    expect(await resumePayingPurchase(deps(), id)).toMatchObject({ status: "paying" });
    expect(posts()).toBe(0);
    expect((await row(id)).chargeError).toBe("NEEDS_CHECK");
    expect(await journal()).toEqual([["spend", 600]]);
  });

  it("at 5h01m a DENIED Transaction Search row is not proof of a charge: stays NEEDS_CHECK, never paid", async () => {
    const id = await lostAnswer();
    pp.markSearchStatus("D");
    real = T0 + 5 * HOUR + MIN;
    expect(await resumePayingPurchase(deps(), id)).toMatchObject({ status: "paying" });
    expect((await row(id)).chargeError).toBe("NEEDS_CHECK");
    expect(await journal()).toEqual([["spend", 600]]);
  });

  it("order id stored ⇒ GET the order, no create POST (even inside the window)", async () => {
    await seed();
    const { purchaseId: id } = await proposePurchase(deps(), familyId, cart());
    pp.set({ create: "approved-only", capture: "409" }); // order made, capture still in progress at PayPal
    expect(await settlePurchase(deps(), id)).toMatchObject({ status: "paying" });
    expect((await row(id)).paypalOrderId).toBe(pp.first());
    pp.captureNow(pp.first()); // PayPal finishes the capture on its side
    pp.calls.length = 0;
    real = T0 + 10 * MIN;
    expect(await resumePayingPurchase(deps(), id)).toEqual({ status: "paid" });
    expect(pp.calls).toEqual([`GET /v2/checkout/orders/${pp.first()}`]);
  });
});

describe("R38: capture-step answers", () => {
  it("ORDER_ALREADY_CAPTURED ⇒ reads the order ⇒ paid", async () => {
    await seed();
    const { purchaseId: id } = await proposePurchase(deps(), familyId, cart());
    pp.set({ create: "approved-only", capture: "already-captured" });
    expect(await settlePurchase(deps(), id)).toEqual({ status: "paid" });
    expect(pp.calls).toContain(`GET /v2/checkout/orders/${pp.first()}`);
    expect(await receipts(id)).toHaveLength(1);
  });

  it("409 at capture ⇒ unknown: stays paying, no reversal", async () => {
    await seed();
    const { purchaseId: id } = await proposePurchase(deps(), familyId, cart());
    pp.set({ create: "approved-only", capture: "409" });
    expect(await settlePurchase(deps(), id)).toMatchObject({ status: "paying" });
    expect(await journal()).toEqual([["spend", 600]]);
    expect((await row(id)).chargeError).toMatch(/409/);
  });

  it("422 INSTRUMENT_DECLINED at create ⇒ failed with one reversal", async () => {
    await seed();
    const { purchaseId: id } = await proposePurchase(deps(), familyId, cart());
    pp.set({ create: "422" });
    expect(await settlePurchase(deps(), id)).toMatchObject({ status: "failed" });
    expect(await journal()).toEqual([["spend", 600], ["spend_reversal", 600]]);
  });
});

describe("R38: in flight and throttled, by real time", () => {
  it("advancing the DEMO clock a day doesn't make an in-flight charge resumable", async () => {
    const id = await lostAnswer();
    demo = new Date(NOW.getTime() + 24 * HOUR);
    real = T0 + 10_000;
    expect(await resumePayingPurchase(deps(), id)).toEqual({ status: "paying" });
    expect(pp.calls).toEqual([]);
  });

  it("one attempt per purchase per minute: a second resume right after makes no PayPal call", async () => {
    const id = await lostAnswer();
    pp.forgetCapture();
    real = T0 + 6 * HOUR;
    await resumePayingPurchase(deps(), id);
    expect(pp.calls).toHaveLength(1);
    real += 10_000;
    await resumePayingPurchases(deps(), familyId);
    expect(pp.calls).toHaveLength(1);
    real += MIN;
    await resumePayingPurchases(deps(), familyId);
    expect(pp.calls).toHaveLength(2);
  });

  it("webhook (via custom_id) then resume ⇒ one receipt", async () => {
    const id = await lostAnswer();
    const tokenId = (await row(id)).charge!.token.tokenId;
    await onCaptureCompleted(deps(), `CAP-${pp.first()}`, tokenId);
    expect((await row(id)).status).toBe("paid");
    real = T0 + HOUR;
    expect(await resumePayingPurchase(deps(), id)).toEqual({ status: "paid" });
    expect(await receipts(id)).toHaveLength(1);
    expect(pp.calls).toEqual([]);
  });
});

describe("PayPal not configured", () => {
  it("refuses before the debit: nothing spent, nothing sent, never paying", async () => {
    await seed();
    const { purchaseId: id } = await proposePurchase(deps(), familyId, cart());
    const off: PaypalHttp = { configured: false, request: async () => { throw new Error("PayPal is not configured here"); } };
    expect(await settlePurchase({ ...deps(), paypal: off }, id)).toEqual({ status: "refused", reason: "PAYPAL_UNAVAILABLE" });
    expect(await journal()).toEqual([]);
    expect((await row(id)).status).toBe("refused");
  });
});
