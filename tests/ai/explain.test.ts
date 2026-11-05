import { describe, it, expect } from "vitest";
import { explainRefusal } from "@/ai/explain";
import type { Llm } from "@/ai/llm";
import type { Decision } from "@/engine/types";

const ctx = { teenName: "Jo", guardianName: "Amara" };
const budget: Decision = {
  outcome: "REFUSE",
  semanticRules: [],
  reasons: [{
    constraint: "payment.budget", detail: "over budget",
    numbers: { remainingCents: 800, spentCents: 1200, maxCents: 2000, cartCents: 1500 },
  }],
};
const one = (constraint: string, numbers?: Record<string, number>): Decision => ({
  outcome: "REFUSE", semanticRules: [], reasons: [{ constraint, detail: "d", numbers }],
});
const say = (sentence: string): Llm => ({ json: (async () => ({ sentence })) as Llm["json"] });

describe("explainRefusal", () => {
  it("template used when llm is null", async () => {
    const r = await explainRefusal(null, budget, ctx);
    expect(r.source).toBe("template");
    expect(r.sentence).toBe("You've got $8.00 left this week and this is $15.00.");
  });
  it('template used when model sentence omits the remaining amount ("$8.00")', async () => {
    const r = await explainRefusal(say("That is a bit too much for this week."), budget, ctx);
    expect(r.source).toBe("template");
  });
  it('template used when sentence contains "approved"', async () => {
    const r = await explainRefusal(say("Approved? No. You have $8.00 left and this is $15.00."), budget, ctx);
    expect(r.source).toBe("template");
  });
  it("ai sentence used when valid", async () => {
    const s = "You've got $8.00 left this week and this is $15.00.";
    const r = await explainRefusal(say(s), budget, ctx);
    expect(r).toMatchObject({ source: "ai", sentence: s });
  });
  it("routes always two and from engine", async () => {
    const r = await explainRefusal(say("Sorry, $8.00 left."), budget, ctx);
    expect(r.routes).toEqual(["Ask Amara", "It fits next week"]);
    expect((await explainRefusal(null, one("mystery"), ctx)).routes).toEqual(["Ask Amara", "Try again later"]);
  });
  it("routes for allowed_payees", async () => {
    const r = await explainRefusal(null, one("payment.allowed_payees"), ctx);
    expect(r.routes).toEqual(["Ask Amara to add this shop", "Pick something from an open shop"]);
  });
  it("execution_date routes include Nudge", async () => {
    const r = await explainRefusal(null, one("payment.execution_date"), ctx);
    expect(r.routes[0]).toMatch(/^Nudge Amara/);
  });
  it("amount_range route formats max when present", async () => {
    const r = await explainRefusal(null, one("payment.amount_range", { maxCents: 2500 }), ctx);
    expect(r.routes[1]).toBe("Try something under $25.00");
  });
  it("rejects a model sentence with a dollar amount not in the reasons", async () => {
    const r = await explainRefusal(say("You've got $8.00 left and this is $99.00."), budget, ctx);
    expect(r.source).toBe("template");
  });
  it("llm throwing falls back to template", async () => {
    const llm: Llm = { json: (async () => { throw new Error("down"); }) as Llm["json"] };
    expect((await explainRefusal(llm, budget, ctx)).source).toBe("template");
  });
  it("rejects empty and over-long sentences", async () => {
    expect((await explainRefusal(say(""), one("payment.allowed_payees"), ctx)).source).toBe("template");
    expect((await explainRefusal(say("x".repeat(241)), one("payment.allowed_payees"), ctx)).source).toBe("template");
  });
  it("goalTitle passed to the model", async () => {
    let seen = "";
    const llm: Llm = { json: (async (a: { user: string }) => { seen = a.user; return { sentence: "nope" }; }) as Llm["json"] };
    await explainRefusal(llm, one("payment.allowed_payees"), { ...ctx, goalTitle: "Bike lights" });
    expect(seen).toContain("Bike lights");
    expect(seen).toContain("Jo");
  });
});
