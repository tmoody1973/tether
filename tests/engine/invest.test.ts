import { describe, expect, it } from "vitest";
import { decideInvestment, isLeveragedProduct, LEVERAGED_TEXT, QUEUED_LABEL, readsAsFund } from "@/engine/invest";
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

describe("isLeveragedProduct (real product names)", () => {
  it.each([
    ["T-Rex 2X Long Apple Daily Target ETF", true],
    ["ProShares UltraPro QQQ", true],
    ["Direxion Daily S&P 500 Bear 3X Shares", true],
    ["ProShares UltraShort QQQ", true],
    ["ProShares Ultra S&P500", true],
    ["GraniteShares 1.5x Long Tesla Daily ETF", true],
    ["Tradr 2x Long Innovation 100 Monthly ETF", true],
    ["MicroSectors FANG+ Index -3X Inverse Leveraged ETNs", true],
    ["Vanguard Total Stock Market ETF", false],
    ["Apple Inc. Common Stock", false],
    ["iShares 0-3 Month Treasury Bond ETF", false],
    ["JPMorgan Ultra-Short Income ETF", false], // ultra-short bond funds are low-risk: allowed
    ["BlackRock Ultra Short-Term Bond ETF", false],
    ["Vanguard Short-Term Treasury ETF", false],
    ["Bearing Point Holdings", false], // word-bounded: "bear" inside a word is not a bear fund
    ["Xerox Holdings Corporation Common Stock", false],
    // A company's own stock is never a leveraged product, whatever words its name has (Alpaca's names for stocks).
    ["Build-A-Bear Workshop, Inc. Common Stock", false],
    ["Ultra Clean Holdings, Inc. Common Stock", false],
    ["10x Genomics, Inc. Class A Common Stock", false],
    ["Bear Example Holdings Ltd Ordinary Shares", false],
    ["Ultra Example Group American Depositary Shares", false],
    ["Bear Example Corp ADR", false],
  ])("%s → %s", (name, want) => expect(isLeveragedProduct(name)).toBe(want));

  it("a plain inverse fund with no keyword in its name passes (known gap: names are all we check)", () => {
    expect(isLeveragedProduct("ProShares Short S&P500")).toBe(false);
  });
});

describe("decideInvestment refuses leveraged and inverse products", () => {
  it("refuses with invest.leveraged and the calm message, even when the symbol is on the list", () => {
    const d = decideInvestment(grant({ fundAllowlist: ["TQQQ"] }), { symbol: "TQQQ", amountCents: 500, name: "ProShares UltraPro QQQ" }, 5000);
    expect(d.outcome).toBe("REFUSE");
    expect(d.reasons).toContainEqual({ constraint: "invest.leveraged", detail: LEVERAGED_TEXT });
  });
  it("the message", () => expect(LEVERAGED_TEXT).toBe(
    "Tether doesn't offer leveraged or inverse products: they're built to move two or three times as fast as the market, often for one day at a time."));
  it("a plain name, or none, is not refused for it", () => {
    expect(decideInvestment(grant(), { symbol: "VTI", amountCents: 500, name: "Vanguard Total Stock Market ETF" }, 5000).outcome).toBe("NEEDS_APPROVAL");
    expect(decideInvestment(grant(), { symbol: "VTI", amountCents: 500 }, 5000).outcome).toBe("NEEDS_APPROVAL");
  });
});

describe("readsAsFund (so a fund is never paid for as a company)", () => {
  it.each([
    ["Apple Inc. Common Stock", false],
    ["Microsoft Corporation Common Stock", false],
    ["Alibaba Group Holding Limited American Depositary Shares", false], // plain "Shares" is a company's stock
    ["Coinbase Global, Inc. Class A Common Stock", false],
    ["ProShares UltraPro QQQ", true],
    ["JPMorgan Ultra-Short Income ETF", true],
    ["SPDR S&P 500 ETF Trust", true],
    ["Vanguard Total Stock Market ETF", true],
    ["iShares 0-3 Month Treasury Bond ETF", true],
    ["Invesco QQQ Trust, Series 1", true],
    ["Fidelity 500 Index Fund", true],
    ["iPath Bloomberg Commodity Index Total Return ETN", true],
    ["Technology Select Sector SPDR Fund", true],
  ])("%s → %s", (name, want) => expect(readsAsFund(name)).toBe(want));

  it("a company with Trust in its name reads as a fund: no company card, never a wasted credit (accepted trade-off)", () => {
    expect(readsAsFund("Vornado Realty Trust Common Shares of Beneficial Interest")).toBe(true);
  });
});
