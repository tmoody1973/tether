import { describe, expect, it } from "vitest";
import { decideInvestment, QUEUED_LABEL } from "@/engine/invest";
import type { Grant } from "@/engine/types";

const grant = (over: Partial<Grant> = {}): Grant => ({
  id: "g", familyId: "f", version: 1, level: 3, weeklyCents: 800, commitmentFloorPct: 10, matchPct: 50,
  constraints: [], fundAllowlist: ["VTI"], signedAt: "2026-11-02T00:00:00Z", expiresAt: "2026-12-09T00:00:00Z", ...over,
});

describe("decideInvestment", () => {
  it("L2 investing refused", () => {
    const d = decideInvestment(grant({ level: 2 }), { symbol: "VTI", amountCents: 500 }, 5000);
    expect(d.outcome).toBe("REFUSE");
    expect(d.reasons.map((r) => r.constraint)).toContain("invest.level");
  });
  it("symbol off allowlist refused", () => {
    expect(decideInvestment(grant(), { symbol: "TSLA", amountCents: 500 }, 5000).outcome).toBe("REFUSE");
  });
  it("amount above savings refused", () => {
    expect(decideInvestment(grant(), { symbol: "VTI", amountCents: 5001 }, 5000).outcome).toBe("REFUSE");
  });
  it("under $1 refused", () => {
    expect(decideInvestment(grant(), { symbol: "VTI", amountCents: 99 }, 5000).outcome).toBe("REFUSE");
  });
  it("valid proposal NEEDS_APPROVAL", () => {
    expect(decideInvestment(grant(), { symbol: "VTI", amountCents: 500 }, 5000).outcome).toBe("NEEDS_APPROVAL");
  });
  it("queued label", () => expect(QUEUED_LABEL).toBe("Queued for market open"));
});
