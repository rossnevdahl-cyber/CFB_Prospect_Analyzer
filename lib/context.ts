import type { Position, TeamSeason } from "./types";

/** 0 = worst, 1 = best, from a 1-based rank among n teams. */
function rankPct(rank: number | null, n: number | null): number | null {
  if (rank == null || n == null || n < 2) return null;
  return 1 - (rank - 1) / (n - 1);
}

/**
 * Context adjustment input, in [-0.5, 0.5]. Positive means the situation made production harder:
 * a weak team passing game (non-QBs), a slow pace, a tough schedule.
 */
export function contextRaw(position: Position, team: TeamSeason | undefined): number | null {
  if (!team) return null;
  const n = team.fbsTeams;
  const parts: number[] = [];
  const qb = rankPct(team.passEpaRank, n);
  if (position !== "QB" && qb != null) parts.push(1 - qb);
  const pace = rankPct(team.paceRank, n);
  if (pace != null) parts.push(1 - pace);
  const sos = rankPct(team.sosRank, n);
  if (sos != null) parts.push(sos);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length - 0.5;
}
