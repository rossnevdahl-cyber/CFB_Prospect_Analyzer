import { normalizeName, normalizeSchool } from "../names";

export type Video = {
  id: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string;
  durationSec: number | null;
  views: number | null;
  thumbnail: string | null;
  kind: "highlight" | "film";
  matchStrength: number;
  pinned?: boolean;
  manual?: boolean;
};

export const YOUTUBE_SEARCH_COST = 100;
export const YOUTUBE_LIST_COST = 1;

export function searchQueries(fullName: string, college: string): string[] {
  return [`"${fullName}" ${college} highlights`, `"${fullName}" film breakdown OR scouting report`];
}

/** ISO 8601 duration (PT#H#M#S) to seconds. */
export function parseDuration(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

const FILM_WORDS = /\b(breakdown|film|scouting|analysis)\b|film room/i;

export function classify(title: string): "highlight" | "film" {
  return FILM_WORDS.test(title) ? "film" : "highlight";
}

/**
 * How well a video names the player: 2 = full name, 1 = last name plus college, 0 = neither.
 * Matching is on normalized text so accents and punctuation do not matter.
 */
export function matchStrength(v: { title: string; description: string }, fullName: string, college: string): number {
  const text = ` ${normalizeName(`${v.title} ${v.description}`)} `;
  const name = normalizeName(fullName);
  if (text.includes(` ${name} `)) return 2;
  const last = name.split(" ").pop() ?? "";
  const school = normalizeSchool(college);
  const schoolText = ` ${normalizeSchool(`${v.title} ${v.description}`)} `;
  if (last && text.includes(` ${last} `) && school && schoolText.includes(` ${school} `)) return 1;
  return 0;
}

/**
 * Applies the filter and ranking rules: drop non-matches, Shorts (<60 s) and anything over 60 min;
 * rank by match strength, then recency (current and last season first), then views.
 * Aims for two highlight reels and one film review, filling from whichever kind exists.
 */
export function selectVideos(
  raw: Omit<Video, "kind" | "matchStrength">[],
  fullName: string,
  college: string,
  season: number,
  limit = 3,
): Video[] {
  const seen = new Set<string>();
  const kept: Video[] = [];
  for (const v of raw) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    const strength = matchStrength(v, fullName, college);
    if (strength === 0) continue;
    if (v.durationSec != null && (v.durationSec < 60 || v.durationSec > 3600)) continue;
    kept.push({ ...v, kind: classify(v.title), matchStrength: strength });
  }
  const recent = (v: Video) => {
    const y = new Date(v.publishedAt).getUTCFullYear();
    return y >= season - 1 ? 1 : 0;
  };
  kept.sort(
    (a, b) =>
      b.matchStrength - a.matchStrength ||
      recent(b) - recent(a) ||
      (b.views ?? 0) - (a.views ?? 0) ||
      b.publishedAt.localeCompare(a.publishedAt),
  );
  const highlights = kept.filter((v) => v.kind === "highlight");
  const film = kept.filter((v) => v.kind === "film");
  const picked: Video[] = [...highlights.slice(0, 2), ...film.slice(0, 1)];
  for (const v of kept) {
    if (picked.length >= limit) break;
    if (!picked.includes(v)) picked.push(v);
  }
  return picked.slice(0, limit);
}

export type VideoOverride = { videoId: string; action: "pin" | "hide" | "add"; video: Video | null };

/** Merges manual fixes: hidden videos never show, pinned and pasted ones lead, then the search results. */
export function applyOverrides(found: Video[], pool: Video[], overrides: VideoOverride[], limit = 3): Video[] {
  const hidden = new Set(overrides.filter((o) => o.action === "hide").map((o) => o.videoId));
  const pinnedIds = new Set(overrides.filter((o) => o.action === "pin").map((o) => o.videoId));
  const manual = overrides
    .filter((o) => o.action === "add" && o.video && !hidden.has(o.videoId))
    .map((o) => ({ ...(o.video as Video), manual: true, pinned: true }));
  const pinned = [...found, ...pool]
    .filter((v) => pinnedIds.has(v.id) && !hidden.has(v.id))
    .map((v) => ({ ...v, pinned: true }));
  const out: Video[] = [];
  const add = (v: Video) => {
    if (!out.some((o) => o.id === v.id) && !hidden.has(v.id)) out.push(v);
  };
  [...manual, ...pinned].forEach(add);
  for (const v of [...found, ...pool]) {
    if (out.length >= limit) break;
    add(v);
  }
  return out.slice(0, Math.max(limit, manual.length + pinned.length));
}

/** Extracts a video id from any common YouTube URL form, or a bare 11-character id. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1, 12) || null;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeSearchUrl(fullName: string, college: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`"${fullName}" ${college} highlights`)}`;
}

type SearchResponse = { items?: { id?: { videoId?: string } }[] };
type ListResponse = {
  items?: {
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string };
  }[];
};

/** YouTube Data API v3 client: two searches (100 units each) plus one videos.list (1 unit). */
export class YouTubeAdapter {
  readonly source = "YouTube Data API v3";
  constructor(
    private apiKey: string | undefined,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async videosById(ids: string[]): Promise<Omit<Video, "kind" | "matchStrength">[]> {
    if (!ids.length) return [];
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,statistics");
    url.searchParams.set("id", ids.join(","));
    url.searchParams.set("key", this.apiKey ?? "");
    const res = await this.fetchImpl(url.toString());
    if (!res.ok) throw new Error(`YouTube videos.list failed: ${res.status}`);
    const body = (await res.json()) as ListResponse;
    return (body.items ?? []).map((it) => ({
      id: it.id,
      title: it.snippet?.title ?? "",
      description: it.snippet?.description ?? "",
      channel: it.snippet?.channelTitle ?? "",
      publishedAt: it.snippet?.publishedAt ?? "",
      durationSec: parseDuration(it.contentDetails?.duration),
      views: it.statistics?.viewCount ? Number(it.statistics.viewCount) : null,
      thumbnail:
        it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? `https://i.ytimg.com/vi/${it.id}/mqdefault.jpg`,
    }));
  }

  /** Runs both searches and returns the enriched, unfiltered pool. */
  async search(fullName: string, college: string): Promise<Omit<Video, "kind" | "matchStrength">[]> {
    if (!this.apiKey) throw new Error("YOUTUBE_API_KEY is not set");
    const ids: string[] = [];
    for (const q of searchQueries(fullName, college)) {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", "10");
      url.searchParams.set("q", q);
      url.searchParams.set("key", this.apiKey);
      const res = await this.fetchImpl(url.toString());
      if (!res.ok) throw new Error(`YouTube search failed: ${res.status}`);
      const body = (await res.json()) as SearchResponse;
      for (const it of body.items ?? []) if (it.id?.videoId && !ids.includes(it.id.videoId)) ids.push(it.id.videoId);
    }
    return this.videosById(ids);
  }
}
