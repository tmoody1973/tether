import { timingSafeEqual } from "node:crypto";
import { identityFromEnv, type PaypalIdentity } from "@/adapters/paypal/identity";
import { readCookie } from "@/auth/guardian";
import { BROWSER_FAMILY_COOKIE, LOGIN_STATE_COOKIE, START_COOKIE, openBrowserFamily, openLoginState, sealStart, startCookieOptions } from "@/auth/start";
import { getDb } from "@/db/client";
import { isSharedLogin, ownedFamilies, ownsLiveFamily } from "@/flows/start";
import { goTo, loginReturnUrl, retireQuietly, signIn } from "../../login";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Log in with PayPal, step 2 (the return URL registered with PayPal). Checks the state against this browser's cookie
// BEFORE using the code. Then, for an ordinary PayPal account: no family yet ⇒ the teen form; one ⇒ signed in;
// several ⇒ "Which teen?". For the published shared sandbox login (review H1), per browser: the family this browser
// made, if it is still live and this PayPal owns it; otherwise the teen form. Never a chooser, never another browser's family.
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  if (params.has("error")) return goTo(req, "/g?login=cancelled"); // she cancelled, or PayPal refused
  const state = params.get("state");
  const code = params.get("code");
  const expected = openLoginState(readCookie(req, LOGIN_STATE_COOKIE), new Date());
  if (!expected || !state || !same(state, expected) || !code || code.length > 2048) return goTo(req, "/g?login=failed");

  let who: PaypalIdentity;
  try {
    const paypal = identityFromEnv(loginReturnUrl());
    who = await paypal.userInfo(await paypal.exchangeCode(code));
  } catch (err) {
    console.error("login: PayPal sign-in didn't complete", err instanceof Error ? err.message : "unknown error");
    return goTo(req, "/g?login=failed");
  }

  await retireQuietly();
  const db = await getDb();
  let next: string;
  if (await isSharedLogin(db, who)) {
    const mine = openBrowserFamily(readCookie(req, BROWSER_FAMILY_COOKIE), new Date());
    if (mine && (await ownsLiveFamily(db, who.sub, mine))) return signIn(goTo(req, "/g"), mine);
    next = "/g/start/teen";
  } else {
    const owned = await ownedFamilies(db, who.sub);
    if (owned.length === 1) return signIn(goTo(req, "/g"), owned[0].id);
    next = owned.length === 0 ? "/g/start/teen" : "/g/login/choose";
  }
  const res = goTo(req, next);
  res.cookies.set(START_COOKIE, sealStart(who, new Date()), startCookieOptions());
  return res;
}
