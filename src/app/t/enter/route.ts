import { NextResponse, connection } from "next/server";
import { getDb } from "@/db/client";
import { getFamilyByGuardianToken } from "@/db/repo";
import { freshenDemoIfStale } from "@/flows/reset";
import { paymentDeps } from "@/app/g/flowDeps";

/**
 * The landing's "Open Zoe's view" (R44): freshens a stale demo family, then sends her to her week. Only the demo
 * family; without demo keys this is just the landing page. Zoe's own pages stay read-only.
 */
export async function GET(req: Request): Promise<Response> {
  await connection(); // request time only: never prerendered at build
  const keys = { guardianKey: process.env.DEMO_GUARDIAN_KEY, teenToken: process.env.DEMO_TEEN_TOKEN };
  if (!keys.guardianKey || !keys.teenToken) return NextResponse.redirect(new URL("/", req.url), 303);
  const db = await getDb();
  await freshenDemoIfStale(paymentDeps(db), keys).catch((err: unknown) => {
    console.error("freshenDemoIfStale failed", err instanceof Error ? err.message : err); // her week still opens
  });
  // Her current link: the demo token, unless a judge pressed "Reset Zoe's link" since the last reset.
  const fam = await getFamilyByGuardianToken(db, keys.guardianKey);
  return NextResponse.redirect(new URL(`/t/${encodeURIComponent(fam?.teenToken ?? keys.teenToken)}`, req.url), 303);
}
