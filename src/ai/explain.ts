import type { Llm } from "./llm";
import type { Cents, Decision, Reason } from "@/engine/types";

export interface ExplainCtx { teenName: string; guardianName: string; goalTitle?: string }
export interface Explanation { sentence: string; routes: [string, string]; source: "ai" | "template" }

const usd = (c: Cents) => `$${(c / 100).toFixed(2)}`;
const MAX_LEN = 240;
// \bAI\b, not a bare substring: "remaining" and "again" contain "ai".
const BANNED = [/approved/i, /you can buy/i, /go ahead/i, /financial literacy/i, /\bAI\b/i];
const SCHEMA = { type: "object", properties: { sentence: { type: "string" } }, required: ["sentence"] };

const SYSTEM = `You explain to a teenager why a purchase was refused, in one or two plain sentences.
Voice: kitchen-table language. Use numbers, not adjectives. No moralising. A refusal is a rule, not a punishment.
Never say "financial literacy", "AI-powered", "monitor" or "parental controls". Never say the purchase is approved or allowed.
Restate the dollar amounts from the reasons exactly as given and invent no other amounts.
Reply as JSON: {"sentence": "..."}.`;

// First constraint present in the decision wins, in this order.
const PRIORITY = [
  "payment.budget", "payment.allowed_payees", "payment.amount_range",
  "payment.execution_date", "checkout.semantic_category",
];

function primary(d: Decision): Reason | undefined {
  for (const key of PRIORITY) {
    const hit = d.reasons.find((r) => r.constraint === key);
    if (hit) return hit;
  }
  return d.reasons[0];
}

function routesFor(r: Reason | undefined, g: string): [string, string] {
  switch (r?.constraint) {
    case "payment.budget": return [`Ask ${g}`, "It fits next week"];
    case "payment.allowed_payees": return [`Ask ${g} to add this shop`, "Pick something from an open shop"];
    case "payment.amount_range": {
      const max = r.numbers?.maxCents;
      return [`Ask ${g}`, max === undefined ? "Try something smaller" : `Try something under ${usd(max)}`];
    }
    case "payment.execution_date": return [`Nudge ${g} to renew your rules`, "Check back when your week starts"];
    case "checkout.semantic_category": return [`Ask ${g}`, "Pick something from an open shop"];
    default: return [`Ask ${g}`, "Try again later"];
  }
}

function templateFor(r: Reason | undefined): string {
  switch (r?.constraint) {
    case "payment.budget": {
      const n = r.numbers;
      return n?.remainingCents !== undefined && n.cartCents !== undefined
        ? `You've got ${usd(n.remainingCents)} left this week and this is ${usd(n.cartCents)}.`
        : "This is more than you've got left this week.";
    }
    case "payment.allowed_payees": return "That shop isn't on your list yet.";
    case "payment.amount_range": return "That's more than one purchase can be right now.";
    case "payment.execution_date": return "Your week's finished — your rules need renewing.";
    case "checkout.semantic_category": return "That one doesn't look like it fits your rules for this shop.";
    default: return "We can't check this one right now, so it can't go through.";
  }
}

function valid(sentence: unknown, d: Decision, p: Reason | undefined): sentence is string {
  if (typeof sentence !== "string" || !sentence.trim() || sentence.length > MAX_LEN) return false;
  if (BANNED.some((re) => re.test(sentence))) return false;
  const allowed = new Set(d.reasons.flatMap((r) => Object.values(r.numbers ?? {}).map(usd)));
  const mentioned = sentence.match(/\$\d[\d,]*(?:\.\d+)?/g) ?? [];
  if (mentioned.some((m) => !allowed.has(m))) return false;
  const remaining = p?.constraint === "payment.budget" ? p.numbers?.remainingCents : undefined;
  return remaining === undefined || sentence.includes(usd(remaining));
}

export async function explainRefusal(llm: Llm | null, d: Decision, ctx: ExplainCtx): Promise<Explanation> {
  const p = primary(d);
  const routes = routesFor(p, ctx.guardianName);
  const template: Explanation = { sentence: templateFor(p), routes, source: "template" };
  if (!llm) return template;
  const user = JSON.stringify({
    teenName: ctx.teenName,
    ...(ctx.goalTitle ? { goalTitle: ctx.goalTitle } : {}),
    reasons: d.reasons.map((r) => ({
      constraint: r.constraint,
      detail: r.detail,
      numbers: Object.fromEntries(Object.entries(r.numbers ?? {}).map(([k, v]) => [k, usd(v)])),
    })),
  });
  try {
    const out = await llm.json<{ sentence: string }>({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 120 });
    const sentence = out?.sentence?.trim();
    return valid(sentence, d, p) ? { sentence, routes, source: "ai" } : template;
  } catch {
    return template; // model down: the rule still gets explained
  }
}
