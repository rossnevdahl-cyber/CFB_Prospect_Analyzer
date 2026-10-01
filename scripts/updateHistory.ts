/**
 * update-history: rebuilds the historical table from CFBD and nflverse.
 *   pnpm update:history [--from 2006] [--to 2026]
 *
 * For every drafted QB/RB/WR/TE: CFBD draft pick (which carries the CFBD athlete id) joined to the
 * nflverse pick by draft year + overall pick (gsis/pfr ids), college stats from CFBD season-wide pulls,
 * combine, birthdate and NFL years 1–3 fantasy PPG from nflverse. Also reloads the combine table
 * and writes docs/data-coverage.md (coverage depth and ID match rates).
 */
import fs from "node:fs";
import path from "node:path";
import type { PlayerStat, Recruit } from "cfbd";
import { closeDb, getDb, hasDatabase } from "../lib/db";
import { combineResults, historyPlayers } from "../lib/db/schema";
import {
  downloadText,
  NFLVERSE_FILES,
  parseCombine,
  parseDraftPicks,
  parsePlayers,
  parseSeasonStats,
  type NflCombine,
  type NflSeasonRow,
} from "../lib/adapters/nflverse";
import { loadGradingConfig } from "../lib/config";
import { computeHistoryPlayer, draftPosition } from "../lib/history";
import { normalizeName, normalizeSchool } from "../lib/names";
import { applyPpa, buildTeamSeason, playerSeasonsFromStats } from "../lib/normalize";
import { POSITIONS, type Position, type SeasonStats, type TeamSeason } from "../lib/types";
import { arg, jobCfbd, log } from "./env";

/** CFBD player box scores begin in 2004. */
const COVERAGE_START = 2004;
const MAX_COLLEGE_YEARS = 6;

async function main() {
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set");
  const config = loadGradingConfig();
  const cfbd = jobCfbd();
  const now = new Date();
  const latestDraft = now.getUTCMonth() >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const from = Number(arg("from") ?? COVERAGE_START + 2);
  const to = Number(arg("to") ?? latestDraft);

  log("downloading nflverse releases…");
  const [picksCsv, combineCsv, playersCsv, statsCsv] = await Promise.all(
    [NFLVERSE_FILES.draftPicks, NFLVERSE_FILES.combine, NFLVERSE_FILES.players, NFLVERSE_FILES.seasonStats].map((u) => downloadText(u)),
  );
  const nflPicks = parseDraftPicks(picksCsv);
  const combine = parseCombine(combineCsv).filter((c) => draftPosition(c.position));
  const players = new Map(parsePlayers(playersCsv).map((p) => [p.gsisId, p]));
  const nflStats = new Map<string, NflSeasonRow[]>();
  for (const s of parseSeasonStats(statsCsv)) nflStats.set(s.playerId, [...(nflStats.get(s.playerId) ?? []), s]);
  log(`nflverse: ${nflPicks.length} picks, ${combine.length} combine rows, ${players.size} players`);

  // Combine reference table.
  const db = getDb();
  await db.delete(combineResults);
  const combineRows = combine.map((c) => ({
    season: c.season ?? c.draftYear ?? 0,
    pfrId: c.pfrId,
    cfbId: c.cfbId,
    playerName: c.name,
    nameNorm: normalizeName(c.name),
    position: c.position,
    school: c.school,
    schoolNorm: normalizeSchool(c.school),
    heightIn: c.heightIn,
    weight: c.weight,
    forty: c.forty,
    bench: c.bench,
    vertical: c.vertical,
    broad: c.broad,
    cone: c.cone,
    shuttle: c.shuttle,
  }));
  for (let i = 0; i < combineRows.length; i += 1000) await db.insert(combineResults).values(combineRows.slice(i, i + 1000));
  log(`combine_results: ${combineRows.length}`);

  const refsByPos = new Map<Position, NflCombine[]>();
  for (const p of POSITIONS) refsByPos.set(p, combine.filter((c) => draftPosition(c.position) === p));

  // Season-wide CFBD pulls, memoized per year.
  const seasonMemo = new Map<number, Promise<{ stats: Map<string, SeasonStats[]>; teams: Map<string, TeamSeason> }>>();
  const loadSeason = (year: number) => {
    if (!seasonMemo.has(year)) {
      seasonMemo.set(
        year,
        (async () => {
          const cats = await Promise.all(["passing", "rushing", "receiving"].map((c) => cfbd.playerSeasonStatsByCategory(year, c)));
          const byPlayer = new Map<string, PlayerStat[]>();
          for (const r of cats.flat()) byPlayer.set(String(r.playerId), [...(byPlayer.get(String(r.playerId)) ?? []), r]);
          const ppa = (await Promise.all(POSITIONS.map((p) => cfbd.ppaPlayers(year, undefined, p).catch(() => [])))).flat();
          const ppaById = new Map(ppa.map((p) => [String(p.id), p]));
          const stats = new Map<string, SeasonStats[]>();
          for (const [id, rows] of byPlayer) stats.set(id, playerSeasonsFromStats(rows, id).map((s) => applyPpa(s, ppaById.get(id))));
          const [teamStats, advanced, sp, games] = await Promise.all([
            cfbd.teamSeasonStats(year),
            cfbd.advancedSeasonStats(year).catch(() => []),
            cfbd.sp(year).catch(() => []),
            cfbd.games(year).catch(() => []),
          ]);
          const teamNames = new Set(teamStats.map((t) => t.team));
          const teams = new Map([...teamNames].map((t) => [t, buildTeamSeason(year, t, { teamStats, advanced, sp, games })]));
          log(`  season ${year}: ${stats.size} players, ${teams.size} teams`);
          return { stats, teams };
        })(),
      );
    }
    return seasonMemo.get(year)!;
  };

  const recruitMemo = new Map<number, Promise<Map<string, Recruit>>>();
  const loadRecruits = (year: number) => {
    if (!recruitMemo.has(year)) {
      recruitMemo.set(year, cfbd.recruits(year).then((rs) => new Map(rs.filter((r) => r.athleteId).map((r) => [String(r.athleteId), r]))).catch(() => new Map()));
    }
    return recruitMemo.get(year)!;
  };

  const coverage = { years: [] as string[], drafted: 0, cfbdId: 0, nflJoin: 0, withStats: 0, complete: 0, birthdate: 0, combine: 0, ppg: 0, recruit: 0 };
  const rows: (typeof historyPlayers.$inferInsert)[] = [];

  for (let year = from; year <= to; year++) {
    const picks = (await cfbd.draftPicks(year)).filter((p) => draftPosition(p.position));
    const nflByPick = new Map(nflPicks.filter((p) => p.season === year).map((p) => [p.pick, p]));
    let yearWithStats = 0;
    for (const pick of picks) {
      const position = draftPosition(pick.position)!;
      coverage.drafted++;
      const nfl = nflByPick.get(pick.overall) ?? null;
      if (nfl && normalizeName(nfl.name).split(" ").pop() === normalizeName(pick.name).split(" ").pop()) coverage.nflJoin++;
      const cfbdId = pick.collegeAthleteId != null ? String(pick.collegeAthleteId) : null;
      if (cfbdId) coverage.cfbdId++;

      const stats: SeasonStats[] = [];
      const teams: TeamSeason[] = [];
      if (cfbdId) {
        for (let y = year - MAX_COLLEGE_YEARS; y < year; y++) {
          if (y < COVERAGE_START) continue;
          const s = await loadSeason(y);
          for (const row of s.stats.get(cfbdId) ?? []) {
            stats.push(row);
            const t = s.teams.get(row.team);
            if (t) teams.push(t);
          }
        }
      }
      if (stats.length) {
        coverage.withStats++;
        yearWithStats++;
      }

      const gsis = nfl?.gsisId ?? null;
      const birthdate = gsis ? players.get(gsis)?.birthDate ?? null : null;
      if (birthdate) coverage.birthdate++;
      const refs = refsByPos.get(position) ?? [];
      const cmb =
        (nfl?.pfrId ? combine.find((c) => c.pfrId === nfl.pfrId) : undefined) ??
        combine.find((c) => c.draftYear === year && normalizeName(c.name) === normalizeName(pick.name)) ??
        null;
      if (cmb) coverage.combine++;

      let recruitRating: number | null = null;
      if (cfbdId) {
        const firstSeason = stats.length ? Math.min(...stats.map((s) => s.season)) : year - 4;
        for (const y of [firstSeason, firstSeason - 1, firstSeason + 1]) {
          const r = (await loadRecruits(y)).get(cfbdId);
          if (r) {
            recruitRating = r.rating;
            break;
          }
        }
      }
      if (recruitRating != null) coverage.recruit++;

      const computed = computeHistoryPlayer({
        position,
        draftYear: year,
        overallPick: pick.overall,
        stats,
        teams,
        birthdate,
        combine: cmb,
        combineRefs: refs,
        recruitRating,
        nflSeasons: gsis ? (nflStats.get(gsis) ?? []) : [],
        config,
        coverageStart: COVERAGE_START,
      });
      if (computed.collegeComplete) coverage.complete++;
      if (computed.nflPpg != null) coverage.ppg++;

      rows.push({
        id: `${year}-${pick.overall}`,
        cfbdId,
        gsisId: gsis,
        pfrId: nfl?.pfrId ?? null,
        name: pick.name,
        position,
        college: pick.collegeTeam,
        draftYear: year,
        draftRound: pick.round,
        draftPick: pick.overall,
        birthdate,
        heightIn: cmb?.heightIn ?? pick.height,
        weight: cmb?.weight ?? pick.weight,
        features: computed.features,
        collegeSeasons: stats,
        collegeLine: computed.collegeLine,
        collegeComplete: computed.collegeComplete,
        nflPpg: computed.nflPpg,
        nflGames: computed.nflGames,
        updatedAt: new Date(),
      });
    }
    coverage.years.push(`| ${year} | ${picks.length} | ${yearWithStats} |`);
    log(`draft ${year}: ${picks.length} QB/RB/WR/TE, ${yearWithStats} with CFBD stats`);
  }

  await db.delete(historyPlayers);
  for (let i = 0; i < rows.length; i += 200) await db.insert(historyPlayers).values(rows.slice(i, i + 200));
  log(`history_players: ${rows.length} rows · ${cfbd.stats.calls} CFBD lookups (${cfbd.stats.cacheHits} cached)`);

  const pct = (n: number) => `${n} (${coverage.drafted ? ((n / coverage.drafted) * 100).toFixed(1) : 0}%)`;
  const doc = `# Data coverage

_Generated by \`update-history\` on ${new Date().toISOString().slice(0, 10)} for draft classes ${from}–${to}._

| Measure | Players |
| --- | ---: |
| Drafted QB/RB/WR/TE (CFBD draft picks) | ${coverage.drafted} |
| CFBD athlete id on the pick | ${pct(coverage.cfbdId)} |
| Joined to nflverse pick (year + overall pick, last name agrees) | ${pct(coverage.nflJoin)} |
| CFBD college stats found | ${pct(coverage.withStats)} |
| Full college career in CFBD (eligible as comps) | ${pct(coverage.complete)} |
| Birthdate (nflverse) | ${pct(coverage.birthdate)} |
| Combine results (nflverse) | ${pct(coverage.combine)} |
| Recruiting composite (CFBD) | ${pct(coverage.recruit)} |
| NFL years 1–3 fantasy PPG | ${pct(coverage.ppg)} |

CFBD player box scores start in ${COVERAGE_START}; players whose careers began earlier are kept for percentiles but excluded from comps.
Games played in history rows use team games (per-game box scores would cost one call per team-season).

| Draft | QB/RB/WR/TE | With CFBD stats |
| ---: | ---: | ---: |
${coverage.years.join("\n")}
`;
  fs.mkdirSync(path.join(process.cwd(), "docs"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "docs", "data-coverage.md"), doc);
  log("wrote docs/data-coverage.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
