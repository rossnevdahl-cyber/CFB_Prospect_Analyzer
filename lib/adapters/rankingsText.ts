import { firstOf, parseCsv, toNumber } from "./csv";

/** One ranked player read from a pasted or uploaded fantasy rookie ranking. */
export type RankingRow = {
  rank: number;
  name: string;
  position: string | null;
  school: string | null;
  /** NFL consensus big board rank when the source shows one (e.g. MDDB's "BB #12"). */
  nflRank: number | null;
};

export type RankingParse = {
  layout: "table" | "cards" | "lines";
  rows: RankingRow[];
  /** Non-empty lines that were not part of any player (headers, ads, tier labels). */
  skipped: string[];
};

const POSITIONS = new Set(["QB", "RB", "HB", "FB", "WR", "TE", "ATH"]);
const isPosition = (s: string) => POSITIONS.has(s.trim().toUpperCase());
const NFL_RANK = /\bBB\s*#\s*(\d+)/i;

/** Projected round from an NFL big board rank: 32 picks a round, 7 rounds. */
export function roundFromRank(rank: number): number {
  return Math.min(7, Math.max(1, Math.ceil(rank / 32)));
}

function lines(text: string): string[] {
  return text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** A CSV or tab-separated export with a header row naming the player column. */
function parseTable(text: string): RankingParse | null {
  const first = lines(text)[0] ?? "";
  if (!/[,\t]/.test(first) || !/\b(player|name)\b/i.test(first)) return null;
  const rows: RankingRow[] = [];
  const skipped: string[] = [];
  parseCsv(text).forEach((r, i) => {
    const name = firstOf(r, "player", "player_name", "name");
    if (!name) {
      skipped.push(Object.values(r).join(" ").trim());
      return;
    }
    rows.push({
      rank: Math.round(toNumber(firstOf(r, "rank", "rk", "overall", "ovr", "consensus_rank")) ?? i + 1),
      name,
      position: (firstOf(r, "position", "pos") ?? "").replace(/\d+$/, "").toUpperCase() || null,
      school: firstOf(r, "school", "college", "team") ?? null,
      nflRank: toNumber(firstOf(r, "nfl_rank", "big_board", "bb", "big_board_rank")),
    });
  });
  return { layout: "table", rows, skipped: skipped.filter(Boolean) };
}

/**
 * Card layouts copy as one field per line: rank, name, position, school, then extras such as a
 * projected team or "BB #12". Tabs are treated as line breaks so either copy style parses.
 */
function parseCards(text: string): RankingParse | null {
  const ls = lines(text.replace(/\t/g, "\n"));
  const starts: number[] = [];
  for (let i = 0; i + 2 < ls.length; i++) {
    if (/^\d{1,4}$/.test(ls[i]) && !isPosition(ls[i + 1]) && !/^\d+$/.test(ls[i + 1]) && isPosition(ls[i + 2])) starts.push(i);
  }
  if (starts.length < 3) return null;
  const rows: RankingRow[] = [];
  const used = new Set<number>();
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : Math.min(ls.length, s + 8);
    const school = s + 3 < end && !NFL_RANK.test(ls[s + 3]) ? ls[s + 3] : null;
    let nflRank: number | null = null;
    // Extras belong to the card only until something that looks like page chrome begins.
    for (let j = s; j < Math.min(end, s + 7); j++) {
      used.add(j);
      const m = ls[j].match(NFL_RANK);
      if (m) {
        nflRank = Number(m[1]);
        break;
      }
    }
    rows.push({ rank: Number(ls[s]), name: ls[s + 1], position: ls[s + 2].toUpperCase(), school, nflRank });
  });
  const skipped = ls.filter((_, i) => !used.has(i) && i >= starts[0]);
  return { layout: "cards", rows, skipped };
}

/**
 * One player per line: "Name, POS, School", optionally with a leading rank ("1. Name, …") or
 * with tabs instead of commas. Without an explicit rank, the order of the list is the rank.
 */
function parseLines(text: string): RankingParse {
  const rows: RankingRow[] = [];
  const skipped: string[] = [];
  for (const line of lines(text)) {
    const m = line.match(/^(\d{1,4})[.)]?\s+(.*)$/);
    const body = m ? m[2] : line;
    const parts = body.split(/\s*[,\t|]\s*/).map((p) => p.trim()).filter(Boolean);
    const p = parts.findIndex((x, i) => i > 0 && isPosition(x));
    if (p < 1) {
      skipped.push(line);
      continue;
    }
    const nfl = line.match(NFL_RANK);
    rows.push({
      rank: m ? Number(m[1]) : rows.length + 1,
      name: parts.slice(0, p).join(" "),
      position: parts[p].toUpperCase(),
      school: parts.slice(p + 1).find((x) => !NFL_RANK.test(x)) ?? null,
      nflRank: nfl ? Number(nfl[1]) : null,
    });
  }
  return { layout: "lines", rows, skipped };
}

/** Reads a fantasy rookie ranking pasted from a web page or loaded from a CSV file. */
export function parseRankingsText(text: string): RankingParse {
  return parseTable(text) ?? parseCards(text) ?? parseLines(text);
}
