import { CfbdAdapter } from "../lib/adapters/cfbd";
import { MemoryCache, PgCache } from "../lib/cache";
import { hasDatabase } from "../lib/db";

/** CFBD adapter for batch jobs; uses the Postgres cache so re-runs cost no API calls for past seasons. */
export function jobCfbd(opts: { refresh?: boolean } = {}): CfbdAdapter {
  if (!process.env.CFBD_API_KEY) throw new Error("CFBD_API_KEY is not set");
  // One request at a time: batch jobs are not latency-sensitive and CFBD throttles concurrent calls.
  return new CfbdAdapter({ apiKey: process.env.CFBD_API_KEY, cache: hasDatabase() ? new PgCache() : new MemoryCache(), refresh: opts.refresh, concurrency: 1 });
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

export function log(...a: unknown[]) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
}
