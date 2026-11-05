// Minimal e2e seed (Task 19 builds the full demo seed): one family, the demo shops, a signed Level 1 grant.
// Runs before the e2e dev server starts, because one PGlite directory can only be open in one process.
import { rmSync } from "node:fs";
import path from "node:path";
import { closeDb, openDb } from "@/db/client";
import { insertFamily, saveVault } from "@/db/repo";
import * as t from "@/db/schema";
import { clockFor } from "@/clock/clock";
import { signGrant } from "@/flows/grant";
import { E2E } from "./fixtures";

export const DEMO_MERCHANTS = [
  { id: "m_bestbuy", name: "Best Buy", domain: "bestbuy.com", class: "general", opensAtLevel: 1 },
  { id: "m_target", name: "Target", domain: "target.com", class: "general", opensAtLevel: 1 },
  { id: "m_barnesandnoble", name: "Barnes & Noble", domain: "barnesandnoble.com", class: "books", opensAtLevel: 2 },
  { id: "m_nike", name: "Nike", domain: "nike.com", class: "sneakers", opensAtLevel: 3 },
  { id: "m_uniqlo", name: "Uniqlo", domain: "uniqlo.com", class: "apparel", opensAtLevel: 3 },
].map((m) => ({ ...m, channel3WebsiteId: m.domain }));

async function main() {
  rmSync(path.resolve(process.cwd(), E2E.dir), { recursive: true, force: true });
  const db = await openDb(E2E.dbUrl);
  await db.insert(t.merchants).values(DEMO_MERCHANTS);
  const fam = await insertFamily(db, {
    name: "Amara & Zoe", guardianName: "Amara", teenName: "Zoe", teenToken: E2E.teenToken, guardianToken: E2E.guardianKey,
  });
  await saveVault(db, fam.id, "e2e-placeholder-token"); // never charged: e2e makes no PayPal calls
  await signGrant({ db, now: clockFor(db) }, fam.id, { level: 1 });
  await closeDb(db);
}

main().catch((err) => { console.error(err); process.exit(1); });
