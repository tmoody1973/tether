import { describe, expect, it } from "vitest";
import { decideInvestment, QUEUED_LABEL } from "@/engine/invest";
import { INVESTING_FROM } from "@/engine/ladder";
import type { Grant } from "@/engine/types";

const grant = (over: Partial<Grant> = {}): Grant => ({
  id: "g", familyId: "f", version: 1, level: 3, weeklyCents: 800, commitmentFloorPct: 10, matchPct: 50,
  constraints: [], fundAllowlist: ["VTI"], signedAt: "2026-11-02T00:00:00Z", expiresAt: "2026-12-09T00:00:00Z", ...over,
});

describe("decideInvestment", () => {
  it("investing opens at Level 2", () => expect(INVESTING_FROM).toBe(2));
  it("L1 investing refused, and the refusal names Level 2", () => {
    const d = decideInvestment(grant({ level: 1 }), { symbol: "VTI", amountCents: 500 }, 5000);
    expect(d.outcome).toBe("REFUSE");
    expect(d.reasons).toContainEqual({ constraint: "invest.level", detail: "Investing opens at Level 2" });
  });
  it("L2 may invest: same rules as L3", () => {
    expect(decideInvestment(grant({ level: 2 }), { symbol: "VTI", amountCents: 500 }, 5000).outcome).toBe("NEEDS_APPROVAL");
    expect(decideInvestment(grant({ level: 2 }), { symbol: "TSLA", amountCents: 500 }, 5000).outcome).toBe("REFUSE");
  });
  it("L3 unchanged", () => {
    expect(decideInvestment(grant({ level: 3 }), { symbol: "VTI", amountCents: 500 }, 5000).outcome).toBe("NEEDS_APPROVAL");
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
