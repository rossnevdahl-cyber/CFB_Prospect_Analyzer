import "server-only";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "./db";
import { boardSnapshots, boards, notes, reports } from "./db/schema";
import { addEntry, DEFAULT_TIERS, removeEntry, sameOrder, type BoardEntry, type BoardGrades, type BoardTier } from "./boards";

export type Board = { classYear: number; tiers: BoardTier[]; entries: BoardEntry[]; updatedAt: Date | null };

export async function getBoard(classYear: number): Promise<Board> {
  const [row] = await getDb().select().from(boards).where(eq(boards.classYear, classYear)).limit(1);
  return row ?? { classYear, tiers: DEFAULT_TIERS, entries: [], updatedAt: null };
}

export async function listBoards(): Promise<{ classYear: number; count: number }[]> {
  const rows = await getDb().select().from(boards).orderBy(asc(boards.classYear));
  return rows.map((b) => ({ classYear: b.classYear, count: b.entries.length }));
}

/** Saves a board; a changed order or tier assignment is also recorded as a dated snapshot. */
export async function saveBoard(classYear: number, entries: BoardEntry[], tiers?: BoardTier[]): Promise<Board> {
  const db = getDb();
  const prev = await getBoard(classYear);
  const next = { classYear, entries, tiers: tiers ?? prev.tiers, updatedAt: new Date() };
  await db.insert(boards).values(next).onConflictDoUpdate({ target: boards.classYear, set: next });
  if (!sameOrder(prev.entries, entries) || JSON.stringify(prev.tiers) !== JSON.stringify(next.tiers)) {
    await db.insert(boardSnapshots).values({ classYear, entries, tiers: next.tiers, takenAt: next.updatedAt });
  }
  return next;
}

/** A player sits on exactly one class board: adding removes them from any other. */
export async function addToBoard(classYear: number, entry: BoardEntry): Promise<void> {
  const all = await getDb().select().from(boards);
  for (const b of all) {
    if (b.classYear !== classYear && b.entries.some((e) => e.cfbdId === entry.cfbdId)) {
      await saveBoard(b.classYear, removeEntry(b.entries, entry.cfbdId));
    }
  }
  const board = await getBoard(classYear);
  const existing = all.flatMap((b) => b.entries).find((e) => e.cfbdId === entry.cfbdId);
  await saveBoard(classYear, addEntry(board.entries, { ...entry, tier: board.tiers.some((t) => t.label === existing?.tier) ? existing!.tier : null }));
}

export async function boardGrades(cfbdIds: string[]): Promise<BoardGrades> {
  if (!cfbdIds.length) return {};
  const rows = await getDb()
    .select({ cfbdId: reports.cfbdId, grade: reports.grade, tier: reports.tier })
    .from(reports)
    .where(inArray(reports.cfbdId, cfbdIds));
  return Object.fromEntries(rows.map((r) => [r.cfbdId, { grade: r.grade == null ? null : Math.round(r.grade * 10) / 10, tier: r.tier }]));
}

export async function listSnapshots(classYear: number) {
  return getDb()
    .select({ id: boardSnapshots.id, takenAt: boardSnapshots.takenAt })
    .from(boardSnapshots)
    .where(eq(boardSnapshots.classYear, classYear))
    .orderBy(desc(boardSnapshots.takenAt))
    .limit(200);
}

export async function getSnapshot(classYear: number, id: number) {
  const [row] = await getDb()
    .select()
    .from(boardSnapshots)
    .where(and(eq(boardSnapshots.classYear, classYear), eq(boardSnapshots.id, id)))
    .limit(1);
  return row ?? null;
}

/** Board as it stood at the end of a given day: the latest snapshot taken on or before it. */
export async function snapshotAsOf(classYear: number, date: string) {
  const end = new Date(`${date}T23:59:59.999Z`);
  const rows = await getDb()
    .select()
    .from(boardSnapshots)
    .where(eq(boardSnapshots.classYear, classYear))
    .orderBy(desc(boardSnapshots.takenAt));
  return rows.find((r) => r.takenAt <= end) ?? null;
}

export async function searchNotes(q: string) {
  const term = `%${q.replace(/[%_]/g, "")}%`;
  return getDb()
    .select()
    .from(notes)
    .where(or(ilike(notes.body, term), ilike(notes.playerName, term)))
    .orderBy(desc(notes.createdAt))
    .limit(100);
}
