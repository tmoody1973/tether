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

export function createDb(url: string): Db {
  if (url === "pglite:memory") return drizzlePglite({ client: new PGlite(), schema });
  neonConfig.webSocketConstructor = ws;
  return drizzleNeon({ client: new Pool({ connectionString: url }), schema });
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

let shared: Db | undefined;
/** Process-wide DB for route handlers, from DATABASE_URL. */
export function getDb(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set; add it to .env.local");
    shared = createDb(url);
  }
  return shared;
}
