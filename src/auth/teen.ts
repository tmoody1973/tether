import { connection } from "next/server";
import { getDb, type Db } from "@/db/client";
import { getFamilyByTeenToken, type Family } from "@/db/repo";

const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * R39: Zoe's link is her only credential. Every teen page and action resolves the family from the token itself,
 * per request, so a reset link stops working at once. Anything malformed or unknown is null.
 */
export async function teenFamily(db: Db, token: unknown): Promise<Family | null> {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  return getFamilyByTeenToken(db, token);
}

/** For teen pages (inside <Suspense>): request time only, never a prerender, then the token lookup. */
export async function teenSession(token: string): Promise<{ db: Db; fam: Family } | null> {
  await connection();
  const db = await getDb();
  const fam = await teenFamily(db, token);
  return fam ? { db, fam } : null;
}
