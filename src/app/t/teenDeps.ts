import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { after } from "next/server";
import type { Db } from "@/db/client";
import { anthropicClassifier, type Classifier } from "@/ai/classifier";
import { e2eAgentModel } from "@/ai/e2eAgentModel";
import { anthropicLlm, type Llm } from "@/ai/llm";
import type { Deps } from "@/flows/purchase";
import { paymentDeps } from "@/app/g/flowDeps";
import { pushFromEnv } from "@/adapters/onesignal/push";
import { marketFromEnv } from "@/adapters/alpaca/data";
import { pushRequest, type Notify } from "@/flows/notify";

/** The e2e suite's fakes: only with TETHER_E2E=1 (playwright.config sets it), never in production. */
const e2e = () => process.env.TETHER_E2E === "1" && process.env.NODE_ENV !== "production";
const apiKey = () => (e2e() ? undefined : process.env.ANTHROPIC_API_KEY);

const FAIL_CLOSED: Classifier = { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) };

/** Deps for Zoe's propose/settle flows: PayPal and Channel3 as the guardian side builds them, plus gate 2. */
export function teenDeps(db: Db): Deps {
  const key = apiKey();
  // No model ⇒ gate 2 has no answer ⇒ a "books only" item refuses (fail closed), exactly as the engine specifies.
  return { ...paymentDeps(db), classifier: key ? anthropicClassifier(anthropicLlm(key)) : FAIL_CLOSED, notify: pushNotify(db) };
}

/**
 * Amara's push for a new request, run by after() once Zoe's response has gone: a slow or failing OneSignal never
 * slows or fails her ask. No REST key or no APP_BASE_URL ⇒ undefined: push is off and nothing is scheduled.
 */
function pushNotify(db: Db): Notify | undefined {
  const cfg = pushFromEnv();
  const baseUrl = process.env.APP_BASE_URL;
  if (!cfg || !baseUrl) return undefined;
  const deps = paymentDeps(db);
  // An investment's share count needs the latest close: Alpaca not configured just means today's push.
  const quote = async (symbol: string) => marketFromEnv().quote(symbol);
  return (familyId, approvalId) => after(() => pushRequest(deps, familyId, approvalId, { cfg, baseUrl, quote }).then(() => undefined));
}

/** The refusal sentence writer; null ⇒ explain.ts uses its plain template. */
export function explainLlm(): Llm | null {
  const key = apiKey();
  return key ? anthropicLlm(key) : null;
}

/** The shopping agent's model, or null when none is configured here. */
export async function agentModel(request: string): Promise<LanguageModel | null> {
  if (e2e()) return e2eAgentModel(request);
  const key = apiKey();
  return key ? createAnthropic({ apiKey: key })("claude-haiku-5-5") : null;
}
