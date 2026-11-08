import { readCookie } from "@/auth/guardian";
import {
  BROWSER_FAMILY_COOKIE, START_COOKIE, STARTED_COOKIE, browserFamilyCookieOptions, openBrowserFamilies, openStart, openStarted,
  sealBrowserFamilies, sealStarted, startedCookieOptions,
} from "@/auth/start";
import { safeErrorText } from "@/adapters/paypal/http";
import { getDb } from "@/db/client";
import type { Family } from "@/db/repo";
import { consumeStartNonce, parseTeensForm, startFamilies, startProblem } from "@/flows/start";
import { goTo, retireQuietly, sameOrigin, signIn } from "../../../login/login";

// "Create our family": needs the starting cookie from Log in with PayPal; every field is checked again here. One form
// may name up to 5 teens (decision 028): one family per teen, all from this one starting cookie, all or none.
export async function POST(req: Request): Promise<Response> {
  const now = new Date();
  if (!sameOrigin(req)) return goTo(req, "/g?login=failed");
  const ticket = openStart(readCookie(req, START_COOKIE), now);
  if (!ticket) return goTo(req, "/g?login=expired");
  const form = await req.formData().catch(() => null);
  const parsed = form ? parseTeensForm(form) : { ok: false as const, error: "name" as const };
  if (!parsed.ok) return goTo(req, `/g/start/teen?e=${parsed.error}`);
  // One per browser per hour, except "Add another teen" (decision 028): a parent adding two teens back to back is the
  // point. The site-wide daily cap in startFamilies still applies to every family.
  if (!ticket.add && openStarted(readCookie(req, STARTED_COOKIE), now)) return goTo(req, "/g/start/teen?e=browser");

  let made: Family[] | null;
  try {
    const db = await getDb();
    const problem = await startProblem(db, ticket.who, parsed.teens, openBrowserFamilies(readCookie(req, BROWSER_FAMILY_COOKIE), now));
    if (problem) return goTo(req, `/g/start/teen?e=${problem}`); // before the ticket is spent: she can fix it and resend
    // M1: this starting cookie is used once, whoever presents it and however often: one batch of families at most.
    if (!(await consumeStartNonce(db, ticket.nonce))) return goTo(req, "/g?login=used", { dropStart: true });
    await retireQuietly();
    made = await startFamilies(db, ticket.who, parsed.teens);
  } catch (err) {
    console.error("start: creating the family failed", safeErrorText(err)); // never the query: it holds her PayPal email
    return goTo(req, "/g?login=failed");
  }
  // Today's new families can't take them all; none was made and this cookie is spent. Adding a teen says so in its own
  // words (she's still signed in to the teen she was on).
  if (!made) return goTo(req, `/g/start/teen?e=${ticket.add ? "addfull" : parsed.teens.length > 1 ? "fullmany" : "full"}`, { dropStart: true });
  const ids = made.map((f) => f.id);
  const landing = `/g?started=${ticket.add ? "added" : "1"}${ids.length > 1 ? `&teens=${ids.length}` : ""}`;
  const res = signIn(goTo(req, landing, { dropStart: true }), ids[0]); // the first teen's Home and checklist
  res.cookies.set(STARTED_COOKIE, sealStarted(now), startedCookieOptions());
  const mine = openBrowserFamilies(readCookie(req, BROWSER_FAMILY_COOKIE), now).filter((id) => !ids.includes(id));
  res.cookies.set(BROWSER_FAMILY_COOKIE, sealBrowserFamilies([...mine, ...ids], now), browserFamilyCookieOptions());
  return res;
}
