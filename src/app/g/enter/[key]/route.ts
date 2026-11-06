import { NextResponse } from "next/server";
import { GUARDIAN_COOKIE, guardianCookieOptions, signGuardianCookie } from "@/auth/guardian";
import { getDb } from "@/db/client";
import { getFamilyByGuardianToken } from "@/db/repo";
import { freshenDemoIfStale } from "@/flows/reset";
import { paymentDeps } from "../../flowDeps";

// Amara's private link (R32). A valid key sets her session cookie; the redirect takes the key out of the address bar.
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await ctx.params;
  const res = NextResponse.redirect(new URL("/g", req.url), 303);
  if (key.length > 64) return res;
  const db = await getDb();
  const demoKey = process.env.DEMO_GUARDIAN_KEY;
  if (demoKey && key === demoKey) {
    // R44: the shared demo family freshens itself when judges come back after a while. Never blocks the way in.
    await freshenDemoIfStale(paymentDeps(db), { guardianKey: demoKey, teenToken: process.env.DEMO_TEEN_TOKEN }).catch((err: unknown) => {
      console.error("freshenDemoIfStale failed", err instanceof Error ? err.message : err);
    });
  }
  const family = await getFamilyByGuardianToken(db, key);
  if (family) res.cookies.set(GUARDIAN_COOKIE, signGuardianCookie(family.id, new Date()), guardianCookieOptions());
  return res;
}
