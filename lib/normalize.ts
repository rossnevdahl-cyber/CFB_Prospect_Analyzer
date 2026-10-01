import type {
  AdvancedSeasonStat,
  Game,
  GamePlayerStats,
  PlayerSeasonPredictedPointsAdded,
  PlayerStat,
  PlayerUsage,
  Recruit,
  TeamSP,
  TeamStat,
} from "cfbd";
import { seasonStatsSchema, type Recruiting, type SeasonStats, type TeamSeason } from "./types";
import { normalizeName, normalizeSchool } from "./names";

/** Average sack yardage lost in FBS; used only when a QB's sack yards are not reported. */
export const EST_SACK_YARDS = 6.5;

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Collapses CFBD's long-format player season stats into one row per player-team-season. */
export function playerSeasonsFromStats(rows: PlayerStat[], playerId: string): SeasonStats[] {
  const byKey = new Map<string, PlayerStat[]>();
  for (const r of rows) {
    if (String(r.playerId) !== String(playerId)) continue;
    const k = `${r.season}|${r.team}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  return [...byKey.values()].map((rs) => {
    const get = (cat: string, type: string) =>
      num(rs.find((r) => r.category.toLowerCase() === cat && r.statType.toUpperCase() === type)?.stat);
    return seasonStatsSchema.parse({
      season: rs[0].season,
      team: rs[0].team,
      conference: rs[0].conference ?? null,
      games: null,
      passCmp: get("passing", "COMPLETIONS"),
      passAtt: get("passing", "ATT"),
      passYds: get("passing", "YDS"),
      passTd: get("passing", "TD"),
      passInt: get("passing", "INT"),
      rushAtt: get("rushing", "CAR"),
      rushYds: get("rushing", "YDS"),
      rushTd: get("rushing", "TD"),
      rec: get("receiving", "REC"),
      recYds: get("receiving", "YDS"),
      recTd: get("receiving", "TD"),
    });
  });
}

/** Distinct games in which the player recorded any stat. */
export function gamesPlayed(games: GamePlayerStats[], playerId: string): number | null {
  if (!games.length) return null;
  let n = 0;
  for (const g of games) {
    const found = g.teams.some((t) =>
      t.categories.some((c) => c.types.some((ty) => ty.athletes.some((a) => String(a.id) === String(playerId)))),
    );
    if (found) n++;
  }
  return n;
}

export function applyPpa(s: SeasonStats, ppa: PlayerSeasonPredictedPointsAdded | undefined, usage?: PlayerUsage): SeasonStats {
  return {
    ...s,
    epaPass: ppa?.averagePPA.pass ?? s.epaPass,
    epaRush: ppa?.averagePPA.rush ?? s.epaRush,
    epaAll: ppa?.averagePPA.all ?? s.epaAll,
    usage: usage?.usage.overall ?? s.usage,
  };
}

/** Allocates team sacks allowed to a QB by his share of team pass attempts. */
export function estimateSacks(s: SeasonStats, team: TeamSeason | undefined): SeasonStats {
  if (s.passAtt === 0 || s.sacks != null || !team?.sacksAllowed || !team.passAtt) return s;
  const sacks = Math.round((team.sacksAllowed * s.passAtt) / team.passAtt);
  return { ...s, sacks, sackYds: Math.round(sacks * EST_SACK_YARDS), sacksEstimated: true };
}

function teamStatMap(rows: TeamStat[], team: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.team === team) m.set(r.statName, num(r.statValue));
  return m;
}

function pick(m: Map<string, number>, ...names: string[]): number | null {
  for (const n of names) if (m.has(n)) return m.get(n) as number;
  return null;
}

/** 1-based rank of `value` among `values` (descending when higherIsBetter). */
function rankOf(value: number | null, values: number[], higherIsBetter: boolean): number | null {
  if (value == null) return null;
  return values.filter((v) => (higherIsBetter ? v > value : v < value)).length + 1;
}

/** Average SP+ rating of FBS opponents faced, for every team in the season. */
export function strengthOfSchedule(games: Game[], sp: TeamSP[]): Map<string, number> {
  const rating = new Map(sp.map((t) => [t.team, t.rating]));
  const acc = new Map<string, { sum: number; n: number }>();
  const add = (team: string, opp: string) => {
    const r = rating.get(opp);
    if (r == null) return;
    const a = acc.get(team) ?? { sum: 0, n: 0 };
    a.sum += r;
    a.n++;
    acc.set(team, a);
  };
  for (const g of games) {
    add(g.homeTeam, g.awayTeam);
    add(g.awayTeam, g.homeTeam);
  }
  return new Map([...acc].map(([t, a]) => [t, a.sum / a.n]));
}

/** Builds the team context row for one team-season from season-wide CFBD pulls. */
export function buildTeamSeason(
  year: number,
  team: string,
  input: { teamStats: TeamStat[]; advanced: AdvancedSeasonStat[]; sp: TeamSP[]; games: Game[] },
): TeamSeason {
  const m = teamStatMap(input.teamStats, team);
  const fbs = new Set(input.sp.map((t) => t.team));
  const adv = input.advanced.filter((a) => fbs.size === 0 || fbs.has(a.team));
  const mine = adv.find((a) => a.team === team);
  const gamesOf = (t: string) => pick(teamStatMap(input.teamStats, t), "games");
  const paceOf = (a: AdvancedSeasonStat) => {
    const g = gamesOf(a.team);
    return g ? a.offense.plays / g : null;
  };
  const paces = adv.map(paceOf).filter((v): v is number => v != null);
  const passEpas = adv.map((a) => a.offense.passingPlays.ppa);
  const lineYds = adv.map((a) => a.offense.lineYards);
  const sosMap = strengthOfSchedule(input.games, input.sp);
  const sosValues = [...sosMap].filter(([t]) => fbs.has(t)).map(([, v]) => v);
  const spRow = input.sp.find((t) => t.team === team);
  const sos = sosMap.get(team) ?? null;

  return {
    season: year,
    team,
    games: pick(m, "games"),
    passAtt: pick(m, "passAttempts"),
    passYds: pick(m, "netPassingYards", "passingYards"),
    passTd: pick(m, "passingTDs"),
    rushAtt: pick(m, "rushingAttempts"),
    rushYds: pick(m, "rushingYards"),
    rushTd: pick(m, "rushingTDs"),
    sacksAllowed: pick(m, "sacksOpponent", "sacksAllowed"),
    plays: mine?.offense.plays ?? null,
    passEpa: mine?.offense.passingPlays.ppa ?? null,
    passEpaRank: rankOf(mine?.offense.passingPlays.ppa ?? null, passEpas, true),
    paceRank: rankOf(mine ? paceOf(mine) : null, paces, true),
    lineYards: mine?.offense.lineYards ?? null,
    oLineRank: rankOf(mine?.offense.lineYards ?? null, lineYds, true),
    spRating: spRow?.rating ?? null,
    spRank: spRow?.ranking ?? null,
    sos,
    sosRank: rankOf(sos, sosValues, true),
    fbsTeams: fbs.size || adv.length || null,
  };
}

/** Finds the player's high-school recruiting record and computes their position rank in that class. */
export function matchRecruit(
  recruits: Recruit[],
  player: { cfbdId: string; name: string; recruitIds: string[] | null; firstTeam: string | null },
): Recruit | null {
  const ids = new Set(player.recruitIds ?? []);
  const byId = recruits.find((r) => ids.has(String(r.id)) || (r.athleteId != null && String(r.athleteId) === player.cfbdId));
  if (byId) return byId;
  const n = normalizeName(player.name);
  const sameName = recruits.filter((r) => normalizeName(r.name) === n);
  if (sameName.length === 1) return sameName[0];
  return sameName.find((r) => normalizeSchool(r.committedTo) === normalizeSchool(player.firstTeam)) ?? null;
}

export function recruitingFrom(r: Recruit, classAtPosition: Recruit[]): Recruiting {
  const ranked = classAtPosition.filter((x) => x.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const idx = ranked.findIndex((x) => x.id === r.id);
  return {
    year: r.year,
    stars: r.stars,
    rating: r.rating,
    nationalRank: r.ranking,
    positionRank: idx >= 0 ? idx + 1 : null,
    recruitPosition: r.position,
    school: r.school,
    committedTo: r.committedTo,
  };
}
