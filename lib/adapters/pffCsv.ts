import { firstOf, parseCsv, toNumber, type CsvIssue } from "./csv";

/** Canonical metric names and the PFF export columns that feed them. */
export const PFF_COLUMNS: Record<string, string[]> = {
  pass_grade: ["grades_pass", "passing_grade", "pass_grade"],
  btt_rate: ["btt_rate", "big_time_throw_rate"],
  twp_rate: ["twp_rate", "turnover_worthy_play_rate"],
  pressure_to_sack_rate: ["pressure_to_sack_rate", "p2s_rate"],
  yprr: ["yprr", "yards_per_route_run"],
  routes: ["routes", "routes_run"],
  adot: ["avg_depth_of_target", "adot"],
  yco_att: ["yco_attempt", "yards_after_contact_per_attempt", "yac_per_attempt"],
  mtf: ["avoided_tackles", "missed_tackles_forced", "mtf"],
  elusive_rating: ["elusive_rating"],
  slot_rate: ["slot_rate"],
  contested_catch_rate: ["contested_catch_rate"],
  drop_rate: ["drop_rate"],
  targets: ["targets"],
  inline_snaps: ["inline_snaps", "inline_rate"],
  slot_snaps: ["slot_snaps"],
  wide_snaps: ["wide_snaps"],
  run_block_grade: ["grades_run_block", "run_block_grade"],
  offense_grade: ["grades_offense"],
};

export const PFF_LABELS: Record<string, string> = {
  pass_grade: "Passing grade",
  btt_rate: "Big-time throw %",
  twp_rate: "Turnover-worthy play %",
  pressure_to_sack_rate: "Pressure-to-sack %",
  yprr: "YPRR",
  routes: "Routes run",
  adot: "aDOT",
  yco_att: "Yards after contact/att",
  mtf: "Missed tackles forced",
  elusive_rating: "Elusive rating",
  slot_rate: "Slot rate",
  contested_catch_rate: "Contested catch %",
  drop_rate: "Drop rate",
  targets: "Targets",
  inline_snaps: "Inline snaps",
  slot_snaps: "Slot snaps",
  wide_snaps: "Wide snaps",
  run_block_grade: "Run-block grade",
  offense_grade: "Offense grade",
};

export type PffRow = {
  playerName: string;
  team: string | null;
  position: string | null;
  season: number;
  metrics: Record<string, number>;
};

/**
 * Parses a PFF College premium CSV export. PFF exports do not carry the season, so it comes
 * from the import form unless the file has a season/year column.
 */
export function parsePffCsv(text: string, defaultSeason: number): { rows: PffRow[]; issues: CsvIssue[] } {
  const rows: PffRow[] = [];
  const issues: CsvIssue[] = [];
  parseCsv(text).forEach((r, i) => {
    const playerName = firstOf(r, "player", "player_name", "name");
    if (!playerName) {
      issues.push({ line: i + 2, message: "missing player name" });
      return;
    }
    const metrics: Record<string, number> = {};
    for (const [key, cols] of Object.entries(PFF_COLUMNS)) {
      const v = toNumber(firstOf(r, ...cols));
      if (v != null) metrics[key] = v;
    }
    if (!Object.keys(metrics).length) {
      issues.push({ line: i + 2, message: `no recognized PFF metric columns for ${playerName}` });
      return;
    }
    rows.push({
      playerName,
      team: firstOf(r, "team_name", "team", "school") ?? null,
      position: firstOf(r, "position", "pos") ?? null,
      season: toNumber(firstOf(r, "season", "year")) ?? defaultSeason,
      metrics,
    });
  });
  return { rows, issues };
}
