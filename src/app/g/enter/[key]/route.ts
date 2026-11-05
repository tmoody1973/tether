import { NextResponse } from "next/server";
import { GUARDIAN_COOKIE, guardianCookieOptions, signGuardianCookie } from "@/auth/guardian";
import { getDb } from "@/db/client";
import { getFamilyByGuardianToken } from "@/db/repo";

// Amara's private link (R32). A valid key sets her session cookie; the redirect takes the key out of the address bar.
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await ctx.params;
  const res = NextResponse.redirect(new URL("/g", req.url), 303);
  const family = key.length <= 64 ? await getFamilyByGuardianToken(await getDb(), key) : null;
  if (family) res.cookies.set(GUARDIAN_COOKIE, signGuardianCookie(family.id, new Date()), guardianCookieOptions());
  return res;
}
