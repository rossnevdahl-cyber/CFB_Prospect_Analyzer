import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { apiCache } from "./db/schema";

export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

/**
 * Key/value cache in front of every adapter. `ttlMs` null means the entry never expires
 * (past seasons); `refresh` bypasses reads but still writes the fresh value.
 */
export interface Cache {
  get<T>(key: string, source: string, ttlMs: number | null, load: () => Promise<T>, opts?: { refresh?: boolean }): Promise<{ value: T; fetchedAt: Date; hit: boolean }>;
}

export class MemoryCache implements Cache {
  private store = new Map<string, { payload: unknown; fetchedAt: Date; expiresAt: Date | null }>();
  async get<T>(key: string, _source: string, ttlMs: number | null, load: () => Promise<T>, opts?: { refresh?: boolean }) {
    const row = this.store.get(key);
    if (row && !opts?.refresh && (!row.expiresAt || row.expiresAt > new Date())) {
      return { value: row.payload as T, fetchedAt: row.fetchedAt, hit: true };
    }
    const value = await load();
    const fetchedAt = new Date();
    this.store.set(key, { payload: value, fetchedAt, expiresAt: ttlMs == null ? null : new Date(Date.now() + ttlMs) });
    return { value, fetchedAt, hit: false };
  }
}

export class PgCache implements Cache {
  async get<T>(key: string, source: string, ttlMs: number | null, load: () => Promise<T>, opts?: { refresh?: boolean }) {
    const db = getDb();
    if (!opts?.refresh) {
      const [row] = await db.select().from(apiCache).where(eq(apiCache.key, key)).limit(1);
      if (row && (!row.expiresAt || row.expiresAt > new Date())) {
        return { value: row.payload as T, fetchedAt: row.fetchedAt, hit: true };
      }
    }
    const value = await load();
    const fetchedAt = new Date();
    const expiresAt = ttlMs == null ? null : new Date(Date.now() + ttlMs);
    await db
      .insert(apiCache)
      .values({ key, source, payload: value as object, fetchedAt, expiresAt })
      .onConflictDoUpdate({ target: apiCache.key, set: { payload: value as object, fetchedAt, expiresAt } });
    return { value, fetchedAt, hit: false };
  }
}
