import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { parseRankingsText, type RankingRow } from "./adapters/rankingsText";
import { buildConsensus, type ConsensusEntry, type SourceSnapshot } from "./consensus";
import { getDb } from "./db";
import { bigBoardRanks, fantasyRankings, importLog, rosterPlayers } from "./db/schema";
import { normalizeName, normalizeSchool } from "./names";
import { resolveMatch, type MatchResult, type RosterRef } from "./rankingMatch";

export const RANKING_FORMATS = ["superflex", "1qb"] as const;
export type RankingFormat = (typeof RANKING_FORMATS)[number];

export type PreviewRow = RankingRow & { match: MatchResult };
export type Preview = { layout: string; rows: PreviewRow[]; skipped: string[] };

/** Roster rows that could match any of the names: exact normalized names plus same-last-name rows. */
async function rosterCandidates(names: string[]): Promise<RosterRef[]> {
  const norms = [...new Set(names.map(normalizeName))].filter(Boolean);
  if (!norms.length) return [];
  const lasts = [...new Set(norms.map((n) => n.split(" ").pop() as string).filter((l) => l.length >= 3))];
  const db = getDb();
  const cols = {
    cfbdId: rosterPlayers.cfbdId,
    name: rosterPlayers.fullName,
    nameNorm: rosterPlayers.nameNorm,
    team: rosterPlayers.team,
    position: rosterPlayers.position,
    classYear: rosterPlayers.classYear,
    season: rosterPlayers.season,
  };
  const exact = await db.select(cols).from(rosterPlayers).where(inArray(rosterPlayers.nameNorm, norms));
  const fuzzy: RosterRef[] = [];
  // Last-name lookups for the spelling-variant fallback, in chunks to keep queries small.
  for (let i = 0; i < lasts.length; i += 40) {
    const chunk = lasts.slice(i, i + 40);
    fuzzy.push(...(await db.select(cols).from(rosterPlayers).where(or(...chunk.map((l) => ilike(rosterPlayers.nameNorm, `% ${l.slice(0, 5)}%`))))));
  }
  return [...exact, ...fuzzy];
}

/** Parses pasted text and matches every row, without saving anything. */
export async function previewRankings(text: string): Promise<Preview> {
  const parsed = parseRankingsText(text);
  const roster = await rosterCandidates(parsed.rows.map((r) => r.name));
  const byLast = new Map<string, RosterRef[]>();
  for (const r of roster) {
    const last = r.nameNorm.split(" ").pop() as string;
    byLast.set(last.slice(0, 5), [...(byLast.get(last.slice(0, 5)) ?? []), r]);
  }
  const rows = parsed.rows.map((row) => {
    const n = normalizeName(row.name);
    const last = (n.split(" ").pop() ?? "").slice(0, 5);
    const pool = [...roster.filter((r) => r.nameNorm === n), ...(byLast.get(last) ?? [])];
    return { ...row, match: resolveMatch(row, pool) };
  });
  return { layout: parsed.layout, rows, skipped: parsed.skipped };
}

export type SaveRankingsInput = {
  source: string;
  asOf: string;
  format: RankingFormat;
  classYear: number;
  rows: (RankingRow & { cfbdId: string | null })[];
};

/**
 * Saves one dated snapshot. Re-saving the same source, date, format and class replaces it.
 * NFL board ranks that came with the paste (MDDB's "BB #") also feed draft capital.
 */
export async function saveRankings(input: SaveRankingsInput): Promise<{ saved: number; matched: number; nflRanks: number }> {
  const db = getDb();
  const key = and(
    eq(fantasyRankings.source, input.source),
    eq(fantasyRankings.asOf, input.asOf),
    eq(fantasyRankings.format, input.format),
    eq(fantasyRankings.classYear, input.classYear),
  );
  await db.delete(fantasyRankings).where(key);
  if (input.rows.length) {
    await db.insert(fantasyRankings).values(
      input.rows.map((r) => ({
        source: input.source,
        asOf: input.asOf,
        format: input.format,
        classYear: input.classYear,
        rank: r.rank,
        cfbdId: r.cfbdId,
        playerName: r.name,
        nameNorm: normalizeName(r.name),
        school: r.school,
        schoolNorm: normalizeSchool(r.school),
        position: r.position,
        nflRank: r.nflRank,
      })),
    );
  }
  const nfl = input.rows.filter((r) => r.nflRank != null);
  if (nfl.length) {
    const nflSource = `${input.source} (NFL board)`;
    await db.delete(bigBoardRanks).where(and(eq(bigBoardRanks.source, nflSource), eq(bigBoardRanks.asOf, input.asOf)));
    await db.insert(bigBoardRanks).values(
      nfl.map((r) => ({
        cfbdId: r.cfbdId,
        playerName: r.name,
        nameNorm: normalizeName(r.name),
        school: r.school,
        schoolNorm: normalizeSchool(r.school),
        position: r.position,
        rank: r.nflRank as number,
        projectedRound: null,
        source: nflSource,
        asOf: input.asOf,
      })),
    );
  }
  const matched = input.rows.filter((r) => r.cfbdId).length;
  await db.insert(importLog).values({ kind: `rankings:${input.source}`, fileName: `${input.classYear} ${input.format}`, rows: input.rows.length, matched });
  return { saved: input.rows.length, matched, nflRanks: nfl.length };
}

export type RankingSet = { classYear: number; format: string; source: string; asOf: string; players: number };

/** Latest snapshot per source, for every class and format. */
export async function listRankingSets(): Promise<RankingSet[]> {
  const rows = await getDb()
    .select({
      classYear: fantasyRankings.classYear,
      format: fantasyRankings.format,
      source: fantasyRankings.source,
      asOf: fantasyRankings.asOf,
      players: sql<number>`count(*)::int`,
    })
    .from(fantasyRankings)
    .groupBy(fantasyRankings.classYear, fantasyRankings.format, fantasyRankings.source, fantasyRankings.asOf)
    .orderBy(desc(fantasyRankings.classYear), fantasyRankings.format, fantasyRankings.source, desc(fantasyRankings.asOf));
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.classYear}|${r.format}|${r.source}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Each source's latest snapshot for one draft class and format. */
export async function latestSnapshots(classYear: number, format: string): Promise<SourceSnapshot[]> {
  const sets = (await listRankingSets()).filter((s) => s.classYear === classYear && s.format === format);
  const out: SourceSnapshot[] = [];
  for (const s of sets) {
    const rows = await getDb()
      .select()
      .from(fantasyRankings)
      .where(and(eq(fantasyRankings.classYear, classYear), eq(fantasyRankings.format, format), eq(fantasyRankings.source, s.source), eq(fantasyRankings.asOf, s.asOf)))
      .orderBy(fantasyRankings.rank);
    out.push({
      source: s.source,
      asOf: s.asOf,
      rows: rows.map((r) => ({ cfbdId: r.cfbdId, name: r.playerName, nameNorm: r.nameNorm, schoolNorm: r.schoolNorm, school: r.school, position: r.position, rank: r.rank })),
    });
  }
  return out;
}

export async function consensusFor(classYear: number, format: string): Promise<{ snapshots: SourceSnapshot[]; consensus: ConsensusEntry[] }> {
  const snapshots = await latestSnapshots(classYear, format);
  return { snapshots, consensus: buildConsensus(snapshots) };
}
