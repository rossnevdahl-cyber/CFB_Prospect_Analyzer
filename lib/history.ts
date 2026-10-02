import { athleticScore, type CombineRef } from "./athletic";
import type { GradingConfig } from "./config";
import { contextRaw } from "./context";
import { ppgYears1to3, type NflSeason } from "./fantasy";
import { fmtInt, fmtPct } from "./format";
import { extractFeatures, type FeatureVector } from "./grading";
import { buildCareerProfile, type CareerProfile } from "./metrics";
import type { Recruit } from "cfbd";
import { normalizeName, normalizeSchool } from "./names";
import { estimateSacks } from "./normalize";
import type { Combine, Position, SeasonStats, TeamSeason } from "./types";

/** CFBD draft positions are spelled out ("Wide Receiver"); nflverse uses abbreviations. */
export function draftPosition(pos: string | null | undefined): Position | null {
  if (!pos) return null;
  const p = pos.toLowerCase();
  if (p === "qb" || p.includes("quarterback")) return "QB";
  if (p === "rb" || p === "fb" || p === "hb" || p.includes("running back") || p.includes("fullback") || p.includes("halfback")) return "RB";
  if (p === "wr" || p.includes("wide receiver")) return "WR";
  if (p === "te" || p.includes("tight end")) return "TE";
  return null;
}

/** One-line summary of a player's best college season, e.g. "2019 LSU: 84-1,780-20, 38% dominator". */
export function collegeLine(position: Position, stats: SeasonStats[], profile: CareerProfile): string {
  const s = stats.find((x) => x.season === profile.peakSeason) ?? stats[stats.length - 1];
  if (!s) return "no FBS stats";
  const d = profile.seasons.find((x) => x.season === s.season);
  const head = `${s.season} ${s.team}`;
  switch (position) {
    case "QB":
      return `${head}: ${fmtInt(s.passCmp)}/${fmtInt(s.passAtt)}, ${fmtInt(s.passYds)} yds, ${s.passTd} TD, ${s.passInt} INT; ${fmtInt(s.rushYds)} rush yds`;
    case "RB":
      return `${head}: ${fmtInt(s.rushAtt)}-${fmtInt(s.rushYds)}-${s.rushTd} rushing, ${s.rec}-${fmtInt(s.recYds)} receiving, ${fmtPct(d?.dominator, 0)} dominator`;
    default:
      return `${head}: ${s.rec}-${fmtInt(s.recYds)}-${s.recTd}, ${fmtPct(d?.dominator, 0)} dominator`;
  }
}

/**
 * A drafted player's high-school recruiting record: by CFBD athlete id when the record carries one,
 * otherwise by name plus a school he played for (older records often lack the id).
 */
export function findRecruit(recruits: Recruit[], p: { cfbdId: string | null; name: string; schools: string[] }): Recruit | null {
  if (p.cfbdId) {
    const byId = recruits.find((r) => r.athleteId != null && String(r.athleteId) === p.cfbdId);
    if (byId) return byId;
  }
  const name = normalizeName(p.name);
  const schools = new Set(p.schools.map(normalizeSchool));
  const hits = recruits.filter((r) => normalizeName(r.name) === name && schools.has(normalizeSchool(r.committedTo)));
  return hits.length === 1 ? hits[0] : null;
}

export type HistoryInput = {
  position: Position;
  draftYear: number;
  overallPick: number | null;
  stats: SeasonStats[];
  teams: TeamSeason[];
  birthdate: string | null;
  combine: Combine | null;
  combineRefs: CombineRef[];
  recruitRating: number | null;
  nflSeasons: NflSeason[];
  config: GradingConfig;
  /** First season CFBD player stats cover; careers starting earlier are incomplete. */
  coverageStart: number;
};

export type HistoryComputed = {
  features: FeatureVector;
  profile: CareerProfile;
  collegeLine: string;
  collegeComplete: boolean;
  nflPpg: number | null;
  nflGames: number;
  athletic: number | null;
};

/** Features as of the player's final college season, plus NFL years 1–3 PPG. */
export function computeHistoryPlayer(i: HistoryInput): HistoryComputed {
  const college = i.stats.filter((s) => s.season < i.draftYear).sort((a, b) => a.season - b.season);
  const withSacks = i.position === "QB"
    ? college.map((s) => estimateSacks(s, i.teams.find((t) => t.season === s.season && t.team === s.team)))
    : college;
  // History has no per-game box scores; team games stand in for games played.
  const withGames = withSacks.map((s) => ({ ...s, games: s.games ?? i.teams.find((t) => t.season === s.season && t.team === s.team)?.games ?? null }));
  const profile = buildCareerProfile(i.position, withGames, i.teams, i.birthdate, i.config.breakout_threshold);
  const athletic = athleticScore(i.combine, i.combineRefs).score;
  const peakTeam = i.teams.find((t) => t.season === profile.peakSeason && withGames.some((s) => s.season === t.season && s.team === t.team));
  const features = extractFeatures({
    profile,
    athleticScore: athletic,
    draftPick: i.overallPick,
    recruitRating: i.recruitRating,
    contextRaw: contextRaw(i.position, peakTeam),
  });
  const final = college[college.length - 1];
  const first = college[0];
  const collegeComplete = Boolean(final && final.season === i.draftYear - 1 && first && first.season > i.coverageStart);
  const { ppg, games } = ppgYears1to3(i.nflSeasons, i.draftYear, i.config.scoring);
  return {
    features,
    profile,
    collegeLine: collegeLine(i.position, withGames, profile),
    collegeComplete,
    nflPpg: ppg,
    nflGames: games,
    athletic,
  };
}

/** Pearson correlation; null with fewer than 3 pairs. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let k = 0; k < n; k++) {
    sxy += (xs[k] - mx) * (ys[k] - my);
    sxx += (xs[k] - mx) ** 2;
    syy += (ys[k] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let k = 0; k < idx.length; ) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++;
    for (let m = k; m <= j; m++) r[idx[m][1]] = (k + j) / 2 + 1;
    k = j + 1;
  }
  return r;
}

export function spearman(xs: number[], ys: number[]): number | null {
  return pearson(ranks(xs), ranks(ys));
}
