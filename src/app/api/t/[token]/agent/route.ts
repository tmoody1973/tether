import { createAnthropic } from "@ai-sdk/anthropic";
import { createChannel3 } from "@/adapters/channel3/client";
import { outcomeLabel, runAgent } from "@/ai/agent";
import { now } from "@/clock/clock";
import { getDb } from "@/db/client";
import { getActiveGrant, getFamilyByTeenToken, getMerchant } from "@/db/repo";
import { ledgerView } from "@/ledger/ledger";

const MAX_REQUEST = 200;

// POST handlers are request-time; no `export const dynamic` (build error with cacheComponents).
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { request?: unknown } | null;
  const request = typeof body?.request === "string" ? body.request.trim() : "";
  if (!request || request.length > MAX_REQUEST) {
    return Response.json({ error: `request must be 1-${MAX_REQUEST} characters` }, { status: 400 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "agent not configured" }, { status: 500 });

  const { token } = await ctx.params;
  const db = getDb();
  const family = await getFamilyByTeenToken(db, token);
  if (!family) return Response.json({ error: "not found" }, { status: 404 });
  const row = await getActiveGrant(db, family.id);
  if (!row) return Response.json({ error: "no active grant" }, { status: 404 });

  const grant = row.body;
  const payees = grant.constraints.find((c) => c.type === "payment.allowed_payees") as
    | { merchantIds: string[] } | undefined;
  const merchants = (await Promise.all((payees?.merchantIds ?? []).map((id) => getMerchant(db, id))))
    .filter((m): m is NonNullable<typeof m> => !!m && !!m.channel3WebsiteId);
  const merchantIdByDomain = Object.fromEntries(merchants.map((m) => [m.channel3WebsiteId as string, m.id]));

  const at = await now(db, family.id);
  const { proposals } = await runAgent(
    { model: createAnthropic({ apiKey })("claude-haiku-5-5"), channel3: createChannel3() },
    { request, allowedDomains: Object.keys(merchantIdByDomain), merchantIdByDomain, grant,
      ledger: await ledgerView(db, family.id, at), now: at },
  );
  return Response.json({
    proposals: proposals.map((p) => ({
      title: p.cart.items.map((i) => i.title).join(" + "),
      priceCents: p.cart.totalCents,
      reason: p.reason,
      outcome: p.decision.outcome,
      label: outcomeLabel(p.decision),
      cartHash: p.cartHash,
    })),
  });
}
