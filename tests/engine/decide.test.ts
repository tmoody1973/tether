import { describe, expect, it } from "vitest";
import { decide } from "@/engine/decide";
import { cartHash } from "@/engine/hash";
import type { ApprovalGrant, Cart, Constraint, Grant, LedgerView } from "@/engine/types";

const NOW = new Date("2026-10-08T12:00:00Z");
const week = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

const baseConstraints = (): Constraint[] => [
  { type: "payment.amount_range", minCents: 100, maxCents: 2000 },
  { type: "payment.budget", maxCents: 2000, period: "WEEKLY" },
  { type: "payment.allowed_payees", merchantIds: ["m_corner_store", "m_transit", "m_bookshop"] },
  { type: "payment.execution_date", notBefore: NOW.toISOString(), notAfter: week(7) },
];

const grant = (extra: Constraint[] = [], over: Partial<Grant> = {}): Grant => ({
  id: "g1", familyId: "f1", version: 1, level: 1, weeklyCents: 2000,
  commitmentFloorPct: 0, matchPct: 0, constraints: [...baseConstraints(), ...extra],
  fundAllowlist: [], signedAt: NOW.toISOString(), expiresAt: week(7), ...over,
});

const cart = (cents: number, merchantId = "m_corner_store"): Cart => ({
  merchantId, totalCents: cents,
  items: [{ sku: "a", title: "Thing", qty: 1, unitCents: cents }],
});

const ledger = (spent = 0, used: string[] = ["m_corner_store", "m_transit", "m_bookshop"]): LedgerView => ({
  spentThisWeekCents: spent, merchantsUsed: new Set(used), savingsCents: 0,
});

const reasons = (d: ReturnType<typeof decide>) => d.reasons.map((r) => r.constraint);

describe("ported prototype scenarios", () => {
  it("in-bounds spend allows", () => {
    const d = decide(grant(), cart(1200), ledger(), NOW);
    expect(d.outcome).toBe("ALLOW");
    expect(d.reasons).toEqual([]);
  });

  it("budget exceeded refuses with numbers", () => {
    const d = decide(grant(), cart(1500), ledger(1200), NOW);
    expect(d.outcome).toBe("REFUSE");
    const r = d.reasons.find((x) => x.constraint === "payment.budget");
    expect(r?.numbers?.remainingCents).toBe(800);
    expect(r?.numbers).toMatchObject({ spentCents: 1200, maxCents: 2000, cartCents: 1500 });
  });

  it("unknown payee refuses", () => {
    const d = decide(grant(), cart(200, "m_sketchy"), ledger(), NOW);
    expect(d.outcome).toBe("REFUSE");
    expect(reasons(d)).toContain("payment.allowed_payees");
  });

  it("unknown constraint type refuses", () => {
    const d = decide(grant([{ type: "payment.something_we_do_not_implement", x: 1 }]), cart(100), ledger(), NOW);
    expect(d.outcome).toBe("REFUSE");
    expect(d.reasons.at(-1)?.detail).toContain("UNKNOWN CONSTRAINT TYPE");
  });

  it("a grant is not consumed by one spend (replay guard lives in Task 3)", () => {
    const g = grant();
    expect(decide(g, cart(300, "m_transit"), ledger(), NOW).outcome).toBe("ALLOW");
    expect(decide(g, cart(300, "m_transit"), ledger(300), NOW).outcome).toBe("ALLOW");
  });

  it("expired grant refuses", () => {
    const d = decide(grant(), cart(300), ledger(), new Date(NOW.getTime() + 30 * 86_400_000));
    expect(d.outcome).toBe("REFUSE");
    expect(reasons(d)).toContain("payment.execution_date");
  });

  it("not-yet-valid grant refuses", () => {
    const d = decide(grant(), cart(300), ledger(), new Date(NOW.getTime() - 1000));
    expect(reasons(d)).toContain("payment.execution_date");
  });

  it("promoted grant permits a spend the old tier refused", () => {
    const l1 = grant();
    const l3 = grant([], {
      level: 3,
      constraints: [
        { type: "payment.amount_range", minCents: 100, maxCents: 5000 },
        { type: "payment.budget", maxCents: 5000, period: "WEEKLY" },
        { type: "payment.allowed_payees", merchantIds: ["m_sneakers"] },
        { type: "payment.execution_date", notBefore: NOW.toISOString(), notAfter: week(7) },
      ],
    });
    expect(decide(l1, cart(4500, "m_sneakers"), ledger(), NOW).outcome).toBe("REFUSE");
    expect(decide(l3, cart(4500, "m_sneakers"), ledger(0, ["m_sneakers"]), NOW).outcome).toBe("ALLOW");
  });

  it("amount outside range refuses", () => {
    expect(reasons(decide(grant(), cart(50), ledger(), NOW))).toContain("payment.amount_range");
  });
});

describe("approvals", () => {
  const overAmount: Constraint = { type: "approval.over_amount", overCents: 1000 };
  const firstTime: Constraint = { type: "approval.first_time_merchant" };

  it("over approval threshold needs approval", () => {
    const d = decide(grant([overAmount]), cart(1100), ledger(), NOW);
    expect(d.outcome).toBe("NEEDS_APPROVAL");
    expect(reasons(d)).toEqual(["approval.over_amount"]);
  });

  it("at the threshold does not need approval", () => {
    expect(decide(grant([overAmount]), cart(1000), ledger(), NOW).outcome).toBe("ALLOW");
  });

  it("first-time merchant needs approval", () => {
    const d = decide(grant([firstTime]), cart(500), ledger(0, []), NOW);
    expect(d.outcome).toBe("NEEDS_APPROVAL");
    expect(decide(grant([firstTime]), cart(500), ledger(), NOW).outcome).toBe("ALLOW");
  });

  it("refusal beats approval", () => {
    const d = decide(grant([overAmount]), cart(1500), ledger(1200), NOW);
    expect(d.outcome).toBe("REFUSE");
    expect(reasons(d)).toEqual(expect.arrayContaining(["payment.budget", "approval.over_amount"]));
  });

  const g = grant([overAmount]);
  const c = cart(1100);
  const good: ApprovalGrant = { cartHash: cartHash(c), expiresAt: week(1) };

  it("matching unexpired approval allows", () => {
    expect(decide(g, c, ledger(), NOW, good).outcome).toBe("ALLOW");
  });

  it("explicit cartHash argument is used when given", () => {
    expect(decide(g, c, ledger(), NOW, { cartHash: "abc", expiresAt: week(1) }, "abc").outcome).toBe("ALLOW");
  });

  it("approval for different cart hash", () => {
    expect(decide(g, cart(1200), ledger(), NOW, good).outcome).toBe("NEEDS_APPROVAL");
  });

  it("expired approval", () => {
    const old = { ...good, expiresAt: new Date(NOW.getTime() - 1000).toISOString() };
    expect(decide(g, c, ledger(), NOW, old).outcome).toBe("NEEDS_APPROVAL");
  });

  it("approval never clears a refusal", () => {
    const c2 = cart(1500);
    const d = decide(g, c2, ledger(1200), NOW, { cartHash: cartHash(c2), expiresAt: week(1) });
    expect(d.outcome).toBe("REFUSE");
  });
});

describe("semanticRules", () => {
  const sem: Constraint = { type: "checkout.semantic_category", merchantIds: ["m_bookshop"], rule: "BOOKS_ONLY" };

  it("bookshop cart lists BOOKS_ONLY semantic rule", () => {
    const d = decide(grant([sem]), cart(800, "m_bookshop"), ledger(), NOW);
    expect(d.outcome).toBe("ALLOW");
    expect(d.semanticRules).toEqual(["checkout.semantic_category"]);
  });

  it("other merchants have no semantic rules", () => {
    expect(decide(grant([sem]), cart(800), ledger(), NOW).semanticRules).toEqual([]);
  });

  it("listed once even with two matching constraints", () => {
    const d = decide(grant([sem, sem]), cart(800, "m_bookshop"), ledger(), NOW);
    expect(d.semanticRules).toEqual(["checkout.semantic_category"]);
  });
});

describe("cartHash", () => {
  it("cartHash ignores item order", () => {
    const a: Cart = { merchantId: "m", totalCents: 300, items: [
      { sku: "a", title: "A", qty: 1, unitCents: 100 }, { sku: "b", title: "B", qty: 1, unitCents: 200 }] };
    const b: Cart = { ...a, items: [...a.items].reverse() };
    expect(cartHash(a)).toBe(cartHash(b));
    expect(cartHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cartHash changes when a unit price changes", () => {
    const a = cart(100);
    const b: Cart = { ...a, items: [{ ...a.items[0], unitCents: 101 }] };
    expect(cartHash(a)).not.toBe(cartHash(b));
  });
});

describe("fail closed on unknown and malformed constraints", () => {
  const goodApproval = (c: Cart): ApprovalGrant => ({ cartHash: cartHash(c), expiresAt: week(1) });
  const refused = (extra: Constraint[], c = cart(500), ap?: ApprovalGrant) => {
    const d = decide({ ...grant(), constraints: [...baseConstraints(), ...extra] }, c, ledger(), NOW, ap);
    expect(d.outcome).toBe("REFUSE");
    return d;
  };

  it("unknown approval.* type refuses, even with a valid approval", () => {
    const typo: Constraint = { type: "approval.over_ammount", overCents: 1 };
    const d = refused([typo]);
    expect(d.reasons.at(-1)?.constraint).toBe("unknown_constraint");
    expect(d.reasons.at(-1)?.detail).toContain("approval.over_ammount");
    refused([typo], cart(500), goodApproval(cart(500)));
  });

  it("malformed known approval constraint refuses and cannot be approved away", () => {
    for (const bad of [{ type: "approval.over_amount" }, { type: "approval.over_amount", overCents: NaN }]) {
      expect(refused([bad]).reasons.at(-1)?.constraint).toBe("malformed_constraint");
      refused([bad], cart(500), goodApproval(cart(500)));
    }
  });

  it("budget missing maxCents refuses", () => {
    expect(refused([{ type: "payment.budget", period: "WEEKLY" }]).reasons.at(-1)?.constraint).toBe("malformed_constraint");
  });

  it("budget with period MONTHLY refuses", () => {
    refused([{ type: "payment.budget", maxCents: 9999, period: "MONTHLY" }]);
  });

  it("NaN cart total refuses", () => {
    const d = refused([], { ...cart(500), totalCents: NaN });
    expect(reasons(d)).toContain("malformed_cart");
  });

  it("unparseable notAfter refuses", () => {
    refused([{ type: "payment.execution_date", notBefore: NOW.toISOString(), notAfter: "not a date" }]);
  });

  it("non-array merchantIds on allowed_payees refuses", () => {
    refused([{ type: "payment.allowed_payees", merchantIds: "m_corner_store" }]);
  });

  it("malformed semantic_category refuses", () => {
    const d = refused([{ type: "checkout.semantic_category", merchantIds: "m_bookshop", rule: "BOOKS_ONLY" }]);
    expect(d.reasons.at(-1)?.constraint).toBe("malformed_constraint");
  });

  it("constraint with no type refuses instead of throwing", () => {
    const d = refused([{} as unknown as Constraint]);
    expect(d.reasons.at(-1)?.constraint).toBe("unknown_constraint");
  });
});
