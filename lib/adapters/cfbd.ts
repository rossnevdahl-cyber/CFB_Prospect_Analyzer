import {
  client,
  getAdvancedSeasonStats,
  getDraftPicks,
  getFbsTeams,
  getGamePlayerStats,
  getGames,
  getPlayerSeasonStats,
  getPredictedPointsAddedByPlayerSeason,
  getPlayerUsage,
  getRecruits,
  getRoster,
  getSp,
  getTeamStats,
  searchPlayers,
  type AdvancedSeasonStat,
  type DraftPick,
  type Game,
  type GamePlayerStats,
  type PlayerSearchResult,
  type PlayerSeasonPredictedPointsAdded,
  type PlayerStat,
  type PlayerUsage,
  type Recruit,
  type RosterPlayer,
  type Team,
  type TeamSP,
  type TeamStat,
} from "cfbd";
import { DAY, type Cache } from "../cache";
import { currentSeason } from "../metrics";

export type CfbdOptions = {
  apiKey: string | undefined;
  cache: Cache;
  /** Injected for tests: serves recorded fixtures instead of the live API. */
  fetch?: (request: Request) => Promise<Response>;
  season?: number;
  refresh?: boolean;
  /** Max CFBD requests in flight from this adapter. CFBD rejects concurrent calls to one endpoint. */
  concurrency?: number;
  /** Backoff before each retry of a rate-limited call, in ms. */
  retryDelaysMs?: number[];
};

type Call<T> = () => Promise<{ data?: T; error?: unknown; response?: Response }>;

const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

/** CFBD pushback: HTTP 429, or its "Too many concurrent requests" message. */
export function isRateLimited(res: { error?: unknown; response?: Response }): boolean {
  if (res.response?.status === 429) return true;
  return /too many/i.test(JSON.stringify(res.error ?? ""));
}

/** Runs at most `limit` tasks at once; the rest wait in FIFO order. */
export class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

/**
 * CollegeFootballData adapter. Every call goes through the cache: current-season data expires
 * after 24 hours, past seasons never expire.
 */
export class CfbdAdapter {
  readonly source = "CollegeFootballData";
  readonly season: number;
  private calls = 0;
  private hits = 0;
  private latestFetch: Date | null = null;
  private limiter: Limiter;

  constructor(private opts: CfbdOptions) {
    this.season = opts.season ?? currentSeason();
    this.limiter = new Limiter(opts.concurrency ?? 2);
    client.setConfig({
      baseUrl: "https://api.collegefootballdata.com",
      headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  get stats() {
    return { calls: this.calls, cacheHits: this.hits, latestFetch: this.latestFetch };
  }

  private ttl(year: number | null): number | null {
    return year == null || year >= this.season ? DAY : null;
  }

  private async cached<T>(key: string, year: number | null, call: Call<T>, ttlOverride?: number | null): Promise<T> {
    const ttl = ttlOverride !== undefined ? ttlOverride : this.ttl(year);
    const r = await this.opts.cache.get<T>(
      `cfbd:${key}`,
      "cfbd",
      ttl,
      async () => {
        if (!this.opts.apiKey && !this.opts.fetch) throw new Error("CFBD_API_KEY is not set");
        const res = await this.request(call);
        if (res.error || res.data === undefined) {
          throw new Error(`CFBD ${key} failed: ${JSON.stringify(res.error ?? "no data")}`);
        }
        return res.data;
      },
      { refresh: this.opts.refresh },
    );
    this.calls++;
    if (r.hit) this.hits++;
    if (!this.latestFetch || r.fetchedAt > this.latestFetch) this.latestFetch = r.fetchedAt;
    return r.value;
  }

  /** One live request: limited concurrency, retried with backoff while CFBD says it is too busy. */
  private async request<T>(call: Call<T>): Promise<Awaited<ReturnType<Call<T>>>> {
    const delays = this.opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    for (let attempt = 0; ; attempt++) {
      const res = await this.limiter.run(call);
      if (!isRateLimited(res) || attempt >= delays.length) return res;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }

  fbsTeams(year = this.season): Promise<Team[]> {
    return this.cached(`teams/fbs:${year}`, year, () => getFbsTeams({ query: { year } }), 7 * DAY);
  }

  roster(year: number, team?: string): Promise<RosterPlayer[]> {
    return this.cached(`roster:${year}:${team ?? "all"}`, year, () =>
      getRoster({ query: { year, ...(team ? { team } : {}), classification: "fbs" } }),
    );
  }

  searchPlayers(searchTerm: string, opts: { team?: string; position?: string } = {}): Promise<PlayerSearchResult[]> {
    return this.cached(
      `search:${searchTerm.toLowerCase()}:${opts.team ?? ""}:${opts.position ?? ""}`,
      null,
      () => searchPlayers({ query: { searchTerm, ...opts } }),
    );
  }

  /** All player season stats for one team-year, every category. */
  playerSeasonStats(year: number, team: string): Promise<PlayerStat[]> {
    return this.cached(`stats/player/season:${year}:${team}`, year, () =>
      getPlayerSeasonStats({ query: { year, team, seasonType: "both" } }),
    );
  }

  /** All players for one year and category — used by the history job. */
  playerSeasonStatsByCategory(year: number, category: string): Promise<PlayerStat[]> {
    return this.cached(`stats/player/season:${year}:cat:${category}`, year, () =>
      getPlayerSeasonStats({ query: { year, category, seasonType: "both" } }),
    );
  }

  /** Season totals for every team in one call. */
  teamSeasonStats(year: number): Promise<TeamStat[]> {
    return this.cached(`stats/season:${year}`, year, () => getTeamStats({ query: { year } }));
  }

  advancedSeasonStats(year: number): Promise<AdvancedSeasonStat[]> {
    return this.cached(`stats/season/advanced:${year}`, year, () =>
      getAdvancedSeasonStats({ query: { year, classification: "fbs" } }),
    );
  }

  sp(year: number): Promise<TeamSP[]> {
    return this.cached(`ratings/sp:${year}`, year, () => getSp({ query: { year } }));
  }

  /** Every game of a season — one call feeds strength of schedule for all teams. */
  games(year: number): Promise<Game[]> {
    return this.cached(`games:${year}`, year, () => getGames({ query: { year, seasonType: "both" } }));
  }

  /** Per-game box scores for one team-year; used to count games played. */
  gamePlayers(year: number, team: string): Promise<GamePlayerStats[]> {
    return this.cached(`games/players:${year}:${team}`, year, () =>
      getGamePlayerStats({ query: { year, team, seasonType: "both" } }),
    );
  }

  ppaPlayers(year: number, team?: string, position?: string): Promise<PlayerSeasonPredictedPointsAdded[]> {
    return this.cached(`ppa/players/season:${year}:${team ?? ""}:${position ?? ""}`, year, () =>
      getPredictedPointsAddedByPlayerSeason({
        query: { year, ...(team ? { team } : {}), ...(position ? { position } : {}), excludeGarbageTime: true },
      }),
    );
  }

  usage(year: number, team: string): Promise<PlayerUsage[]> {
    return this.cached(`player/usage:${year}:${team}`, year, () =>
      getPlayerUsage({ query: { year, team, excludeGarbageTime: true } }),
    );
  }

  recruits(year: number, opts: { team?: string; position?: string } = {}): Promise<Recruit[]> {
    return this.cached(`recruiting/players:${year}:${opts.team ?? ""}:${opts.position ?? ""}`, null, () =>
      getRecruits({ query: { year, classification: "HighSchool", ...opts } }),
      // Recruiting classes are final once signed.
      year < this.season ? null : DAY,
    );
  }

  draftPicks(year: number): Promise<DraftPick[]> {
    return this.cached(`draft/picks:${year}`, null, () => getDraftPicks({ query: { year } }), year < new Date().getUTCFullYear() ? null : DAY);
  }
}
