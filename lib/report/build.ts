import type { Recruit } from "cfbd";
import type { CfbdAdapter } from "../adapters/cfbd";
import { PFF_LABELS } from "../adapters/pffCsv";
import { roundFromRank } from "../adapters/rankingsCsv";
import { athleticScore } from "../athletic";
import { findComps } from "../comps";
import type { GradingConfig } from "../config";
import { contextRaw } from "../context";
import { extractFeatures, gradePlayer } from "../grading";
import { ageOn, buildCareerProfile, projectedDraftYear } from "../metrics";
import {
  applyPpa,
  buildTeamSeason,
  estimateSacks,
  gamesPlayed,
  matchRecruit,
  playerSeasonsFromStats,
  recruitingFrom,
} from "../normalize";
import { CLASS_LABELS, normalizePosition, type DataGap, type Recruiting, type SeasonStats, type SourceStamp, type TeamSeason } from "../types";
import type { VideoService } from "../videos";
import type { ReportRepo } from "./repo";
import type { Report, ReportSeason, VideoSection } from "./types";

export type ReportDeps = {
  cfbd: CfbdAdapter;
  repo: ReportRepo;
  videos?: VideoService;
  config: GradingConfig;
  now?: Date;
  refresh?: boolean;
};

export class PlayerNotFoundError extends Error {}

/** Round midpoint as an estimated pick, so projected and actual draft capital share one scale. */
export function pickFromRound(round: number): number {
  return (round - 1) * 32 + 16;
}

async function settle<T>(p: Promise<T>, gaps: DataGap[], section: string, field: string): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    gaps.push({ section, field, reason: (e as Error).message });
    return null;
  }
}

export async function buildReport(cfbdId: string, deps: ReportDeps): Promise<Report> {
  const started = Date.now();
  const now = deps.now ?? new Date();
  const { cfbd, repo, config } = deps;
  const gaps: DataGap[] = [];
  const sources: SourceStamp[] = [];

  // 1. Resolve identity from the cached roster table.
  const roster = await repo.rosterRows(cfbdId);
  if (!roster.length) throw new PlayerNotFoundError(`No roster entry for CFBD id ${cfbdId}. Run sync-rosters or search again.`);
  const latest = roster[roster.length - 1];
  const position = normalizePosition(latest.position);
  if (!position) throw new PlayerNotFoundError(`${latest.fullName} is listed at ${latest.position}; only QB, RB, WR and TE are supported.`);
  const schools = [...new Set(roster.map((r) => r.team))];

  // 2. Fetch each college season through the CFBD adapter, in parallel.
  const teamSeasons = [...new Map(roster.filter((r) => r.season <= cfbd.season).map((r) => [`${r.season}|${r.team}`, r])).values()];
  const seasonCache = new Map<number, Promise<{ teamStats: Awaited<ReturnType<CfbdAdapter["teamSeasonStats"]>>; advanced: Awaited<ReturnType<CfbdAdapter["advancedSeasonStats"]>>; sp: Awaited<ReturnType<CfbdAdapter["sp"]>>; games: Awaited<ReturnType<CfbdAdapter["games"]>> }>>();
  const seasonWide = (year: number) => {
    if (!seasonCache.has(year)) {
      seasonCache.set(
        year,
        Promise.all([
          cfbd.teamSeasonStats(year),
          cfbd.advancedSeasonStats(year).catch(() => []),
          cfbd.sp(year).catch(() => []),
          cfbd.games(year).catch(() => []),
        ]).then(([teamStats, advanced, sp, games]) => ({ teamStats, advanced, sp, games })),
      );
    }
    return seasonCache.get(year)!;
  };

  const perSeason = await Promise.all(
    teamSeasons.map(async (r) => {
      const [stats, gameBox, ppa, wide] = await Promise.all([
        settle(cfbd.playerSeasonStats(r.season, r.team), gaps, "Season stats", `${r.season} ${r.team}`),
        cfbd.gamePlayers(r.season, r.team).catch(() => null),
        cfbd.ppaPlayers(r.season, r.team).catch(() => null),
        settle(seasonWide(r.season), gaps, "Team context", `${r.season} ${r.team}`),
      ]);
      const team: TeamSeason | null = wide ? buildTeamSeason(r.season, r.team, wide) : null;
      const rows = stats ? playerSeasonsFromStats(stats, cfbdId).filter((s) => s.team === r.team) : [];
      const season: SeasonStats | null = rows[0] ?? null;
      if (!season) return { team, season: null };
      let s: SeasonStats = { ...season, games: gameBox ? gamesPlayed(gameBox, cfbdId) : null };
      if (gameBox == null) gaps.push({ section: "Season stats", field: `${r.season} games played`, reason: "CFBD game box scores unavailable" });
      s = applyPpa(s, ppa?.find((x) => String(x.id) === cfbdId));
      if (position === "QB") s = estimateSacks(s, team ?? undefined);
      return { team, season: s };
    }),
  );

  const stats = perSeason.map((p) => p.season).filter((s): s is SeasonStats => s != null);
  const teamContext = perSeason.map((p) => p.team).filter((t): t is TeamSeason => t != null).sort((a, b) => a.season - b.season);
  if (!stats.length) gaps.push({ section: "Season stats", field: "all seasons", reason: "No FBS box-score stats recorded yet (redshirt or did not play)" });

  // 3. Birthdate → ages and breakout age.
  const birth = await repo.birthdate(cfbdId, latest.fullName);
  if (!birth) gaps.push({ section: "Header", field: "Age / breakout age", reason: "Birthdate unknown — add it to data/overrides/birthdates.csv" });

  // 4. PFF imports enrich seasons (targets, YPRR) and feed efficiency features.
  const pff = await repo.pff(cfbdId, latest.fullName, schools);
  for (const s of stats) {
    const row = pff.find((p) => p.season === s.season);
    if (row?.metrics.targets != null) s.targets = row.metrics.targets;
  }

  const profile = buildCareerProfile(position, stats, teamContext, birth?.date ?? null, config.breakout_threshold);
  const seasons: ReportSeason[] = profile.seasons.map((d, i) => {
    const st = [...stats].sort((a, b) => a.season - b.season)[i];
    const prev = i > 0 ? profile.seasons[i - 1] : null;
    return {
      stats: st,
      derived: d,
      transfer: prev != null && prev.team !== d.team,
      pff: pff.find((p) => p.season === d.season)?.metrics ?? null,
    };
  });
  if (stats.some((s) => s.sacksEstimated)) {
    gaps.push({ section: "Advanced metrics", field: "Sacks / sack yards", reason: `Estimated from team sacks allowed × share of pass attempts at ${6.5} yds/sack` });
  }
  if (position !== "QB" && stats.every((s) => s.targets == null)) {
    gaps.push({ section: "Advanced metrics", field: "Targets / target share", reason: "Not in CFBD box scores; import PFF to fill" });
  }
  if (!pff.length) {
    gaps.push({ section: "Advanced metrics", field: "PFF metrics (YPRR, grades, YAC)", reason: "No PFF import for this player — grade reweights" });
  }

  // 5. Recruiting profile.
  let recruiting: Recruiting | null = null;
  const first = roster[0];
  const recruitYears = [first.season, first.season - 1, first.season + 1];
  try {
    let match: Recruit | null = null;
    for (const y of recruitYears) {
      const pool = await cfbd.recruits(y, { team: first.team }).catch(() => [] as Recruit[]);
      match = matchRecruit(pool, { cfbdId, name: latest.fullName, recruitIds: latest.recruitIds, firstTeam: first.team });
      if (match) break;
    }
    if (match) {
      const classAtPos = match.position ? await cfbd.recruits(match.year, { position: match.position }).catch(() => [match!]) : [match];
      recruiting = recruitingFrom(match, classAtPos);
    } else {
      gaps.push({ section: "Recruiting", field: "Recruiting profile", reason: "No high-school recruiting record matched (walk-on, JUCO or international)" });
    }
  } catch (e) {
    gaps.push({ section: "Recruiting", field: "Recruiting profile", reason: (e as Error).message });
  }
  gaps.push({ section: "Recruiting", field: "Offers", reason: "Offer lists are not in CFBD (out of scope for v1)" });

  // 6. Athletic testing.
  const history = await repo.history(position);
  const drafted = history.find((h) => h.cfbdId === cfbdId) ?? null;
  const combine = await repo.combineFor(latest.fullName, schools, position);
  const refs = combine ? await repo.combineRefs(position) : [];
  const athletic = athleticScore(combine, refs);
  if (!combine) gaps.push({ section: "Athletic testing", field: "Combine / pro day", reason: "Not yet tested" });

  // 7. Rankings and draft capital.
  const bigBoard = await repo.bigBoard(cfbdId, latest.fullName, schools);
  const adp = await repo.adp(cfbdId, latest.fullName, schools);
  const topBoard = bigBoard[0];
  const projectedRound = topBoard ? (topBoard.projectedRound ?? roundFromRank(topBoard.rank)) : null;
  if (!bigBoard.length) gaps.push({ section: "Rankings", field: "NFL big board rank", reason: "No big board import matched this player" });
  if (!adp.length) gaps.push({ section: "Rankings", field: "Dynasty rookie ADP", reason: "No ADP import matched this player" });
  const draftPick = drafted?.draftPick ?? (projectedRound != null ? pickFromRound(projectedRound) : null);

  // 8. Grade and comps.
  const peakTeam = teamContext.find((t) => t.season === (profile.peakSeason ?? stats[stats.length - 1]?.season) && stats.some((s) => s.season === t.season && s.team === t.team));
  const pffPeak = pff.find((p) => p.season === profile.peakSeason) ?? pff.sort((a, b) => b.season - a.season)[0];
  const features = extractFeatures({
    profile,
    athleticScore: athletic.score,
    draftPick,
    recruitRating: recruiting?.rating ?? null,
    contextRaw: contextRaw(position, peakTeam),
    pff: { passGrade: pffPeak?.metrics.pass_grade, yco: pffPeak?.metrics.yco_att, yprr: pffPeak?.metrics.yprr },
  });
  const grade = gradePlayer(features, position, history, config);
  const comps = findComps({ features, heightIn: latest.height, weight: latest.weight }, position, history, config, cfbdId);
  if (!history.length) gaps.push({ section: "Grade", field: "Composite grade and comps", reason: "Historical table is empty — run the update-history job" });
  else if (!comps.length) gaps.push({ section: "Comps", field: "Historical comps", reason: `No historical player above ${Math.round(config.comps.min_similarity * 100)}% similarity` });

  // 9. Videos, notes and board.
  const videos: VideoSection = deps.videos
    ? await deps.videos.section({ cfbdId, name: latest.fullName, team: latest.team, season: cfbd.season }, { refresh: deps.refresh })
    : { status: "not_configured", items: [], pool: [], searchUrl: "", fetchedAt: null };
  if (videos.status !== "ok") gaps.push({ section: "Film and highlights", field: "Videos", reason: videos.message ?? "YouTube not configured" });
  const [notes, board] = await Promise.all([repo.notes(cfbdId), repo.boardSpot(cfbdId)]);

  // 10. Sources and timestamps.
  const cs = cfbd.stats;
  sources.push({ source: "CollegeFootballData", detail: `Rosters, box scores, PPA, team stats, SP+, games, recruiting (${cs.calls} calls, ${cs.cacheHits} cached)`, fetchedAt: cs.latestFetch?.toISOString() ?? null });
  if (history.length) sources.push({ source: "nflverse + CFBD history", detail: `${history.length} drafted ${position}s for percentiles and comps`, fetchedAt: null });
  if (combine) sources.push({ source: combine.source, detail: "Athletic testing", fetchedAt: null });
  if (pff.length) sources.push({ source: "PFF College (CSV import)", detail: `${pff.length} season(s): ${[...new Set(pff.flatMap((p) => Object.keys(p.metrics)))].map((k) => PFF_LABELS[k] ?? k).slice(0, 6).join(", ")}`, fetchedAt: null });
  for (const b of bigBoard) sources.push({ source: b.source, detail: "Big board (CSV import)", fetchedAt: b.asOf });
  for (const a of adp) sources.push({ source: a.source, detail: `Rookie ADP, ${a.format} (CSV import)`, fetchedAt: a.asOf });
  if (birth) sources.push({ source: birth.source, detail: "Birthdate", fetchedAt: null });
  if (videos.fetchedAt) sources.push({ source: "YouTube Data API v3", detail: "Highlights and film (7-day cache)", fetchedAt: videos.fetchedAt });

  const { seasons: _omit, ...profileRest } = profile;
  void _omit;
  return {
    version: 1,
    cfbdId,
    generatedAt: now.toISOString(),
    dataPulledAt: cs.latestFetch?.toISOString() ?? null,
    player: {
      name: latest.fullName,
      firstName: latest.firstName,
      lastName: latest.lastName,
      team: latest.team,
      position,
      rosterPosition: latest.position,
      classYear: latest.classYear,
      classLabel: latest.classYear != null ? (CLASS_LABELS[latest.classYear] ?? `Yr ${latest.classYear}`) : null,
      heightIn: combine?.heightIn ?? latest.height,
      weight: combine?.weight ?? latest.weight,
      jersey: latest.jersey,
      hometown: [latest.homeCity, latest.homeState ?? latest.homeCountry].filter(Boolean).join(", ") || null,
      birthdate: birth?.date ?? null,
      birthdateSource: birth?.source ?? null,
      age: birth ? ageOn(birth.date, now) : null,
      projectedDraftYear: drafted?.draftYear ?? projectedDraftYear(cfbd.season, latest.classYear),
      latestSeason: latest.season,
    },
    board,
    grade,
    features,
    comps,
    seasons,
    profile: profileRest,
    athletic: { combine, result: athletic },
    rankings: {
      bigBoard,
      adp,
      projectedRound,
      draft: drafted ? { year: drafted.draftYear, round: drafted.draftRound, pick: drafted.draftPick } : null,
    },
    teamContext,
    recruiting,
    videos,
    notes,
    gaps,
    sources,
    timings: { totalMs: Date.now() - started, cfbdCalls: cs.calls, cfbdCacheHits: cs.cacheHits },
  };
}
