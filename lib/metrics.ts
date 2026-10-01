import type { Position, SeasonStats, TeamSeason } from "./types";

/** Safe division: null when the denominator is missing or zero. */
export function ratio(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

/** Age in years (decimal) on a given date. */
export function ageOn(birthdate: string | null | undefined, on: Date): number | null {
  if (!birthdate) return null;
  const b = new Date(`${birthdate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  return (on.getTime() - b.getTime()) / (365.2425 * 24 * 3600 * 1000);
}

/** Age on Sept. 1 of a season — the breakout-age convention. */
export function seasonAge(birthdate: string | null | undefined, season: number): number | null {
  return ageOn(birthdate, new Date(Date.UTC(season, 8, 1)));
}

/**
 * Dominator rating = mean of (player yards ÷ team yards) and (player TDs ÷ team TDs).
 * WR/TE use receiving; RB uses scrimmage (rush + rec) against team scrimmage totals.
 * If the team scored no TDs of that kind, the yards share stands alone.
 */
export function dominator(position: Position, p: SeasonStats, t: TeamSeason | undefined): number | null {
  if (!t || position === "QB") return null;
  let yds: number | null;
  let tds: number | null;
  if (position === "RB") {
    const teamYds = t.passYds != null && t.rushYds != null ? t.passYds + t.rushYds : null;
    const teamTds = t.passTd != null && t.rushTd != null ? t.passTd + t.rushTd : null;
    yds = ratio(p.rushYds + p.recYds, teamYds);
    tds = ratio(p.rushTd + p.recTd, teamTds);
  } else {
    yds = ratio(p.recYds, t.passYds);
    tds = ratio(p.recTd, t.passTd);
  }
  if (yds == null) return null;
  return tds == null ? yds : (yds + tds) / 2;
}

/** ANY/A = (pass yds + 20×TD − 45×INT − sack yds) ÷ (attempts + sacks). */
export function anyA(p: Pick<SeasonStats, "passYds" | "passTd" | "passInt" | "passAtt" | "sacks" | "sackYds">): number | null {
  const sacks = p.sacks ?? 0;
  const sackYds = p.sackYds ?? 0;
  return ratio(p.passYds + 20 * p.passTd - 45 * p.passInt - sackYds, p.passAtt + sacks);
}

export type DerivedSeason = {
  season: number;
  team: string;
  age: number | null;
  games: number | null;
  sos: number | null;
  sosRank: number | null;
  // QB
  compPct: number | null;
  ypa: number | null;
  anyA: number | null;
  sackRate: number | null;
  tdInt: number | null;
  rushShare: number | null;
  epaPass: number | null;
  // RB / WR / TE
  ypc: number | null;
  ypr: number | null;
  yardsPerTouch: number | null;
  carryShare: number | null;
  targetShare: number | null;
  recYdsPerTeamPassAtt: number | null;
  dominator: number | null;
  scrimYpg: number | null;
  totalYpg: number | null;
  epaRush: number | null;
  epaAll: number | null;
};

export function deriveSeason(
  position: Position,
  p: SeasonStats,
  team: TeamSeason | undefined,
  birthdate: string | null,
): DerivedSeason {
  const games = p.games ?? team?.games ?? null;
  const scrim = p.rushYds + p.recYds;
  const sacks = p.sacks ?? 0;
  return {
    season: p.season,
    team: p.team,
    age: seasonAge(birthdate, p.season),
    games: p.games,
    sos: team?.sos ?? null,
    sosRank: team?.sosRank ?? null,
    compPct: ratio(p.passCmp, p.passAtt),
    ypa: ratio(p.passYds, p.passAtt),
    anyA: p.passAtt > 0 ? anyA(p) : null,
    sackRate: p.sacks == null || p.passAtt === 0 ? null : ratio(sacks, p.passAtt + sacks),
    tdInt: p.passAtt === 0 ? null : p.passInt === 0 ? (p.passTd > 0 ? p.passTd : null) : p.passTd / p.passInt,
    rushShare: ratio(p.rushYds, team?.rushYds),
    epaPass: p.epaPass,
    ypc: ratio(p.rushYds, p.rushAtt),
    ypr: ratio(p.recYds, p.rec),
    yardsPerTouch: ratio(scrim, p.rushAtt + p.rec),
    carryShare: ratio(p.rushAtt, team?.rushAtt),
    targetShare: ratio(p.targets, team?.passAtt),
    recYdsPerTeamPassAtt: ratio(p.recYds, team?.passAtt),
    dominator: dominator(position, p, team),
    scrimYpg: ratio(scrim, games),
    totalYpg: ratio(p.passYds + p.rushYds + p.recYds, games),
    epaRush: p.epaRush,
    epaAll: p.epaAll,
  };
}

export type CareerProfile = {
  position: Position;
  seasons: DerivedSeason[];
  peakSeason: number | null;
  peakDominator: number | null;
  careerDominator: number | null;
  peakRecYdsPerTeamPassAtt: number | null;
  peakScrimYpg: number | null;
  peakTotalYpg: number | null;
  peakAnyA: number | null;
  careerAnyA: number | null;
  careerYpc: number | null;
  peakEpaPass: number | null;
  peakEpaRush: number | null;
  peakEpaAll: number | null;
  careerRushShare: number | null;
  breakoutAge: number | null;
  breakoutSeason: number | null;
  /** True when the player has not yet hit the breakout threshold. */
  noBreakout: boolean;
  ageAtPeak: number | null;
  finalSeasonAge: number | null;
};

function maxOf(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? Math.max(...v) : null;
}

/**
 * Season of first breakout: first season whose dominator meets the position threshold.
 * Returns null for QBs (no threshold defined).
 */
export function findBreakout(
  seasons: Pick<DerivedSeason, "season" | "dominator" | "age">[],
  threshold: number | undefined,
): { season: number; age: number | null } | null {
  if (threshold == null) return null;
  const hit = [...seasons].sort((a, b) => a.season - b.season).find((s) => (s.dominator ?? 0) >= threshold);
  return hit ? { season: hit.season, age: hit.age } : null;
}

export function buildCareerProfile(
  position: Position,
  stats: SeasonStats[],
  teams: TeamSeason[],
  birthdate: string | null,
  breakoutThresholds: Partial<Record<Position, number>>,
): CareerProfile {
  const teamFor = (s: SeasonStats) => teams.find((t) => t.season === s.season && t.team === s.team);
  const sorted = [...stats].sort((a, b) => a.season - b.season);
  const seasons = sorted.map((s) => deriveSeason(position, s, teamFor(s), birthdate));

  // Career dominator: pooled player share across all seasons.
  let careerDominator: number | null = null;
  if (position !== "QB") {
    let py = 0, pt = 0, ty = 0, tt = 0;
    let ok = false;
    for (const s of sorted) {
      const t = teamFor(s);
      if (!t || t.passYds == null) continue;
      ok = true;
      if (position === "RB") {
        py += s.rushYds + s.recYds;
        pt += s.rushTd + s.recTd;
        ty += (t.passYds ?? 0) + (t.rushYds ?? 0);
        tt += (t.passTd ?? 0) + (t.rushTd ?? 0);
      } else {
        py += s.recYds;
        pt += s.recTd;
        ty += t.passYds ?? 0;
        tt += t.passTd ?? 0;
      }
    }
    if (ok && ty > 0) careerDominator = tt > 0 ? (py / ty + pt / tt) / 2 : py / ty;
  }

  // Peak season: highest dominator for skill players; highest ANY/A (min 100 att) for QBs.
  let peak: DerivedSeason | undefined;
  if (position === "QB") {
    peak = seasons
      .filter((s, i) => sorted[i].passAtt >= 100 && s.anyA != null)
      .sort((a, b) => (b.anyA ?? 0) - (a.anyA ?? 0))[0];
  } else {
    peak = seasons.filter((s) => s.dominator != null).sort((a, b) => (b.dominator ?? 0) - (a.dominator ?? 0))[0];
  }

  const totals = sorted.reduce(
    (acc, s) => ({
      passYds: acc.passYds + s.passYds,
      passTd: acc.passTd + s.passTd,
      passInt: acc.passInt + s.passInt,
      passAtt: acc.passAtt + s.passAtt,
      sacks: acc.sacks + (s.sacks ?? 0),
      sackYds: acc.sackYds + (s.sackYds ?? 0),
      rushYds: acc.rushYds + s.rushYds,
      rushAtt: acc.rushAtt + s.rushAtt,
    }),
    { passYds: 0, passTd: 0, passInt: 0, passAtt: 0, sacks: 0, sackYds: 0, rushYds: 0, rushAtt: 0 },
  );
  const teamRush = sorted.reduce((acc, s) => acc + (teamFor(s)?.rushYds ?? 0), 0);

  const breakout = findBreakout(seasons, position === "QB" ? undefined : breakoutThresholds[position]);
  const last = seasons[seasons.length - 1];

  return {
    position,
    seasons,
    peakSeason: peak?.season ?? null,
    peakDominator: maxOf(seasons.map((s) => s.dominator)),
    careerDominator,
    peakRecYdsPerTeamPassAtt: maxOf(seasons.map((s) => s.recYdsPerTeamPassAtt)),
    peakScrimYpg: maxOf(seasons.map((s) => s.scrimYpg)),
    peakTotalYpg: maxOf(seasons.map((s) => s.totalYpg)),
    peakAnyA: peak && position === "QB" ? peak.anyA : null,
    careerAnyA: totals.passAtt >= 100 ? anyA({ ...totals, sacks: totals.sacks, sackYds: totals.sackYds }) : null,
    careerYpc: totals.rushAtt >= 50 ? totals.rushYds / totals.rushAtt : null,
    peakEpaPass: maxOf(seasons.map((s) => s.epaPass)),
    peakEpaRush: maxOf(seasons.map((s) => s.epaRush)),
    peakEpaAll: maxOf(seasons.map((s) => s.epaAll)),
    careerRushShare: position === "QB" ? ratio(totals.rushYds, teamRush) : null,
    breakoutAge: breakout?.age ?? null,
    breakoutSeason: breakout?.season ?? null,
    noBreakout: position !== "QB" && !breakout,
    ageAtPeak: peak?.age ?? null,
    finalSeasonAge: last?.age ?? null,
  };
}

/** Projected NFL draft year: three seasons after high school, i.e. after the junior year at the earliest. */
export function projectedDraftYear(currentSeason: number, classYear: number | null): number {
  const c = classYear ?? 3;
  return currentSeason + Math.max(1, 4 - c);
}

/** College season currently in play: from August on, the calendar year; before that, last year. */
export function currentSeason(now = new Date()): number {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/** Mid-rank percentile (0–100) of `value` within `population`. */
export function percentileRank(value: number, population: number[], higherIsBetter = true): number | null {
  const pop = population.filter((x) => Number.isFinite(x));
  if (!pop.length) return null;
  let below = 0, equal = 0;
  for (const x of pop) {
    if (x < value) below++;
    else if (x === value) equal++;
  }
  const pct = ((below + equal / 2) / pop.length) * 100;
  return higherIsBetter ? pct : 100 - pct;
}

/** Parses "6-2", "6'2\"", "74" into inches. */
export function parseHeight(h: string | number | null | undefined): number | null {
  if (h == null || h === "") return null;
  if (typeof h === "number") return h;
  const m = h.match(/^(\d+)\s*[-'’ ]\s*(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]) * 12 + Number(m[2]);
  const n = Number(h);
  return Number.isFinite(n) ? n : null;
}

export function formatHeight(inches: number | null | undefined): string {
  if (inches == null) return "—";
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`;
}
