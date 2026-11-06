// e2e ONLY (TETHER_E2E=1, never production): a scripted stand-in for the shopping agent's model, so Playwright can
// run the real runAgent loop (tool call → fake Channel3 search → engine) without calling Anthropic.
// Step 1 searches her shops with her words; step 2 proposes the three products tests/e2e/fake-paypal.ts returns.
import type { LanguageModel } from "ai";

export const E2E_AGENT_PICKS = ["sku-500", "sku-800", "sku-1500"] as const;

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

export async function e2eAgentModel(request: string): Promise<LanguageModel> {
  const { MockLanguageModelV4 } = await import("ai/test"); // loaded only on this path
  let step = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => (step++ === 0
      ? {
        content: [{ type: "tool-call" as const, toolCallId: "e2e-1", toolName: "search_allowed_shops", input: JSON.stringify({ query: request }) }],
        finishReason: { unified: "tool-calls" as const, raw: undefined }, usage, warnings: [],
      }
      : {
        content: [{ type: "text" as const, text: JSON.stringify({ proposals: E2E_AGENT_PICKS.map((id) => ({ productIds: [id], reason: "Matches what you asked for" })) }) }],
        finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [],
      }),
  });
}
