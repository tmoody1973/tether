import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { PaypalError, type PaypalHttp } from "@/adapters/paypal/http";
import type { Channel3Adapter, Product } from "@/adapters/channel3/client";
import type { Classifier } from "@/ai/classifier";
import type { Cart, Constraint, Grant } from "@/engine/types";
import { cartHash } from "@/engine/hash";
import { onCaptureCompleted, proposePurchase, settlePurchase, type Deps } from "@/flows/purchase";
import { POST } from "@/app/api/paypal/webhook/route";

const NOW = new Date("2026-11-04T12:00:00Z"); // 2026-W45
const DOMAIN = "books.example";
const FAIL_MSG = "We couldn't charge — nothing was spent.";

let db: Db;
beforeAll(async () => {
  db = createDb("pglite:memory");
  await migrateDb(db);
});

// ---- fakes ----------------------------------------------------------------

type PayMode = "completed" | "pending" | "500";
function fakePaypal() {
  const orders: { requestId: string; body: unknown }[] = [];
  let mode: PayMode = "completed";
  let n = 0;
  const http: PaypalHttp = {
    async request<T>(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) {
      if (method !== "POST" || path !== "/v2/checkout/orders") throw new Error(`unexpected ${method} ${path}`);
      orders.push({ requestId: opts.headers?.["PayPal-Request-Id"] ?? "", body: opts.body });
      if (mode === "500") throw new PaypalError(500, "INTERNAL_SERVER_ERROR", "boom");
      const status = mode === "pending" ? "PENDING" : "COMPLETED";
      const data = { id: `O${++n}`, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `CAP-${n}-${Math.random()}`, status }] } }] };
      return { status: 201, headers: new Headers(), data: data as T };
    },
  };
  return { http, orders, setMode: (m: PayMode) => { mode = m; } };
}

function fakeChannel3(prices: Record<string, number | null>) {
  const retrieve = vi.fn(async (productId: string, allowed: string[]): Promise<Product | null> => {
    const cents = prices[productId];
    if (cents == null || !allowed.includes(DOMAIN)) return null;
    return { id: productId, title: `T-${productId}`, priceCents: cents, domain: DOMAIN, available: true };
  });
  const nope = async () => { throw new Error("not used"); };
  const adapter: Channel3Adapter = { retrieve, search: nope, lookup: nope, websites: nope };
  return { adapter, retrieve };
}

function fakeClassifier(probability: number | null) {
  const ask = vi.fn(async () => ({ probability, model: "fake-model", modelVersion: "fake-1" }));
  const c: Classifier = { ask };
  return { c, ask };
}

// ---- fixtures -------------------------------------------------------------

let n = 0;
let familyId: string;
let merchantId: string;
let pp: ReturnType<typeof fakePaypal>;

async function seed(constraints: (m: string) => Constraint[]) {
  n++;
  familyId = (await repo.insertFamily(db, { name: "F", teenToken: `pt${n}`, guardianName: "G", teenName: "Z" })).id;
  merchantId = `m${n}`;
  await db.insert(t.merchants).values({
    id: merchantId, name: "Book Barn", domain: DOMAIN, class: "books",
    channel3WebsiteId: DOMAIN, paypalPayeeEmail: "seller@example.com", opensAtLevel: 1,
  });
  await db.insert(t.vault).values({ familyId, paymentTokenId: `VAULT-${n}` });
  const body: Grant = {
    id: `g${n}`, familyId, version: 3, level: 1, weeklyCents: 800, commitmentFloorPct: 10, matchPct: 50,
    constraints: constraints(merchantId), fundAllowlist: [], signedAt: "2026-11-02T00:00:00Z", expiresAt: "2026-11-09T00:00:00Z",
  };
  await repo.insertGrant(db, {
    id: body.id, familyId, version: body.version, level: 1, body,
    signedAt: new Date(body.signedAt), expiresAt: new Date(body.expiresAt), status: "active",
  });
}

const base = (m: string): Constraint[] => [
  { type: "payment.budget", maxCents: 800, period: "WEEKLY" },
  { type: "payment.allowed_payees", merchantIds: [m] },
];
const withBooks = (m: string): Constraint[] => [...base(m), { type: "checkout.semantic_category", merchantIds: [m], rule: "BOOKS_ONLY" }];

const cartOf = (sku: string, cents: number): Cart =>
  ({ merchantId, items: [{ sku, title: "The Hobbit", qty: 1, unitCents: cents }], totalCents: cents });

function deps(over: { prices?: Record<string, number | null>; p?: number | null } = {}) {
  const ch = fakeChannel3(over.prices ?? { a: 600, b: 600 });
  const cl = fakeClassifier(over.p === undefined ? 0.99 : over.p);
  const d: Deps = { db, paypal: pp.http, channel3: ch.adapter, classifier: cl.c, secret: "flow-secret", now: async () => NOW };
  return { d, ch, cl };
}

const journalKinds = async () =>
  (await db.select().from(t.journal).where(eq(t.journal.familyId, familyId))).map((r) => [r.kind, r.amountCents]);
const statusOf = async (id: string) => (await db.select().from(t.purchases).where(eq(t.purchases.id, id)))[0].status;

async function approve(purchaseId: string, hash: string) {
  await db.insert(t.approvals).values({
    id: `ap-${purchaseId}`, familyId, subject: "purchase", subjectId: purchaseId, cartHash: hash,
    expiresAt: new Date(NOW.getTime() + 3_600_000), result: "approved", decidedAt: NOW,
  });
}

beforeEach(() => { pp = fakePaypal(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

// ---- tests ----------------------------------------------------------------

describe("purchase flow", () => {
  it("allowed cart is charged once and receipted with grant version and cart hash", async () => {
    await seed(base);
    const { d } = deps();
    const cart = cartOf("a", 600);
    const { purchaseId, decision } = await proposePurchase(d, familyId, cart);
    expect(decision.outcome).toBe("ALLOW");
    expect(await statusOf(purchaseId)).toBe("proposed");

    expect(await settlePurchase(d, purchaseId)).toEqual({ status: "paid" });
    expect(pp.orders).toHaveLength(1);
    const [receipt] = await db.select().from(t.receipts).where(eq(t.receipts.purchaseId, purchaseId));
    expect(receipt).toMatchObject({ grantId: `g${n}`, grantVersion: 3, cartHash: cartHash(cart), approvalId: null });
    expect(receipt.captureId).toMatch(/^CAP-/);
    expect(await journalKinds()).toEqual([["spend", 600]]);
    const consumed = await db.select().from(t.consumedTokens).where(eq(t.consumedTokens.tokenId, pp.orders[0].requestId));
    expect(consumed).toHaveLength(1);

    // settling again is a no-op: no second charge
    expect(await settlePurchase(d, purchaseId)).toEqual({ status: "paid" });
    expect(pp.orders).toHaveLength(1);
  });

  it("needs-approval cart is not charged", async () => {
    await seed((m) => [...base(m), { type: "approval.over_amount", overCents: 500 }]);
    const { d } = deps();
    const { purchaseId, decision } = await proposePurchase(d, familyId, cartOf("a", 600));
    expect(decision.outcome).toBe("NEEDS_APPROVAL");
    expect((await settlePurchase(d, purchaseId)).status).toBe("needs_approval");
    expect(pp.orders).toHaveLength(0);
    expect(await journalKinds()).toEqual([]);
  });

  it("two settles racing $8 remaining with two $6 carts → exactly one paid, one refused", async () => {
    await seed(base);
    const { d } = deps();
    const a = await proposePurchase(d, familyId, cartOf("a", 600));
    const b = await proposePurchase(d, familyId, cartOf("b", 600));
    expect([a.decision.outcome, b.decision.outcome]).toEqual(["ALLOW", "ALLOW"]);

    const results = await Promise.all([settlePurchase(d, a.purchaseId), settlePurchase(d, b.purchaseId)]);
    expect(results.map((r) => r.status).sort()).toEqual(["paid", "refused"]);
    expect(pp.orders).toHaveLength(1);
    expect(await journalKinds()).toEqual([["spend", 600]]);
  });

  it("the same purchase settled twice concurrently is charged once", async () => {
    await seed(base);
    const { d } = deps();
    const { purchaseId } = await proposePurchase(d, familyId, cartOf("a", 600));
    const results = await Promise.all([settlePurchase(d, purchaseId), settlePurchase(d, purchaseId)]);
    // the loser reports whatever the winner has reached (paying mid-charge, or paid)
    expect(results.map((r) => r.status)).toContain("paid");
    expect(results.every((r) => r.status === "paid" || r.status === "paying")).toBe(true);
    expect(await statusOf(purchaseId)).toBe("paid");
    expect(pp.orders).toHaveLength(1);
    expect(await journalKinds()).toEqual([["spend", 600]]);
  });

  it("PayPal 500 → failed, journal has spend + spend_reversal, token consumed, exact message", async () => {
    await seed(base);
    const { d } = deps();
    const { purchaseId } = await proposePurchase(d, familyId, cartOf("a", 600));
    pp.setMode("500");
    expect(await settlePurchase(d, purchaseId)).toEqual({ status: "failed", message: FAIL_MSG });
    expect(await statusOf(purchaseId)).toBe("failed");
    expect(await journalKinds()).toEqual([["spend", 600], ["spend_reversal", 600]]);
    const tokenId = pp.orders[0].requestId;
    expect(tokenId).toBeTruthy();
    expect(await db.select().from(t.consumedTokens).where(eq(t.consumedTokens.tokenId, tokenId))).toHaveLength(1);
    expect(await db.select().from(t.receipts).where(eq(t.receipts.purchaseId, purchaseId))).toHaveLength(0);
  });

  it("price changed at re-lookup → refused CART_MISMATCH, no charge", async () => {
    await seed(base);
    const { d } = deps({ prices: { a: 650 } });
    const { purchaseId } = await proposePurchase(d, familyId, cartOf("a", 600));
    expect(await settlePurchase(d, purchaseId)).toMatchObject({ status: "refused", reason: "CART_MISMATCH" });
    expect(await statusOf(purchaseId)).toBe("refused");
    expect(pp.orders).toHaveLength(0);
    expect(await journalKinds()).toEqual([]);
  });

  it("item gone at re-lookup → refused UNAVAILABLE, no charge", async () => {
    await seed(base);
    const { d, ch } = deps({ prices: { a: null } });
    const { purchaseId } = await proposePurchase(d, familyId, cartOf("a", 600));
    expect(await settlePurchase(d, purchaseId)).toMatchObject({ status: "refused", reason: "UNAVAILABLE" });
    expect(ch.retrieve).toHaveBeenCalledWith("a", [DOMAIN]);
    expect(pp.orders).toHaveLength(0);
  });

  it("gate 1 refuse never calls the classifier", async () => {
    await seed(withBooks);
    const { d, cl } = deps();
    const { purchaseId, decision } = await proposePurchase(d, familyId, cartOf("a", 900)); // over $8 budget
    expect(decision.outcome).toBe("REFUSE");
    expect(cl.ask).not.toHaveBeenCalled();
    expect(await statusOf(purchaseId)).toBe("refused");
  });

  it("gate 2 at p=0.86 → needs_approval, no charge", async () => {
    await seed(withBooks);
    const { d, cl } = deps({ p: 0.86 });
    const { purchaseId, decision } = await proposePurchase(d, familyId, cartOf("a", 600));
    expect(cl.ask).toHaveBeenCalledTimes(1);
    expect(cl.ask.mock.calls[0]).toEqual([expect.stringContaining("printed book"), expect.objectContaining({ merchant: "Book Barn", titles: ["The Hobbit"] })]);
    expect(decision.outcome).toBe("NEEDS_APPROVAL");
    const [row] = await db.select().from(t.purchases).where(eq(t.purchases.id, purchaseId));
    expect(row.status).toBe("needs_approval");
    expect(row.decision).toMatchObject({
      gate2: [{ rule: "checkout.semantic_category", probability: 0.86, model: "fake-model", modelVersion: "fake-1", band: "NEEDS_APPROVAL" }],
    });
    expect((await settlePurchase(d, purchaseId)).status).toBe("needs_approval");
    expect(cl.ask).toHaveBeenCalledTimes(1); // settle reuses the stored band
    expect(pp.orders).toHaveLength(0);
  });

  it("classifier null → refused", async () => {
    await seed(withBooks);
    const { d } = deps({ p: null });
    const { purchaseId, decision } = await proposePurchase(d, familyId, cartOf("a", 600));
    expect(decision.outcome).toBe("REFUSE");
    expect(await statusOf(purchaseId)).toBe("refused");
    expect((await settlePurchase(d, purchaseId)).status).toBe("refused");
    expect(pp.orders).toHaveLength(0);
  });

  it("gate-2 escalation cleared by guardian approval then charged", async () => {
    await seed(withBooks);
    const { d } = deps({ p: 0.86 });
    const cart = cartOf("a", 600);
    const { purchaseId } = await proposePurchase(d, familyId, cart);
    await approve(purchaseId, cartHash(cart));
    expect(await settlePurchase(d, purchaseId)).toEqual({ status: "paid" });
    expect(pp.orders).toHaveLength(1);
    const [receipt] = await db.select().from(t.receipts).where(eq(t.receipts.purchaseId, purchaseId));
    expect(receipt.approvalId).toBe(`ap-${purchaseId}`);
  });

  it("gate-2 refuse not cleared by approval", async () => {
    await seed(withBooks);
    const { d } = deps({ p: 0.5 });
    const cart = cartOf("a", 600);
    const { purchaseId } = await proposePurchase(d, familyId, cart);
    await approve(purchaseId, cartHash(cart));
    expect((await settlePurchase(d, purchaseId)).status).toBe("refused");
    expect(pp.orders).toHaveLength(0);
    expect(await journalKinds()).toEqual([]);
  });

  it("webhook moves paying → paid", async () => {
    await seed(base);
    const { d } = deps();
    const { purchaseId } = await proposePurchase(d, familyId, cartOf("a", 600));
    pp.setMode("pending");
    expect(await settlePurchase(d, purchaseId)).toEqual({ status: "paying" });
    const [receipt] = await db.select().from(t.receipts).where(eq(t.receipts.purchaseId, purchaseId));
    await onCaptureCompleted(d, receipt.captureId);
    expect(await statusOf(purchaseId)).toBe("paid");
    await onCaptureCompleted(d, receipt.captureId); // idempotent
    await onCaptureCompleted(d, "CAP-unknown"); // unknown is a no-op
    expect(await statusOf(purchaseId)).toBe("paid");
  });

  it("webhook route returns 400 when verification fails", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "cid");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "csecret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH1");
    vi.stubEnv("PAYPAL_BASE_URL", "https://api.sandbox.paypal.test");
    const f = vi.fn(async (url: string | URL | Request) => {
      const body = String(url).endsWith("/v1/oauth2/token")
        ? { access_token: "AT", expires_in: 3600 } : { verification_status: "FAILURE" };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", f);
    const req = new Request("http://localhost/api/paypal/webhook", {
      method: "POST",
      body: JSON.stringify({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-x" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(f.mock.calls.some(([u]) => String(u).endsWith("/v1/notifications/verify-webhook-signature"))).toBe(true);
  });
});
