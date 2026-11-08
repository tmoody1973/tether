import { readCookie } from "@/auth/guardian";
import {
  BROWSER_FAMILY_COOKIE, START_COOKIE, STARTED_COOKIE, browserFamilyCookieOptions, openBrowserFamilies, openStart, openStarted,
  sealBrowserFamilies, sealStarted, startedCookieOptions,
} from "@/auth/start";
import { safeErrorText } from "@/adapters/paypal/http";
import { getDb } from "@/db/client";
import type { Family } from "@/db/repo";
import { consumeStartNonce, parseTeenForm, startFamily } from "@/flows/start";
import { goTo, retireQuietly, sameOrigin, signIn } from "../../../login/login";

// "Create our family": needs the starting cookie from Log in with PayPal; every field is checked again here.
export async function POST(req: Request): Promise<Response> {
  const now = new Date();
  if (!sameOrigin(req)) return goTo(req, "/g?login=failed");
  const ticket = openStart(readCookie(req, START_COOKIE), now);
  if (!ticket) return goTo(req, "/g?login=expired");
  const form = await req.formData().catch(() => null);
  const parsed = form ? parseTeenForm(form) : { ok: false as const, error: "name" as const };
  if (!parsed.ok) return goTo(req, `/g/start/teen?e=${parsed.error}`);
  // One per browser per hour, except "Add another teen" (decision 028): a parent adding two teens back to back is the
  // point. The site-wide daily cap in startFamily still applies to every family.
  if (!ticket.add && openStarted(readCookie(req, STARTED_COOKIE), now)) return goTo(req, "/g/start/teen?e=browser");

  let fam: Family | null;
  try {
    const db = await getDb();
    // M1: this starting cookie makes one family at most, whoever presents it and however often.
    if (!(await consumeStartNonce(db, ticket.nonce))) return goTo(req, "/g?login=used", { dropStart: true });
    await retireQuietly();
    fam = await startFamily(db, ticket.who, parsed.teen);
  } catch (err) {
    console.error("start: creating the family failed", safeErrorText(err)); // never the query: it holds her PayPal email
    return goTo(req, "/g?login=failed");
  }
  // Today's new families are used up; this cookie is spent. Adding a teen says so in its own words (she's still signed in).
  if (!fam) return goTo(req, `/g/start/teen?e=${ticket.add ? "addfull" : "full"}`, { dropStart: true });
  const res = signIn(goTo(req, ticket.add ? "/g?started=added" : "/g?started=1", { dropStart: true }), fam.id);
  res.cookies.set(STARTED_COOKIE, sealStarted(now), startedCookieOptions());
  const mine = openBrowserFamilies(readCookie(req, BROWSER_FAMILY_COOKIE), now).filter((id) => id !== fam.id);
  res.cookies.set(BROWSER_FAMILY_COOKIE, sealBrowserFamilies([...mine, fam.id], now), browserFamilyCookieOptions());
  return res;
}
