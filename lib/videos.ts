import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { videoCache, videoOverrides } from "./db/schema";
import { DAY } from "./cache";
import {
  applyOverrides,
  selectVideos,
  youtubeSearchUrl,
  YouTubeAdapter,
  type Video,
  type VideoOverride,
} from "./adapters/youtube";
import type { VideoSection } from "./report/types";

export const VIDEO_TTL_MS = 7 * DAY;

export type VideoPlayer = { cfbdId: string; name: string; team: string; season: number };

export interface VideoService {
  section(p: VideoPlayer, opts?: { refresh?: boolean }): Promise<VideoSection>;
}

type CachedVideos = { items: Video[]; pool: Video[] };

/** Builds the section from cached search results plus manual overrides. Shared by memory and Postgres stores. */
export function composeSection(p: VideoPlayer, cached: CachedVideos | null, overrides: VideoOverride[], fetchedAt: Date | null, status: VideoSection["status"], message?: string): VideoSection {
  const items = applyOverrides(cached?.items ?? [], cached?.pool ?? [], overrides);
  const shown = new Set(items.map((v) => v.id));
  const hidden = new Set(overrides.filter((o) => o.action === "hide").map((o) => o.videoId));
  return {
    status,
    message,
    items,
    pool: (cached?.pool ?? []).filter((v) => !shown.has(v.id) && !hidden.has(v.id)),
    searchUrl: youtubeSearchUrl(p.name, p.team),
    fetchedAt: fetchedAt?.toISOString() ?? null,
  };
}

/** Runs the search and splits results into the top 3 and the remaining qualifying pool. */
export async function searchAndSelect(yt: YouTubeAdapter, p: VideoPlayer): Promise<CachedVideos> {
  const raw = await yt.search(p.name, p.team);
  const all = selectVideos(raw, p.name, p.team, p.season, 50);
  const items = selectVideos(raw, p.name, p.team, p.season, 3);
  const top = new Set(items.map((v) => v.id));
  return { items, pool: all.filter((v) => !top.has(v.id)) };
}

/** YouTube results cached per player for 7 days in Postgres; Refresh data re-runs the search. */
export class PgVideoService implements VideoService {
  constructor(private yt = new YouTubeAdapter(process.env.YOUTUBE_API_KEY)) {}

  async overrides(cfbdId: string): Promise<VideoOverride[]> {
    const rows = await getDb().select().from(videoOverrides).where(eq(videoOverrides.cfbdId, cfbdId));
    return rows.map((r) => ({ videoId: r.videoId, action: r.action, video: (r.video as Video | null) ?? null }));
  }

  async section(p: VideoPlayer, opts: { refresh?: boolean } = {}): Promise<VideoSection> {
    const db = getDb();
    const overrides = await this.overrides(p.cfbdId);
    const [row] = await db.select().from(videoCache).where(eq(videoCache.cfbdId, p.cfbdId)).limit(1);
    const fresh = row && Date.now() - row.fetchedAt.getTime() < VIDEO_TTL_MS;
    if (row && fresh && !opts.refresh) {
      return composeSection(p, row.videos as CachedVideos, overrides, row.fetchedAt, "ok");
    }
    if (!this.yt.configured) {
      return composeSection(p, (row?.videos as CachedVideos) ?? null, overrides, row?.fetchedAt ?? null, "not_configured", "YOUTUBE_API_KEY is not set");
    }
    try {
      const videos = await searchAndSelect(this.yt, p);
      const fetchedAt = new Date();
      await db
        .insert(videoCache)
        .values({ cfbdId: p.cfbdId, videos, fetchedAt })
        .onConflictDoUpdate({ target: videoCache.cfbdId, set: { videos, fetchedAt } });
      return composeSection(p, videos, overrides, fetchedAt, "ok");
    } catch (e) {
      return composeSection(p, (row?.videos as CachedVideos) ?? null, overrides, row?.fetchedAt ?? null, "error", (e as Error).message);
    }
  }
}
