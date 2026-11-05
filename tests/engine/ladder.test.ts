import { describe, expect, it } from "vitest";
import { decide } from "@/engine/decide";
import { LEVELS, commitmentKept, grantForLevel, reviewMonth, streak, validateCommitment } from "@/engine/ladder";
import type { WeekRecord } from "@/engine/ladder";
import type { Cart } from "@/engine/types";

const NOW = new Date("2026-10-08T12:00:00Z");
const wk = (kept: boolean, i = 0): WeekRecord => ({
  weekKey: `w${i}`, allowanceCents: 2000, spentCents: kept ? 1500 : 1900, commitmentCents: 400,
});
const weeks = (...k: boolean[]) => k.map(wk);

const base = { id: "g1", familyId: "f1", version: 2, commitmentFloorPct: 10, matchPct: 50, fundAllowlist: ["fund_a"] };
const byClass = { general: ["m_corner", "m_transit"], books: ["m_book", "m_corner"], apparel: ["m_a"], sneakers: ["m_s"] };

describe("commitmentKept / streak", () => {
  it("kept iff allowance - spent >= commitment", () => {
    expect(commitmentKept(wk(true))).toBe(true);
    expect(commitmentKept(wk(false))).toBe(false);
    expect(commitmentKept({ ...wk(true), spentCents: 1600 })).toBe(true);
  });
  it("counts consecutive kept weeks ending at the last", () => {
    expect(streak(weeks(true, true, false, true, true))).toBe(2);
    expect(streak(weeks(true, false))).toBe(0);
    expect(streak([])).toBe(0);
  });
});

describe("reviewMonth", () => {
  it("four kept weeks promote L1", () => {
    const r = reviewMonth(weeks(true, true, true, true), 1);
    expect(r.action).toBe("PROMOTE");
    expect(r.streak).toBe(4);
  });
  it("three kept + one missed HOLD with streak 0", () => {
    const r = reviewMonth(weeks(true, true, true, false), 1);
    expect(r).toMatchObject({ action: "HOLD", streak: 0 });
    expect(r.reason).toContain("3 of 4");
  });
  it("missed then four kept PROMOTE", () => {
    expect(reviewMonth(weeks(false, true, true, true, true), 2).action).toBe("PROMOTE");
  });
  it("L3 four kept HOLD (top level)", () => {
    const r = reviewMonth(weeks(true, true, true, true), 3);
    expect(r.action).toBe("HOLD");
    expect(r.reason).toBe("Already at the top level.");
  });
});

describe("validateCommitment", () => {
  it("rejects below the 10% floor with minCents 200 on $20", () => {
    expect(validateCommitment(199, 2000, 10)).toEqual({ ok: false, minCents: 200 });
    expect(validateCommitment(200, 2000, 10)).toEqual({ ok: true });
  });
  it("rejects non-integer / negative / NaN", () => {
    expect(validateCommitment(NaN, 2000, 10).ok).toBe(false);
    expect(validateCommitment(-5, 2000, 0).ok).toBe(false);
    expect(validateCommitment(250.5, 2000, 10).ok).toBe(false);
  });
});

describe("grantForLevel", () => {
  it("L1 has approval.over_amount 1000 and first_time_merchant", () => {
    const g = grantForLevel(1, base, byClass, ["m_book"], NOW);
    expect(g.constraints).toContainEqual({ type: "approval.over_amount", overCents: 1000 });
    expect(g.constraints).toContainEqual({ type: "approval.first_time_merchant" });
    expect(g.constraints.some((c) => c.type === "checkout.semantic_category")).toBe(false);
    expect(g).toMatchObject({ ...base, level: 1, weeklyCents: 2000, signedAt: NOW.toISOString() });
  });
  it("L3 has no over_amount", () => {
    const g = grantForLevel(3, base, byClass, ["m_book"], NOW);
    expect(g.constraints.some((c) => c.type === "approval.over_amount")).toBe(false);
    expect(g.constraints.some((c) => c.type === "approval.first_time_merchant")).toBe(false);
    expect(g.weeklyCents).toBe(LEVELS[3].weeklyCents);
  });
  it("L2 includes bookshop and BOOKS_ONLY; payees de-duplicated", () => {
    const g = grantForLevel(2, base, byClass, ["m_book"], NOW);
    expect(g.constraints).toContainEqual({ type: "checkout.semantic_category", merchantIds: ["m_book"], rule: "BOOKS_ONLY" });
    expect(g.constraints.find((c) => c.type === "payment.allowed_payees")).toEqual(
      { type: "payment.allowed_payees", merchantIds: ["m_corner", "m_transit", "m_book"] });
  });
  it("skips semantic_category when no bookshops", () => {
    expect(grantForLevel(2, base, byClass, [], NOW).constraints.some((c) => c.type === "checkout.semantic_category")).toBe(false);
  });
  it("expiresAt = now + 7 days; constraint order is fixed", () => {
    const g = grantForLevel(1, base, byClass, [], NOW);
    expect(g.expiresAt).toBe("2026-10-15T12:00:00.000Z");
    expect(g.constraints.map((c) => c.type)).toEqual([
      "payment.amount_range", "payment.budget", "payment.allowed_payees", "payment.execution_date",
      "approval.over_amount", "approval.first_time_merchant"]);
    expect(g.constraints[3]).toEqual({ type: "payment.execution_date", notBefore: NOW.toISOString(), notAfter: g.expiresAt });
  });
});

describe("grantForLevel + decide", () => {
  const g = grantForLevel(1, base, byClass, [], NOW);
  const cart = (cents: number, merchantId: string): Cart => ({
    merchantId, totalCents: cents, items: [{ sku: "a", title: "T", qty: 1, unitCents: cents }],
  });
  const ledger = { spentThisWeekCents: 0, merchantsUsed: new Set(["m_transit"]), savingsCents: 0 };
  it("$11 at general merchant needs approval", () => {
    expect(decide(g, cart(1100, "m_corner"), ledger, NOW).outcome).toBe("NEEDS_APPROVAL");
  });
  it("$9 at a used merchant is allowed", () => {
    expect(decide(g, cart(900, "m_transit"), ledger, NOW).outcome).toBe("ALLOW");
  });
});
