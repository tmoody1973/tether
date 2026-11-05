import { createAnthropic } from "@ai-sdk/anthropic";
import { askAboutMonth, readOnlyPaypalTools } from "@/ai/monthAssistant";
import { GuardianAuthError, requireGuardian } from "@/auth/guardian";
import { getDb } from "@/db/client";

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
  const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) {
    return Response.json({ error: `question must be 1-${MAX_QUESTION} characters` }, { status: 400 });
  }
  try {
    const { ANTHROPIC_API_KEY: apiKey, PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: clientSecret } = process.env;
    if (!apiKey || !clientId || !clientSecret) throw new Error("assistant not configured");
    const result = await askAboutMonth({
      model: createAnthropic({ apiKey })("claude-haiku-5-5"),
      paypalTools: readOnlyPaypalTools({ clientId, clientSecret, sandbox: true }),
      db: getDb(),
    }, familyId, question);
    return Response.json(result);
  } catch (err) {
    console.error("ask: assistant failed", err);
    return Response.json({ answer: "I can't see that right now." }, { status: 502 });
  }
}
