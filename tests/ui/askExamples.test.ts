import { describe, expect, it } from "vitest";
import { askExamples } from "@/app/g/AskBox";

describe("askExamples", () => {
  it("names the family's own teen, never a hard-coded Zoe", () => {
    const qs = askExamples("Maya");
    expect(qs).toContain("What did Maya buy this month?");
    expect(qs).toContain("How are Maya's investments doing?");
    expect(qs).toContain("Is Maya on track for the next level?");
    expect(qs.join(" ")).not.toMatch(/Zoe|\bher\b/);
  });

  it("keeps the demo family's questions unchanged", () => {
    expect(askExamples("Zoe")[0]).toBe("What did Zoe buy this month?");
  });
});
