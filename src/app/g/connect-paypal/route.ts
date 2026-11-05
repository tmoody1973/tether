import { NextResponse } from "next/server";
import { requireGuardian } from "@/auth/guardian";
import { paypalFromEnv } from "@/adapters/paypal/http";
import { createSetupToken } from "@/adapters/paypal/vault";
import { SETUP_COOKIE, appBaseUrl, setupCookieOptions } from "./setup";

// Step 1 of saving Amara's PayPal (sandbox): ask PayPal for a setup token, send her to approve it.
export async function GET(req: Request): Promise<Response> {
  try {
    requireGuardian(req);
  } catch {
    return NextResponse.redirect(new URL("/g", req.url), 303);
  }
  try {
    const base = appBaseUrl();
    const { id, approveUrl } = await createSetupToken(paypalFromEnv(), `${base}/g/connect-paypal/return`, `${base}/g?paypal=cancelled`);
    const res = NextResponse.redirect(approveUrl, 303);
    res.cookies.set(SETUP_COOKIE, id, setupCookieOptions());
    return res;
  } catch (err) {
    console.error("connect-paypal: setup token failed", err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL("/g?paypal=failed", req.url), 303);
  }
}
