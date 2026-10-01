"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { moveToRank, moveWithinPosition, moveOverall, removeEntry, setTier, type BoardEntry, type BoardTier } from "@/lib/boards";
import { addToBoard, getBoard, saveBoard } from "@/lib/boardsRepo";
import { positionSchema } from "@/lib/types";

const entrySchema = z.object({
  cfbdId: z.string().min(1),
  name: z.string(),
  position: z.string(),
  school: z.string(),
  tier: z.string().nullable(),
});

const touch = (classYear: number) => revalidatePath(`/boards/${classYear}`);

export async function addPlayerToBoard(classYear: number, entry: BoardEntry) {
  await addToBoard(classYear, entrySchema.parse(entry));
  touch(classYear);
  revalidatePath(`/player/${entry.cfbdId}`);
}

/**
 * Reorder from drag-and-drop, the up/down buttons or "move to rank #". Applied to the stored order
 * on the server, so a stale client can never drop or duplicate players.
 */
export async function movePlayer(classYear: number, cfbdId: string, toIndex: number, position: string | null) {
  const board = await getBoard(classYear);
  const pos = position ? positionSchema.parse(position) : null;
  const entries = pos ? moveWithinPosition(board.entries, pos, cfbdId, toIndex) : moveOverall(board.entries, cfbdId, toIndex);
  await saveBoard(classYear, entries);
  touch(classYear);
  return entries;
}

export async function movePlayerToRank(classYear: number, cfbdId: string, rank: number, position: string | null) {
  const board = await getBoard(classYear);
  const entries = moveToRank(board.entries, cfbdId, rank, position ? positionSchema.parse(position) : null);
  await saveBoard(classYear, entries);
  touch(classYear);
  return entries;
}

export async function removePlayer(classYear: number, cfbdId: string) {
  const board = await getBoard(classYear);
  await saveBoard(classYear, removeEntry(board.entries, cfbdId));
  touch(classYear);
  revalidatePath(`/player/${cfbdId}`);
}

export async function movePlayerToClass(fromClass: number, cfbdId: string, toClass: number) {
  const board = await getBoard(fromClass);
  const entry = board.entries.find((e) => e.cfbdId === cfbdId);
  if (!entry || fromClass === toClass) return;
  await addToBoard(toClass, entry);
  touch(fromClass);
  touch(toClass);
}

export async function setPlayerTier(classYear: number, cfbdId: string, tier: string | null) {
  const board = await getBoard(classYear);
  await saveBoard(classYear, setTier(board.entries, cfbdId, tier || null));
  touch(classYear);
}

export async function saveTiers(classYear: number, tiers: BoardTier[]) {
  const clean = z.array(z.object({ label: z.string().trim().min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).parse(tiers);
  const board = await getBoard(classYear);
  const labels = new Set(clean.map((t) => t.label));
  const entries = board.entries.map((e) => (e.tier && !labels.has(e.tier) ? { ...e, tier: null } : e));
  await saveBoard(classYear, entries, clean);
  touch(classYear);
}

export async function restoreSnapshot(classYear: number, entries: BoardEntry[], tiers: BoardTier[]) {
  await saveBoard(classYear, z.array(entrySchema).parse(entries), tiers);
  touch(classYear);
}
