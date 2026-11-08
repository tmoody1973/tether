import { createAnthropic } from "@ai-sdk/anthropic";
import { askAboutMonth, PaypalUnavailableError, readOnlyPaypalTools } from "@/ai/monthAssistant";
import { paypalFromEnv } from "@/adapters/paypal/http";
import { GuardianAuthError, requireGuardian } from "@/auth/guardian";
import { isLiveFamily } from "@/auth/guardianSession";
import { now } from "@/clock/clock";
import { getDb } from "@/db/client";
import { DAILY_CAP_MESSAGE, takeDaily } from "@/flows/usage";
import { pageHoldings } from "@/app/g/flowDeps";

const MAX_QUESTION = 500;
/** Decision 028 (re-review): asked from a page drawn for a teen she has since switched away from in another tab. */
export const STALE_ASK = "You switched teens in another tab; nothing was asked.";

// POST handlers are request-time; no `export const dynamic` (build error with cacheComponents).
export async function POST(req: Request): Promise<Response> {
  let familyId: string;
  try {
    familyId = requireGuardian(req);
  } catch (err) {
    if (err instanceof GuardianAuthError) return Response.json({ error: "sign-in required" }, { status: 401 });
    console.error("ask: guardian check failed", err);
    return Response.json({ answer: "I can't see that right now." }, { status: 502 });
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "content-type must be application/json" }, { status: 415 });
  }
  const body = (await req.json().catch(() => null)) as { question?: unknown; familyId?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) {
    return Response.json({ error: `question must be 1-${MAX_QUESTION} characters` }, { status: 400 });
  }
  // Review M2: a retired family's signed cookie outlives it by up to 7 days; it gets nothing paid for.
  if (!(await isLiveFamily(familyId).catch(() => false))) return Response.json({ error: "sign-in required" }, { status: 401 });
  // The page names the teen it was drawn for: another teen's page (she switched in another tab) asks nothing, so no model
  // call and no quota, and no answer about one teen lands on the other's page.
  if (body?.familyId !== familyId) return Response.json({ answer: STALE_ASK }, { status: 409 });
  try {
    const db = await getDb();
    const { ANTHROPIC_API_KEY: apiKey, PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: clientSecret } = process.env;
    if (!apiKey || !clientId || !clientSecret) throw new Error("assistant not configured");
    if (!(await takeDaily(db, familyId, "month_ask"))) return Response.json({ answer: DAILY_CAP_MESSAGE }); // only now: validated, configured, about to pay for the model
    const result = await askAboutMonth({
      model: createAnthropic({ apiKey })("claude-sonnet-5-5"), // decision 018: Sonnet reasons across four read-only sources; Haiku stays elsewhere
      paypalTools: readOnlyPaypalTools({ clientId, clientSecret, sandbox: true }),
      paypal: paypalFromEnv(), // paypal_check: the Activity page's reconciliation, read-only
      db,
      now: await now(db, familyId), // the family's demo clock: the model must ask about the months Tether shows
      holdings: (id) => pageHoldings(db, id), // zoe_investments: the same holdings as her Investing page, best effort
    }, familyId, question);
    return Response.json(result);
  } catch (err) {
    console.error("ask: assistant failed", err instanceof PaypalUnavailableError ? err.message : err);
    return Response.json({ answer: "I can't see that right now." }, { status: 502 });
  }
}
