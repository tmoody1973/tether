import { timingSafeEqual } from "node:crypto";
import { identityFromEnv, type PaypalIdentity } from "@/adapters/paypal/identity";
import { readCookie } from "@/auth/guardian";
import { LOGIN_STATE_COOKIE, START_COOKIE, openLoginState, sealStart, startCookieOptions } from "@/auth/start";
import { getDb } from "@/db/client";
import { ownedFamilies } from "@/flows/start";
import { goTo, loginReturnUrl, retireQuietly, signIn } from "../../login";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Log in with PayPal, step 2 (the return URL registered with PayPal). Checks the state against this browser's cookie
// BEFORE using the code, then: no family yet ⇒ the teen form; one ⇒ signed in; several ⇒ "Which teen?".
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
  const owned = await ownedFamilies(await getDb(), who.sub);
  if (owned.length === 1) return signIn(goTo(req, "/g"), owned[0].id);
  const res = goTo(req, owned.length === 0 ? "/g/start/teen" : "/g/login/choose");
  res.cookies.set(START_COOKIE, sealStart(who, new Date()), startCookieOptions());
  return res;
}
