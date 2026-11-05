import { createAnthropic } from "@ai-sdk/anthropic";
import { createChannel3 } from "@/adapters/channel3/client";
import { outcomeLabel, runAgent } from "@/ai/agent";
import type { Constraint, Grant } from "@/engine/types";

const now = new Date();
const grant: Grant = {
  id: "g", familyId: "f", version: 1, level: 2, weeklyCents: 5000, commitmentFloorPct: 0, matchPct: 0,
  constraints: [
    { type: "payment.amount_range", minCents: 100, maxCents: 5000 },
    { type: "payment.budget", maxCents: 5000, period: "WEEKLY" },
    { type: "payment.allowed_payees", merchantIds: ["m_bestbuy", "m_target"] },
    { type: "payment.execution_date", notBefore: now.toISOString(), notAfter: new Date(+now + 7 * 864e5).toISOString() },
  ] as Constraint[],
  fundAllowlist: [], signedAt: now.toISOString(), expiresAt: new Date(+now + 7 * 864e5).toISOString(),
};

async function main() {
const r = await runAgent(
  { model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })("claude-haiku-5-5"), channel3: createChannel3() },
  {
    request: "noise cancelling headphones under $50",
    allowedDomains: ["bestbuy.com", "target.com"],
    merchantIdByDomain: { "bestbuy.com": "m_bestbuy", "target.com": "m_target" },
    grant, now,
    ledger: { spentThisWeekCents: 0, merchantsUsed: new Set(["m_bestbuy", "m_target"]), savingsCents: 0 },
  },
);
console.log("toolCalls:", r.toolCalls);
for (const p of r.proposals) {
  console.log(`- ${p.cart.items.map((i) => i.title).join(" + ")} | ${p.cart.totalCents}c | ${p.cart.merchantId} | "${p.reason}" | ${p.decision.outcome} (${outcomeLabel(p.decision)})`);
}
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
