import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { parseAdpCsv } from "./adapters/adpCsv";
import { parsePffCsv } from "./adapters/pffCsv";
import { RANKING_LIMIT } from "./adapters/rankingsText";
import { getDb } from "./db";
import { adpEntries, importLog, pffImports, rosterPlayers } from "./db/schema";
import { normalizeName, normalizeSchool } from "./names";
import { normalizePosition } from "./types";

type Matchable = { playerName: string; school: string | null; position: string | null };

/**
 * Matches import rows to CFBD ids by normalized name, then school, then position. Unmatched rows
 * are still stored and matched by name + school when a report is built.
 */
export async function matchToRoster(rows: Matchable[]): Promise<(string | null)[]> {
  const names = [...new Set(rows.map((r) => normalizeName(r.playerName)))];
  if (!names.length) return [];
  const roster = await getDb()
    .select({ cfbdId: rosterPlayers.cfbdId, nameNorm: rosterPlayers.nameNorm, team: rosterPlayers.team, position: rosterPlayers.position })
    .from(rosterPlayers)
    .where(inArray(rosterPlayers.nameNorm, names));
  return rows.map((r) => {
    const n = normalizeName(r.playerName);
    let hits = [...new Map(roster.filter((x) => x.nameNorm === n).map((x) => [x.cfbdId, x])).values()];
    if (r.school) {
      const s = normalizeSchool(r.school);
      const bySchool = hits.filter((x) => normalizeSchool(x.team) === s);
      if (bySchool.length) hits = bySchool;
    }
    if (hits.length > 1 && r.position) {
      const p = normalizePosition(r.position);
      const byPos = hits.filter((x) => normalizePosition(x.position) === p);
      if (byPos.length) hits = byPos;
    }
    return hits.length === 1 ? hits[0].cfbdId : null;
  });
}

export type ImportResult = { kind: string; rows: number; matched: number; issues: { line: number; message: string }[]; unmatched: string[]; total?: number };

export async function importPff(text: string, fileName: string, season: number): Promise<ImportResult> {
  const { rows, issues } = parsePffCsv(text, season);
  const ids = await matchToRoster(rows.map((r) => ({ playerName: r.playerName, school: r.team, position: r.position })));
  const db = getDb();
  for (const [i, r] of rows.entries()) {
    const v = {
      cfbdId: ids[i],
      playerName: r.playerName,
      nameNorm: normalizeName(r.playerName),
      team: r.team,
      teamNorm: normalizeSchool(r.team),
      position: r.position,
      season: r.season,
      metrics: r.metrics,
      fileName,
      importedAt: new Date(),
    };
    // A second export for the same player-season (e.g. receiving after passing) merges metrics.
    const [prev] = await db
      .select()
      .from(pffImports)
      .where(and(eq(pffImports.nameNorm, v.nameNorm), eq(pffImports.teamNorm, v.teamNorm), eq(pffImports.season, v.season)))
      .limit(1);
    if (prev) await db.update(pffImports).set({ ...v, cfbdId: v.cfbdId ?? prev.cfbdId, metrics: { ...prev.metrics, ...v.metrics } }).where(eq(pffImports.id, prev.id));
    else await db.insert(pffImports).values(v);
  }
  return log("pff", fileName, rows.map((r) => r.playerName), ids, issues);
}

export async function importAdp(text: string, fileName: string, source: string, asOf: string, format: string): Promise<ImportResult> {
  const parsed = parseAdpCsv(text);
  const issues = parsed.issues;
  // Only the 50 earliest-drafted players, matching the cap on fantasy rookie rankings.
  const rows = [...parsed.rows].sort((a, b) => a.adp - b.adp).slice(0, RANKING_LIMIT);
  const ids = await matchToRoster(rows);
  const db = getDb();
  await db.delete(adpEntries).where(and(eq(adpEntries.source, source), eq(adpEntries.asOf, asOf), eq(adpEntries.format, format)));
  if (rows.length) {
    await db.insert(adpEntries).values(
      rows.map((r, i) => ({
        cfbdId: ids[i],
        playerName: r.playerName,
        nameNorm: normalizeName(r.playerName),
        school: r.school,
        schoolNorm: normalizeSchool(r.school),
        position: r.position,
        adp: r.adp,
        format,
        source,
        asOf,
      })),
    );
  }
  return { ...(await log("adp", fileName, rows.map((r) => r.playerName), ids, issues)), total: parsed.rows.length };
}

async function log(kind: string, fileName: string, names: string[], ids: (string | null)[], issues: ImportResult["issues"]): Promise<ImportResult> {
  const matched = ids.filter(Boolean).length;
  await getDb().insert(importLog).values({ kind, fileName, rows: names.length, matched });
  return { kind, rows: names.length, matched, issues, unmatched: names.filter((_, i) => !ids[i]).slice(0, 50) };
}
