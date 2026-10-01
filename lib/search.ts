import "server-only";
import { desc, ilike, or } from "drizzle-orm";
import { getDb } from "./db";
import { rosterPlayers, teams } from "./db/schema";
import { normalizeName, prefixMatch, rankCandidates, type ScoredCandidate } from "./names";
import { cfbdAdapter } from "./services";
import { syncTeamRoster, upsertTeams } from "./sync";
import { normalizePosition, type Position } from "./types";

async function candidatesFor(name: string) {
  const tokens = normalizeName(name).split(" ").filter((t) => t.length >= 2);
  const last = tokens[tokens.length - 1] ?? "";
  const first = tokens[0] ?? "";
  if (!last) return [];
  // Matches on the start of the last token typed (autocomplete) or of the first name.
  const rows = await getDb()
    .select({
      cfbdId: rosterPlayers.cfbdId,
      name: rosterPlayers.fullName,
      team: rosterPlayers.team,
      position: rosterPlayers.position,
      classYear: rosterPlayers.classYear,
      season: rosterPlayers.season,
    })
    .from(rosterPlayers)
    .where(or(ilike(rosterPlayers.nameNorm, `%${last.slice(0, 5)}%`), ilike(rosterPlayers.nameNorm, `${first.slice(0, 5)}%`)))
    .orderBy(desc(rosterPlayers.season))
    .limit(3000);
  return rows;
}

export type SearchResult = { exact: ScoredCandidate | null; candidates: ScoredCandidate[]; synced: boolean };

/**
 * Resolves name + college + position to a CFBD id from the cached roster table. If nothing close
 * turns up, it pulls the named team's rosters (or CFBD player search's teams) and tries again.
 */
export async function searchPlayers(q: { name: string; team?: string; position?: Position }): Promise<SearchResult> {
  const run = async () => rankCandidates(q, await candidatesFor(q.name), normalizePosition);
  let res = await run();
  const strong = res.candidates.some((c) => c.nameScore >= 0.85 && (!q.team || c.team === q.team));
  if (res.exact || strong) return { ...res, synced: false };

  const cfbd = cfbdAdapter();
  const teamsToSync = new Set<string>();
  if (q.team) teamsToSync.add(q.team);
  else {
    const found = await cfbd.searchPlayers(q.name, { position: q.position }).catch(() => []);
    for (const f of found.slice(0, 3)) teamsToSync.add(f.team);
  }
  for (const t of teamsToSync) await syncTeamRoster(cfbd, t).catch(() => 0);
  res = await run();
  return { ...res, synced: teamsToSync.size > 0 };
}

/** FBS teams for the college dropdown; loaded from CFBD on first use. */
export async function listTeams(): Promise<{ school: string; conference: string | null }[]> {
  const db = getDb();
  let rows = await db.select({ school: teams.school, conference: teams.conference }).from(teams).orderBy(teams.school);
  if (!rows.length && process.env.CFBD_API_KEY) {
    await upsertTeams(await cfbdAdapter().fbsTeams());
    rows = await db.select({ school: teams.school, conference: teams.conference }).from(teams).orderBy(teams.school);
  }
  return rows;
}

/** Autocomplete from the newest cached rosters: prefix matches, college and position first. */
export async function autocomplete(q: string, team?: string, position?: string) {
  if (normalizeName(q).length < 2) return [];
  const latest = new Map<string, Awaited<ReturnType<typeof candidatesFor>>[number]>();
  for (const r of await candidatesFor(q)) {
    if (!prefixMatch(q, r.name)) continue;
    const prev = latest.get(r.cfbdId);
    if (!prev || r.season > prev.season) latest.set(r.cfbdId, r);
  }
  const score = (r: { team: string; position: string | null; season: number }) =>
    (team && r.team === team ? 4 : 0) + (position && normalizePosition(r.position) === position ? 2 : 0) + r.season / 10000;
  return [...latest.values()]
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, 10)
    .map((c) => ({ cfbdId: c.cfbdId, name: c.name, team: c.team, position: c.position, classYear: c.classYear }));
}
