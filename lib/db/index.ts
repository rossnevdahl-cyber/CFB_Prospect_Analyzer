import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __cfbDb?: Db; __cfbPool?: Pool };

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Postgres connection (Neon in production — use its pooled connection string).
 * One small pool per server instance, reused across hot reloads in dev.
 */
export function getDb(): Db {
  if (globalForDb.__cfbDb) return globalForDb.__cfbDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 3,
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  globalForDb.__cfbPool = pool;
  globalForDb.__cfbDb = drizzle(pool, { schema });
  return globalForDb.__cfbDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__cfbPool?.end();
  globalForDb.__cfbPool = undefined;
  globalForDb.__cfbDb = undefined;
}

export { schema };
