import { firstOf, parseCsv, toNumber, type CsvIssue } from "./csv";

export type BigBoardRow = {
  playerName: string;
  school: string | null;
  position: string | null;
  rank: number;
  projectedRound: number | null;
};

/** Projected round from a big-board rank when the source gives none: 32 picks a round, 7 rounds. */
export function roundFromRank(rank: number): number {
  return Math.min(7, Math.max(1, Math.ceil(rank / 32)));
}

/** Parses a consensus big board CSV: rank and player required; school, position, round optional. */
export function parseBigBoardCsv(text: string): { rows: BigBoardRow[]; issues: CsvIssue[] } {
  const rows: BigBoardRow[] = [];
  const issues: CsvIssue[] = [];
  parseCsv(text).forEach((r, i) => {
    const playerName = firstOf(r, "player", "player_name", "name");
    const rank = toNumber(firstOf(r, "rank", "overall", "ovr", "consensus_rank", "rk"));
    if (!playerName || rank == null) {
      issues.push({ line: i + 2, message: "needs player and rank" });
      return;
    }
    rows.push({
      playerName,
      school: firstOf(r, "school", "college", "team") ?? null,
      position: firstOf(r, "position", "pos") ?? null,
      rank: Math.round(rank),
      projectedRound: toNumber(firstOf(r, "projected_round", "proj_round", "round", "rd")),
    });
  });
  return { rows, issues };
}
