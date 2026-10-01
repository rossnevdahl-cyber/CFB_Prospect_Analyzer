import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  adpEntries,
  bigBoardRanks,
  boards,
  combineResults,
  historyPlayers,
  notes,
  pffImports,
  rosterPlayers,
} from "../db/schema";
import type { CombineRef } from "../athletic";
import type { HistoryRow } from "../grading";
import { normalizeName, normalizeSchool } from "../names";
import { parseCsv } from "../adapters/csv";
import { normalizePosition, type Combine, type Position } from "../types";
import type { AdpSpot, BigBoardSpot, BoardSpot, Note, RosterRow } from "./types";

export type PffSeason = { season: number; team: string | null; metrics: Record<string, number> };

/** Everything the report reads from Postgres, behind an interface so tests can use memory. */
export interface ReportRepo {
  rosterRows(cfbdId: string): Promise<RosterRow[]>;
  history(position: Position): Promise<HistoryRow[]>;
  combineRefs(position: Position): Promise<CombineRef[]>;
  combineFor(name: string, schools: string[], position: Position): Promise<Combine | null>;
  pff(cfbdId: string, name: string, schools: string[]): Promise<PffSeason[]>;
  bigBoard(cfbdId: string, name: string, schools: string[]): Promise<BigBoardSpot[]>;
  adp(cfbdId: string, name: string, schools: string[]): Promise<AdpSpot[]>;
  birthdate(cfbdId: string, name: string): Promise<{ date: string; source: string } | null>;
  boardSpot(cfbdId: string): Promise<BoardSpot | null>;
  notes(cfbdId: string): Promise<Note[]>;
}

/** Combine positions that map onto ours (nflverse uses e.g. "WR", "RB", "FB", "TE", "QB"). */
export function combinePositions(p: Position): string[] {
  return p === "RB" ? ["RB", "FB"] : [p];
}

/** Reads data/overrides/birthdates.csv (cfbd_id,name,birthdate,source). */
export function loadBirthdateOverrides(file = path.join(process.cwd(), "data", "overrides", "birthdates.csv")) {
  if (!fs.existsSync(file)) return [];
  return parseCsv(fs.readFileSync(file, "utf8"))
    .filter((r) => r.birthdate)
    .map((r) => ({ cfbdId: r.cfbd_id ?? "", nameNorm: normalizeName(r.name ?? ""), date: r.birthdate, source: r.source || "manual override" }));
}

/** Latest entry per source: the newest as-of date wins. */
function latestPerSource<T extends { source: string; asOf: string }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.source);
    if (!cur || r.asOf > cur.asOf) best.set(r.source, r);
  }
  return [...best.values()].sort((a, b) => b.asOf.localeCompare(a.asOf));
}

export class PgReportRepo implements ReportRepo {
  private overrides = loadBirthdateOverrides();

  async rosterRows(cfbdId: string): Promise<RosterRow[]> {
    const rows = await getDb().select().from(rosterPlayers).where(eq(rosterPlayers.cfbdId, cfbdId)).orderBy(asc(rosterPlayers.season));
    return rows.map((r) => ({ ...r, recruitIds: r.recruitIds ?? null }));
  }

  async history(position: Position): Promise<HistoryRow[]> {
    const rows = await getDb().select().from(historyPlayers).where(eq(historyPlayers.position, position));
    return rows.map((r) => ({
      id: r.id,
      cfbdId: r.cfbdId,
      name: r.name,
      position: r.position as Position,
      college: r.college,
      draftYear: r.draftYear,
      draftRound: r.draftRound,
      draftPick: r.draftPick,
      heightIn: r.heightIn,
      weight: r.weight,
      features: r.features,
      collegeLine: r.collegeLine,
      collegeComplete: r.collegeComplete,
      nflPpg: r.nflPpg,
      nflGames: r.nflGames,
    }));
  }

  async combineRefs(position: Position): Promise<CombineRef[]> {
    return getDb()
      .select({
        weight: combineResults.weight,
        forty: combineResults.forty,
        vertical: combineResults.vertical,
        broad: combineResults.broad,
        cone: combineResults.cone,
        shuttle: combineResults.shuttle,
        bench: combineResults.bench,
      })
      .from(combineResults)
      .where(inArray(combineResults.position, combinePositions(position)));
  }

  async combineFor(name: string, schools: string[], position: Position): Promise<Combine | null> {
    const rows = await getDb()
      .select()
      .from(combineResults)
      .where(and(eq(combineResults.nameNorm, normalizeName(name)), inArray(combineResults.position, combinePositions(position))))
      .orderBy(desc(combineResults.season));
    const norms = schools.map(normalizeSchool);
    const r = rows.find((x) => norms.includes(x.schoolNorm ?? "")) ?? (rows.length === 1 ? rows[0] : undefined);
    if (!r) return null;
    return {
      season: r.season,
      heightIn: r.heightIn,
      weight: r.weight,
      forty: r.forty,
      vertical: r.vertical,
      broad: r.broad,
      cone: r.cone,
      shuttle: r.shuttle,
      bench: r.bench,
      source: `nflverse combine ${r.season}`,
    };
  }

  async pff(cfbdId: string, name: string, schools: string[]): Promise<PffSeason[]> {
    const nameNorm = normalizeName(name);
    const rows = await getDb()
      .select()
      .from(pffImports)
      .where(or(eq(pffImports.cfbdId, cfbdId), eq(pffImports.nameNorm, nameNorm)));
    const norms = schools.map(normalizeSchool);
    return rows
      .filter((r) => r.cfbdId === cfbdId || !r.teamNorm || norms.includes(r.teamNorm))
      .map((r) => ({ season: r.season, team: r.team, metrics: r.metrics }));
  }

  async bigBoard(cfbdId: string, name: string, schools: string[]): Promise<BigBoardSpot[]> {
    const rows = await getDb()
      .select()
      .from(bigBoardRanks)
      .where(or(eq(bigBoardRanks.cfbdId, cfbdId), eq(bigBoardRanks.nameNorm, normalizeName(name))));
    const norms = schools.map(normalizeSchool);
    return latestPerSource(
      rows
        .filter((r) => r.cfbdId === cfbdId || !r.schoolNorm || norms.includes(r.schoolNorm))
        .map((r) => ({ source: r.source, rank: r.rank, projectedRound: r.projectedRound, asOf: r.asOf })),
    );
  }

  async adp(cfbdId: string, name: string, schools: string[]): Promise<AdpSpot[]> {
    const rows = await getDb()
      .select()
      .from(adpEntries)
      .where(or(eq(adpEntries.cfbdId, cfbdId), eq(adpEntries.nameNorm, normalizeName(name))));
    const norms = schools.map(normalizeSchool);
    const spots = rows
      .filter((r) => r.cfbdId === cfbdId || !r.schoolNorm || norms.includes(r.schoolNorm))
      .map((r) => ({ source: `${r.source} (${r.format})`, adp: r.adp, format: r.format, asOf: r.asOf }));
    return latestPerSource(spots).map((s) => ({ ...s, source: s.source.replace(/ \([^)]*\)$/, "") }));
  }

  async birthdate(cfbdId: string, name: string) {
    const nameNorm = normalizeName(name);
    const o = this.overrides.find((x) => x.cfbdId === cfbdId) ?? this.overrides.find((x) => !x.cfbdId && x.nameNorm === nameNorm);
    if (o) return { date: o.date, source: o.source };
    const [h] = await getDb()
      .select({ birthdate: historyPlayers.birthdate })
      .from(historyPlayers)
      .where(eq(historyPlayers.cfbdId, cfbdId))
      .limit(1);
    return h?.birthdate ? { date: h.birthdate, source: "nflverse players" } : null;
  }

  async boardSpot(cfbdId: string): Promise<BoardSpot | null> {
    const all = await getDb().select().from(boards);
    for (const b of all) {
      const idx = b.entries.findIndex((e) => e.cfbdId === cfbdId);
      if (idx < 0) continue;
      const me = b.entries[idx];
      const pos = normalizePosition(me.position);
      const positionRank = b.entries.slice(0, idx + 1).filter((e) => normalizePosition(e.position) === pos).length;
      return { classYear: b.classYear, rank: idx + 1, positionRank, tier: me.tier };
    }
    return null;
  }

  async notes(cfbdId: string): Promise<Note[]> {
    const rows = await getDb().select().from(notes).where(eq(notes.cfbdId, cfbdId)).orderBy(desc(notes.createdAt));
    return rows.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt?.toISOString() ?? null,
    }));
  }
}
