import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import * as schema from "./schema";

// Both drivers extend PgDatabase; this is the shared surface repos rely on.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** `pglite:memory` (tests), `pglite:<dir>` (local dev / e2e, on disk), else a Neon URL. */
export function createDb(url: string): Db {
  if (url === "pglite:memory") return drizzlePglite({ client: new PGlite(), schema });
  if (url.startsWith("pglite:")) {
    const dir = url.slice("pglite:".length);
    mkdirSync(path.dirname(path.resolve(dir)), { recursive: true }); // PGlite creates the leaf dir, not its parents
    return drizzlePglite({ client: new PGlite(dir), schema });
  }
  neonConfig.webSocketConstructor = ws;
  return drizzleNeon({ client: new Pool({ connectionString: url }), schema });
}

/** createDb, and for a PGlite database also apply every migration (idempotent). Neon is migrated by `pnpm db:migrate`. */
export async function openDb(url: string): Promise<Db> {
  const db = createDb(url);
  if (url.startsWith("pglite:")) await migrateDb(db);
  return db;
}

export async function closeDb(db: Db): Promise<void> {
  const client = (db as unknown as { $client: { close?: () => Promise<void>; end?: () => Promise<void> } }).$client;
  await (client.close ?? client.end)?.call(client);
}

export async function migrateDb(db: Db): Promise<void> {
  const client = (db as unknown as { $client: unknown }).$client;
  const config = { migrationsFolder: MIGRATIONS_FOLDER };
  if (client instanceof PGlite) {
    await migratePglite(db as unknown as Parameters<typeof migratePglite>[0], config);
  } else {
    await migrateNeon(db as unknown as Parameters<typeof migrateNeon>[0], config);
  }
}

// ponytail: kept on globalThis so dev hot-reloads reuse one PGlite; two PGlite instances on one directory corrupt it.
// One process per pglite:<dir> is the ceiling; use Neon for anything shared.
const g = globalThis as unknown as { tetherDb?: Promise<Db> };

/** Process-wide DB for route handlers and pages, from DATABASE_URL. */
export function getDb(): Promise<Db> {
  if (!g.tetherDb) {
    const url = process.env.DATABASE_URL;
    if (!url) return Promise.reject(new Error("DATABASE_URL is not set; add it to .env.local (pglite:./.pglite/dev for local)"));
    g.tetherDb = openDb(url).catch((err) => { g.tetherDb = undefined; throw err; });
  }
  return g.tetherDb;
}
