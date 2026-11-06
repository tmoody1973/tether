import { createAnthropic } from "@ai-sdk/anthropic";
import { askAboutMonth, PaypalUnavailableError, readOnlyPaypalTools } from "@/ai/monthAssistant";
import { GuardianAuthError, requireGuardian } from "@/auth/guardian";
import { getDb } from "@/db/client";
import { DAILY_CAP_MESSAGE, takeDaily } from "@/flows/usage";

const MAX_QUESTION = 500;

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
  const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) {
    return Response.json({ error: `question must be 1-${MAX_QUESTION} characters` }, { status: 400 });
  }
  try {
    const db = await getDb();
    if (!(await takeDaily(db, familyId, "month_ask"))) return Response.json({ answer: DAILY_CAP_MESSAGE });
    const { ANTHROPIC_API_KEY: apiKey, PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: clientSecret } = process.env;
    if (!apiKey || !clientId || !clientSecret) throw new Error("assistant not configured");
    const result = await askAboutMonth({
      model: createAnthropic({ apiKey })("claude-haiku-5-5"),
      paypalTools: readOnlyPaypalTools({ clientId, clientSecret, sandbox: true }),
      db,
    }, familyId, question);
    return Response.json(result);
  } catch (err) {
    console.error("ask: assistant failed", err instanceof PaypalUnavailableError ? err.message : err);
    return Response.json({ answer: "I can't see that right now." }, { status: 502 });
  }
}
