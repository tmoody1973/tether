import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { safeErrorText } from "@/adapters/paypal/http";
import { identityFromEnv } from "@/adapters/paypal/identity";
import { LOGIN_STATE_COOKIE, loginStateCookieOptions, sealLoginState } from "@/auth/start";
import { loginReturnUrl } from "../login";

// Log in with PayPal, step 1: a fresh random state, bound to this browser by a signed cookie, then off to PayPal.
// `?add=1` ("Add another teen", decision 028) is sealed into that cookie here; the return route reads it only from there.
export async function GET(req: Request): Promise<Response> {
  const intent = new URL(req.url).searchParams.get("add") === "1" ? "add" : null; // outside the try: reading the request is never "PayPal failed"
  try {
    const state = randomBytes(24).toString("base64url");
    const res = NextResponse.redirect(identityFromEnv(loginReturnUrl()).authorizeUrl(state), 303);
    res.cookies.set(LOGIN_STATE_COOKIE, sealLoginState(state, new Date(), intent), loginStateCookieOptions());
    return res;
  } catch (err) {
    console.error("login: can't start Log in with PayPal", safeErrorText(err));
    return NextResponse.redirect(new URL("/g?login=failed", req.url), 303);
  }
}
