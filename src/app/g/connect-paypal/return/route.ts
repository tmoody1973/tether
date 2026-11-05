import { NextResponse } from "next/server";
import { readCookie, requireGuardian } from "@/auth/guardian";
import { paypalFromEnv } from "@/adapters/paypal/http";
import { createPaymentToken } from "@/adapters/paypal/vault";
import { getDb } from "@/db/client";
import { saveVault } from "@/db/repo";
import { SETUP_COOKIE, SETUP_COOKIE_PATH } from "../setup";

// Step 2: PayPal sends Amara back with ?approval_token_id=…; exchange it for a payment token and keep it.
export async function GET(req: Request): Promise<Response> {
  let familyId: string;
  try {
    familyId = requireGuardian(req);
  } catch {
    return NextResponse.redirect(new URL("/g", req.url), 303);
  }
  const done = (outcome: "connected" | "failed") => {
    const res = NextResponse.redirect(new URL(`/g?paypal=${outcome}`, req.url), 303);
    res.cookies.delete({ name: SETUP_COOKIE, path: SETUP_COOKIE_PATH });
    return res;
  };
  const params = new URL(req.url).searchParams;
  const setupId = params.get("approval_token_id") ?? params.get("approval_session_id");
  // Only the setup token this browser started: stops someone sending Amara a link that saves *their* PayPal.
  if (!setupId || setupId !== readCookie(req, SETUP_COOKIE)) return done("failed");
  try {
    const { paymentTokenId } = await createPaymentToken(paypalFromEnv(), setupId);
    await saveVault(await getDb(), familyId, paymentTokenId);
  } catch (err) {
    console.error("connect-paypal: saving the wallet failed", err instanceof Error ? err.message : err);
    return done("failed");
  }
  return done("connected");
}
