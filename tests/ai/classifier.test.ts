import { describe, it, expect } from "vitest";
import { anthropicClassifier } from "@/ai/classifier";
import type { Llm } from "@/ai/llm";

const fake = (impl: () => Promise<unknown>): Llm => ({ json: (async () => impl()) as Llm["json"] });
const ask = (llm: Llm, ms?: number) => anthropicClassifier(llm, ms).ask("is it a book?", { text: "x" });

describe("anthropicClassifier", () => {
  it("returns a valid probability", async () => {
    const r = await ask(fake(async () => ({ probability: 0.97, confidence: 0.9 })));
    expect(r.probability).toBe(0.97);
    expect(r.model).toBeTruthy();
    expect(r.modelVersion).toBeTruthy();
  });
  it("accepts the 0 and 1 boundaries", async () => {
    expect((await ask(fake(async () => ({ probability: 0, confidence: 1 })))).probability).toBe(0);
    expect((await ask(fake(async () => ({ probability: 1, confidence: 1 })))).probability).toBe(1);
  });
  it("null on timeout, resolving near timeoutMs", async () => {
    const t = Date.now();
    const r = await ask(fake(() => new Promise(() => {})), 20);
    expect(r.probability).toBeNull();
    expect(Date.now() - t).toBeLessThan(500);
  });
  it("null on out-of-range values", async () => {
    expect((await ask(fake(async () => ({ probability: 1.4, confidence: 1 })))).probability).toBeNull();
    expect((await ask(fake(async () => ({ probability: -0.1, confidence: 1 })))).probability).toBeNull();
  });
  it("null on thrown error", async () => {
    const r = await ask(fake(async () => { throw new Error("boom"); }));
    expect(r.probability).toBeNull();
  });
  it("null on schema mismatch and NaN", async () => {
    expect((await ask(fake(async () => ({ confidence: 1 })))).probability).toBeNull();
    expect((await ask(fake(async () => ({ probability: "0.9" })))).probability).toBeNull();
    expect((await ask(fake(async () => ({ probability: NaN })))).probability).toBeNull();
    expect((await ask(fake(async () => null))).probability).toBeNull();
  });
});
