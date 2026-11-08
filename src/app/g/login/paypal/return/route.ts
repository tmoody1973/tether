import { timingSafeEqual } from "node:crypto";
import { safeErrorText } from "@/adapters/paypal/http";
import { identityFromEnv, type PaypalIdentity } from "@/adapters/paypal/identity";
import { readCookie } from "@/auth/guardian";
import {
  BROWSER_FAMILY_COOKIE, LOGIN_STATE_COOKIE, PAYPAL_WHO_COOKIE, START_COOKIE, openBrowserFamilies, openLoginState, paypalWhoCookieOptions,
  sealPaypalWho, sealStart, startCookieOptions,
} from "@/auth/start";
import { getDb } from "@/db/client";
import { isSharedLogin, ownedFamilies, switchableFamilies } from "@/flows/start";
import { goTo, loginReturnUrl, retireQuietly, signIn } from "../../login";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b); // compare byte lengths: a multibyte state can't throw
  return x.length === y.length && timingSafeEqual(x, y);
}

// Log in with PayPal, step 2 (the return URL registered with PayPal). Checks the state against this browser's cookie
// BEFORE using the code. Then, for an ordinary PayPal account: no family yet ⇒ the teen form; one ⇒ signed in;
// several ⇒ "Which teen?". For the published shared sandbox login (review H1), per browser: the newest family this
// browser made, if it is still live and this PayPal owns it; otherwise the teen form. Never a chooser, never another
// browser's family. "Add another teen" (decision 028, carried in the sealed state only) ⇒ the teen form, whatever she owns.
// Every success also remembers who PayPal said she is (her PayPal id only), so Settings can switch between her teens.
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  if (params.has("error")) return goTo(req, "/g?login=cancelled"); // she cancelled, or PayPal refused
  const state = params.get("state");
  const code = params.get("code");
  const expected = openLoginState(readCookie(req, LOGIN_STATE_COOKIE), new Date());
  if (!expected || !state || !same(state, expected.state) || !code || code.length > 2048) return goTo(req, "/g?login=failed");
  const add = expected.intent === "add";

  let who: PaypalIdentity;
  try {
    const paypal = identityFromEnv(loginReturnUrl());
    who = await paypal.userInfo(await paypal.exchangeCode(code));
  } catch (err) {
    console.error("login: PayPal sign-in didn't complete", safeErrorText(err));
    return goTo(req, "/g?login=failed");
  }

  await retireQuietly();
  let next: string;
  let shared: boolean;
  try {
    const db = await getDb();
    shared = await isSharedLogin(db, who);
    if (shared) {
      const mine = await switchableFamilies(db, { sub: who.sub, shared }, openBrowserFamilies(readCookie(req, BROWSER_FAMILY_COOKIE), new Date()));
      if (!add && mine.length) return remember(signIn(goTo(req, "/g"), mine[mine.length - 1].id), who, shared);
      next = "/g/start/teen";
    } else {
      const owned = add ? [] : await ownedFamilies(db, who.sub);
      if (owned.length === 1) return remember(signIn(goTo(req, "/g"), owned[0].id), who, shared);
      next = owned.length === 0 ? "/g/start/teen" : "/g/login/choose";
    }
  } catch (err) {
    console.error("login: looking up this PayPal's families failed", safeErrorText(err));
    return goTo(req, "/g?login=failed");
  }
  const res = remember(goTo(req, next), who, shared);
  res.cookies.set(START_COOKIE, sealStart(who, new Date(), undefined, add), startCookieOptions());
  return res;
}

/** Remembers who PayPal said she is: her PayPal id and whether it was the shared login. Never a token, never her email. */
function remember<R extends ReturnType<typeof goTo>>(res: R, who: PaypalIdentity, shared: boolean): R {
  res.cookies.set(PAYPAL_WHO_COOKIE, sealPaypalWho({ sub: who.sub, shared }, new Date()), paypalWhoCookieOptions());
  return res;
}
