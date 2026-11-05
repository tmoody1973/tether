import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decide } from "@/engine/decide";
import { mintToken, verifyToken } from "@/engine/token";
import type { Cart, Constraint, Decision, Grant, LedgerView } from "@/engine/types";

const NOW = new Date("2026-10-08T12:00:00Z");
const SECRET = "test-secret";
const week = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

const constraints = (): Constraint[] => [
  { type: "payment.amount_range", minCents: 100, maxCents: 2000 },
  { type: "payment.budget", maxCents: 2000, period: "WEEKLY" },
  { type: "payment.allowed_payees", merchantIds: ["m_corner_store", "m_transit"] },
  { type: "payment.execution_date", notBefore: NOW.toISOString(), notAfter: week(7) },
];

const grant: Grant = {
  id: "g1", familyId: "f1", version: 3, level: 1, weeklyCents: 2000,
  commitmentFloorPct: 0, matchPct: 0, constraints: constraints(),
  fundAllowlist: [], signedAt: NOW.toISOString(), expiresAt: week(7),
};

const cart = (cents: number, merchantId = "m_corner_store", sku = "a"): Cart => ({
  merchantId, totalCents: cents, items: [{ sku, title: "Thing", qty: 1, unitCents: cents }],
});

const ledger = (spent = 0): LedgerView => ({
  spentThisWeekCents: spent, merchantsUsed: new Set(["m_corner_store", "m_transit"]), savingsCents: 0,
});

const allow = (c: Cart, spent = 0) => decide(grant, c, ledger(spent), NOW);
const at = (s: number) => new Date(NOW.getTime() + s * 1000);
const never = () => false;

describe("single-use token", () => {
  it("two different purchases in one week both mint (D9 regression)", () => {
    const c1 = cart(600, "m_corner_store", "a");
    const c2 = cart(250, "m_transit", "b");
    const d1 = allow(c1);
    const d2 = allow(c2, 600); // ledger reflects first spend
    expect(d1.outcome).toBe("ALLOW");
    expect(d2.outcome).toBe("ALLOW");
    const t1 = mintToken(d1, grant, c1, NOW, SECRET);
    const t2 = mintToken(d2, grant, c2, NOW, SECRET);
    expect(t1.tokenId).not.toBe(t2.tokenId);
    expect(verifyToken(t1, c1, NOW, SECRET, never)).toEqual({ ok: true });
    expect(verifyToken(t2, c2, NOW, SECRET, never)).toEqual({ ok: true });
  });

  it("mint throws on NEEDS_APPROVAL and REFUSE, and on empty secret", () => {
    const c = cart(600);
    const base = { reasons: [], semanticRules: [] };
    for (const outcome of ["NEEDS_APPROVAL", "REFUSE"] as const) {
      const d: Decision = { ...base, outcome };
      expect(() => mintToken(d, grant, c, NOW, SECRET)).toThrow();
    }
    expect(() => mintToken(allow(c), grant, c, NOW, "")).toThrow();
  });

  it("binds grant, amount, merchant", () => {
    const c = cart(600);
    const t = mintToken(allow(c), grant, c, NOW, SECRET);
    expect(t).toMatchObject({ grantId: "g1", grantVersion: 3, amountCents: 600, merchantId: "m_corner_store" });
  });

  it("replayed token is CONSUMED", () => {
    const c = cart(600);
    const t = mintToken(allow(c), grant, c, NOW, SECRET);
    expect(verifyToken(t, c, NOW, SECRET, (id) => id === t.tokenId)).toEqual({ ok: false, reason: "CONSUMED" });
  });

  it("token expires after 120 s", () => {
    const c = cart(600);
    const t = mintToken(allow(c), grant, c, NOW, SECRET);
    expect(verifyToken(t, c, at(119), SECRET, never)).toEqual({ ok: true });
    expect(verifyToken(t, c, at(120), SECRET, never)).toEqual({ ok: true });
    expect(verifyToken(t, c, at(121), SECRET, never)).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("swapped cart is CART_MISMATCH", () => {
    const c = cart(600);
    const t = mintToken(allow(c), grant, c, NOW, SECRET);
    expect(verifyToken(t, cart(600, "m_corner_store", "other"), NOW, SECRET, never)).toEqual({
      ok: false, reason: "CART_MISMATCH",
    });
  });

  it("validly signed token whose amount differs from the cart total is AMOUNT_MISMATCH", () => {
    const c = cart(600);
    const t = mintToken(allow(c), grant, c, NOW, SECRET);
    const body = { ...t, amountCents: 599, signature: undefined as string | undefined };
    delete body.signature;
    const sorted = Object.fromEntries(Object.entries(body).sort(([a], [b]) => (a < b ? -1 : 1)));
    const signature = createHmac("sha256", SECRET).update(JSON.stringify(sorted)).digest("hex");
    expect(verifyToken({ ...body, signature } as typeof t, c, NOW, SECRET, never)).toEqual({ ok: false, reason: "AMOUNT_MISMATCH" });
  });

  it("tampered amount or wrong secret is BAD_SIGNATURE", () => {
    const c = cart(600);
    const t = mintToken(allow(c), grant, c, NOW, SECRET);
    expect(verifyToken({ ...t, amountCents: 1 }, c, NOW, SECRET, never)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verifyToken(t, c, NOW, "other", never)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verifyToken({ ...t, signature: "ab" }, c, NOW, SECRET, never)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("verify fails closed: empty secret throws, malformed signature is BAD_SIGNATURE", () => {
    const c = cart(600);
    const t = mintToken(allow(c), grant, c, NOW, SECRET);
    expect(() => verifyToken(t, c, NOW, "", never)).toThrow("token secret is required");
    const noSig = { ...t, signature: undefined } as unknown as typeof t;
    expect(verifyToken(noSig, c, NOW, SECRET, never)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verifyToken({ ...t, signature: t.signature + "0" }, c, NOW, SECRET, never)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verifyToken({ ...t, signature: t.signature.toUpperCase() }, c, NOW, SECRET, never)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("tampered expiresAt is BAD_SIGNATURE", () => {
    const c = cart(600);
    const t = mintToken(allow(c), grant, c, NOW, SECRET);
    expect(verifyToken({ ...t, expiresAt: week(1) }, c, NOW, SECRET, never)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });
});
