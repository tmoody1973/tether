import { readCookie } from "@/auth/guardian";
import { START_COOKIE, STARTED_COOKIE, openStart, openStarted, sealStarted, startedCookieOptions } from "@/auth/start";
import { getDb } from "@/db/client";
import { parseTeenForm, startFamily } from "@/flows/start";
import { goTo, retireQuietly, sameOrigin, signIn } from "../../../login/login";

// "Create our family": needs the starting cookie from Log in with PayPal; every field is checked again here.
export async function POST(req: Request): Promise<Response> {
  const now = new Date();
  if (!sameOrigin(req)) return goTo(req, "/g?login=failed");
  const who = openStart(readCookie(req, START_COOKIE), now);
  if (!who) return goTo(req, "/g?login=expired");
  const form = await req.formData().catch(() => null);
  const parsed = form ? parseTeenForm(form) : { ok: false as const, error: "name" as const };
  if (!parsed.ok) return goTo(req, `/g/start/teen?e=${parsed.error}`);
  if (openStarted(readCookie(req, STARTED_COOKIE), now)) return goTo(req, "/g/start/teen?e=browser"); // one per browser per hour

  await retireQuietly();
  const fam = await startFamily(await getDb(), who, parsed.teen);
  if (!fam) return goTo(req, "/g/start/teen?e=full"); // today's new families are used up
  const res = signIn(goTo(req, "/g?started=1", { dropStart: true }), fam.id);
  res.cookies.set(STARTED_COOKIE, sealStarted(now), startedCookieOptions());
  return res;
}
