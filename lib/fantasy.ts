import type { GradingConfig } from "./config";

/** One NFL season line (nflverse player_stats_season, regular season). */
export type NflSeason = {
  season: number;
  games: number;
  completions?: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  rushingYards: number;
  rushingTds: number;
  receptions: number;
  receivingYards: number;
  receivingTds: number;
  fumblesLost: number;
  twoPt: number;
};

/** Fantasy points for one season under the configured league scoring. */
export function fantasyPoints(s: NflSeason, scoring: GradingConfig["scoring"]): number {
  return (
    s.passingYards * scoring.pass_yd +
    s.passingTds * scoring.pass_td +
    s.interceptions * scoring.int +
    (s.rushingYards + s.receivingYards) * scoring.rush_rec_yd +
    (s.rushingTds + s.receivingTds) * scoring.rush_rec_td +
    s.receptions * scoring.ppr +
    s.fumblesLost * scoring.fumble_lost +
    s.twoPt * scoring.two_pt
  );
}

/**
 * PPG across NFL seasons 1–3 (draft year through draft year + 2). Seasons with no games count
 * as zero points but add no games. Returns null when the player never played.
 */
export function ppgYears1to3(
  seasons: NflSeason[],
  draftYear: number,
  scoring: GradingConfig["scoring"],
): { ppg: number | null; games: number } {
  const window = seasons.filter((s) => s.season >= draftYear && s.season <= draftYear + 2);
  const games = window.reduce((a, s) => a + s.games, 0);
  if (!games) return { ppg: null, games: 0 };
  const pts = window.reduce((a, s) => a + fantasyPoints(s, scoring), 0);
  return { ppg: pts / games, games };
}
