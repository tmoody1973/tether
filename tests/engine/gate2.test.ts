import { describe, it, expect } from "vitest";
import { bandOf, compose, BOOKS_ONLY } from "@/engine/gate2";

describe("bandOf", () => {
  it("maps the three bands", () => {
    expect(bandOf(0.995, BOOKS_ONLY)).toBe("ALLOW");
    expect(bandOf(0.86, BOOKS_ONLY)).toBe("NEEDS_APPROVAL");
    expect(bandOf(0.18, BOOKS_ONLY)).toBe("REFUSE");
  });
  it("hits the thresholds exactly", () => {
    expect(bandOf(0.98, BOOKS_ONLY)).toBe("ALLOW");
    expect(bandOf(0.7, BOOKS_ONLY)).toBe("NEEDS_APPROVAL");
  });
  it("fails closed on null and non-finite", () => {
    expect(bandOf(null, BOOKS_ONLY)).toBe("REFUSE");
    expect(bandOf(NaN, BOOKS_ONLY)).toBe("REFUSE");
    expect(bandOf(Infinity, BOOKS_ONLY)).toBe("REFUSE");
  });
});

describe("compose", () => {
  it("REFUSE from gate 1 stays REFUSE", () => {
    expect(compose("REFUSE", ["ALLOW"])).toBe("REFUSE");
  });
  it("gate 2 can tighten", () => {
    expect(compose("ALLOW", ["ALLOW", "NEEDS_APPROVAL"])).toBe("NEEDS_APPROVAL");
    expect(compose("ALLOW", ["NEEDS_APPROVAL", "REFUSE"])).toBe("REFUSE");
    expect(compose("NEEDS_APPROVAL", ["ALLOW"])).toBe("NEEDS_APPROVAL");
    expect(compose("ALLOW", [])).toBe("ALLOW");
  });
  it("sweep: gate 2 never loosens a gate 1 REFUSE", () => {
    for (let i = 0; i <= 100; i++) {
      expect(compose("REFUSE", [bandOf(i / 100, BOOKS_ONLY)])).toBe("REFUSE");
    }
  });
  it("sweep: gate 2 never loosens NEEDS_APPROVAL to ALLOW", () => {
    for (let i = 0; i <= 100; i++) {
      expect(compose("NEEDS_APPROVAL", [bandOf(i / 100, BOOKS_ONLY)])).not.toBe("ALLOW");
    }
  });
});
