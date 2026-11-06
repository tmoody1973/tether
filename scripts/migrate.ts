// Applies every drizzle migration to DATABASE_URL (the deploy step; Neon is not migrated automatically).
//   DATABASE_URL=postgres://... pnpm tsx scripts/migrate.ts
// Refuses a pglite: URL unless --local, so a mistyped env can't "migrate" a throwaway local database and look done.
import { closeDb, createDb, migrateDb } from "@/db/client";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("pglite:") && !process.argv.includes("--local")) {
    throw new Error("refusing: DATABASE_URL is a pglite: URL; this script is for the deployed Neon database (pass --local to migrate a local one)");
  }
  const db = createDb(url);
  try {
    await migrateDb(db);
    console.log(`migrated ${url.startsWith("pglite:") ? url : new URL(url).host}`);
  } finally {
    await closeDb(db);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
