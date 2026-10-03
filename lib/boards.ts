import type { BoardEntry, BoardTier } from "./db/schema";
import { normalizePosition, type Position } from "./types";

export type { BoardEntry, BoardTier };

export const DEFAULT_TIERS: BoardTier[] = [
  { label: "Tier 1", color: "#16a34a" },
  { label: "Tier 2", color: "#2563eb" },
  { label: "Tier 3", color: "#9333ea" },
  { label: "Tier 4", color: "#ea580c" },
  { label: "Fade", color: "#dc2626" },
];

export function move<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

export function positionOf(e: BoardEntry): Position | null {
  return normalizePosition(e.position);
}

/** Overall index → positional rank label (WR1, WR2…). */
export function positionRanks(entries: BoardEntry[]): Map<string, string> {
  const counts: Record<string, number> = {};
  const out = new Map<string, string>();
  for (const e of entries) {
    const p = positionOf(e) ?? e.position;
    counts[p] = (counts[p] ?? 0) + 1;
    out.set(e.cfbdId, `${p}${counts[p]}`);
  }
  return out;
}

/** Overall move: take the player out and drop them at a new overall index. */
export function moveOverall(entries: BoardEntry[], cfbdId: string, toIndex: number): BoardEntry[] {
  const from = entries.findIndex((e) => e.cfbdId === cfbdId);
  return from < 0 ? entries : move(entries, from, toIndex);
}

/**
 * Move inside a position view. Only the slots held by that position are reshuffled, so every
 * other player keeps their overall rank and the two views can never disagree.
 */
export function moveWithinPosition(entries: BoardEntry[], position: Position, cfbdId: string, toPosIndex: number): BoardEntry[] {
  const slots: number[] = [];
  entries.forEach((e, i) => {
    if (positionOf(e) === position) slots.push(i);
  });
  const subset = slots.map((i) => entries[i]);
  const from = subset.findIndex((e) => e.cfbdId === cfbdId);
  if (from < 0) return entries;
  const reordered = move(subset, from, toPosIndex);
  const out = [...entries];
  slots.forEach((slot, k) => {
    out[slot] = reordered[k];
  });
  return out;
}

/** "Move to rank #" — 1-based; in a position view, the rank is positional. */
export function moveToRank(entries: BoardEntry[], cfbdId: string, rank: number, position?: Position | null): BoardEntry[] {
  const idx = Math.max(0, Math.floor(rank) - 1);
  return position ? moveWithinPosition(entries, position, cfbdId, idx) : moveOverall(entries, cfbdId, idx);
}

export function addEntry(entries: BoardEntry[], entry: BoardEntry): BoardEntry[] {
  if (entries.some((e) => e.cfbdId === entry.cfbdId)) return entries;
  return [...entries, entry];
}

export function removeEntry(entries: BoardEntry[], cfbdId: string): BoardEntry[] {
  return entries.filter((e) => e.cfbdId !== cfbdId);
}

export function setTier(entries: BoardEntry[], cfbdId: string, tier: string | null): BoardEntry[] {
  return entries.map((e) => (e.cfbdId === cfbdId ? { ...e, tier } : e));
}

/** True when two orderings differ — only real reorders get a snapshot. */
export function sameOrder(a: BoardEntry[], b: BoardEntry[]): boolean {
  return a.length === b.length && a.every((e, i) => e.cfbdId === b[i].cfbdId && e.tier === b[i].tier);
}

export type BoardGrades = Record<string, { grade: number | null; tier: string | null }>;
/** Consensus rank and gap (consensus − mine) per player, when fantasy rankings exist. */
export type BoardConsensus = Record<string, { rank: number | null; gap: number | null }>;

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function boardToCsv(entries: BoardEntry[], grades: BoardGrades, consensus?: BoardConsensus): string {
  const pr = positionRanks(entries);
  const lines = [`rank,pos_rank,player,position,school,my_tier,app_grade,app_tier${consensus ? ",consensus_rank,gap" : ""}`];
  entries.forEach((e, i) => {
    const g = grades[e.cfbdId];
    const c = consensus?.[e.cfbdId];
    const cells = [i + 1, pr.get(e.cfbdId), e.name, e.position, e.school, e.tier, g?.grade ?? "", g?.tier ?? ""];
    if (consensus) cells.push(c?.rank ?? "", c?.gap ?? "");
    lines.push(cells.map(csvCell).join(","));
  });
  return lines.join("\n") + "\n";
}

export function boardToMarkdown(classYear: number, entries: BoardEntry[], grades: BoardGrades, asOf?: string, consensus?: BoardConsensus): string {
  const pr = positionRanks(entries);
  const out = [`# ${classYear} big board${asOf ? ` (as of ${asOf})` : ""}`, ""];
  let tier: string | null | undefined;
  const extraHead = consensus ? " Consensus | Gap |" : "";
  const extraSep = consensus ? " ---: | ---: |" : "";
  const blanks = consensus ? " | |" : "";
  out.push(`| # | Pos rk | Player | Pos | School | My tier | App grade | App tier |${extraHead}`, `| ---: | :--- | :--- | :--- | :--- | :--- | ---: | :--- |${extraSep}`);
  entries.forEach((e, i) => {
    if (e.tier !== tier) {
      tier = e.tier;
      if (tier) out.push(`| | | **— ${tier} —** | | | | | |${blanks}`);
    }
    const g = grades[e.cfbdId];
    const c = consensus?.[e.cfbdId];
    const gap = c?.gap == null ? "—" : c.gap > 0 ? `+${c.gap}` : String(c.gap);
    const extra = consensus ? ` ${c?.rank ?? "—"} | ${gap} |` : "";
    out.push(`| ${i + 1} | ${pr.get(e.cfbdId)} | ${e.name} | ${e.position} | ${e.school} | ${e.tier ?? ""} | ${g?.grade ?? "—"} | ${g?.tier ?? "—"} |${extra}`);
  });
  return out.join("\n") + "\n";
}
