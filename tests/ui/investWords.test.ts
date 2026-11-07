import { describe, expect, it } from "vitest";
import { closeWords, companyLine, pennyLine, requestShareWords, shareCount, shareLine, shareWords } from "@/ui/investWords";

describe("shareCount", () => {
  it("4 decimals under one share, 2 at or over one", () => {
    expect(shareCount(500 / 36186)).toBe("0.0138");
    expect(shareCount(50000 / 36186)).toBe("1.38");
    expect(shareCount(1)).toBe("1.00");
    expect(shareCount(0.99996)).toBe("1.00"); // rounds up to a whole share: said as one
    expect(shareCount(0.00001234)).toBe("0.000012"); // never "0.0000"
  });
});

describe("shareWords", () => {
  it("dollars to shares, said as a share count", () => {
    expect(shareWords(500, 36186, true, "VTI")).toBe("about 0.0138 of a share");
    expect(shareWords(50000, 36186, true, "VTI")).toBe("about 1.38 shares");
  });
  it("an asset that can't be split says so, with the price of one", () => {
    expect(shareWords(500, 36186, false, "VTI")).toBe("VTI can only be bought in whole shares, $361.86 each.");
  });
});

describe("shareLine (the propose form, live)", () => {
  it("names the fund and the price it used", () => {
    expect(shareLine(500, 36186, "VTI")).toBe("= about 0.0138 of one VTI share at $361.86.");
    expect(shareLine(50000, 36186, "VTI")).toBe("= about 1.38 VTI shares at $361.86.");
  });
});

describe("closeWords", () => {
  it("the market day of the close, in New York", () => {
    expect(closeWords(new Date("2026-11-06T05:00:00Z"))).toBe("At Friday's close (6 Nov). You don't need a whole one: you buy in dollars.");
  });
});

describe("requestShareWords (under the request's title)", () => {
  it("about how much of a share, at what price; whole-shares-only says so", () => {
    expect(requestShareWords(500, { cents: 36186, fractionable: true }, "VTI")).toBe("About 0.0138 of a share at $361.86");
    expect(requestShareWords(50000, { cents: 36186, fractionable: true }, "VTI")).toBe("About 1.38 shares at $361.86");
    expect(requestShareWords(500, { cents: 36186, fractionable: false }, "VTI")).toBe("VTI can only be bought in whole shares, $361.86 each.");
  });
});

describe("stocks: the penny line and the company line", () => {
  it("a latest close under $1.00 gets the plain penny line; $1.00 and up get nothing", () => {
    expect(pennyLine(99)).toBe("Under $1 a share: prices like this can swing a lot.");
    expect(pennyLine(1)).toBe("Under $1 a share: prices like this can swing a lot.");
    expect(pennyLine(100)).toBeNull();
    expect(pennyLine(36186)).toBeNull();
    expect(pennyLine(null)).toBeNull(); // no price, no line
  });

  it("company facts in one line, skipping what's missing", () => {
    const apple = { name: "Apple", sector: "Technology", industry: "Consumer Electronics", location: "Cupertino, CA", employees: null };
    expect(companyLine(apple)).toBe("Apple: Technology · Consumer Electronics · Cupertino, CA");
    expect(companyLine({ ...apple, industry: null, location: null })).toBe("Apple: Technology");
    expect(companyLine({ ...apple, sector: null, industry: null, location: null })).toBe("Apple");
  });
});
