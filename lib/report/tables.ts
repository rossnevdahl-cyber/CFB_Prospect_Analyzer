import { PFF_LABELS } from "../adapters/pffCsv";
import { fmtAge, fmtInt, fmtNum, fmtPct } from "../format";
import type { Position, TeamSeason } from "../types";
import type { ReportSeason } from "./types";

export type Column<T> = { label: string; get: (row: T) => string; align?: "left" | "right" };

const L = (label: string, get: (r: ReportSeason) => string): Column<ReportSeason> => ({ label, get, align: "left" });
const R = (label: string, get: (r: ReportSeason) => string): Column<ReportSeason> => ({ label, get, align: "right" });

const lead: Column<ReportSeason>[] = [
  L("Season", (r) => String(r.stats.season)),
  L("Team", (r) => `${r.stats.team}${r.transfer ? " (transfer)" : ""}`),
  R("Age", (r) => fmtAge(r.derived.age)),
  R("G", (r) => fmtInt(r.stats.games)),
  R("SOS rk", (r) => fmtInt(r.derived.sosRank)),
];

/** Section 4: box score by season. */
export function statColumns(pos: Position): Column<ReportSeason>[] {
  switch (pos) {
    case "QB":
      return [
        ...lead,
        R("Cmp%", (r) => fmtPct(r.derived.compPct)),
        R("Pass yds", (r) => fmtInt(r.stats.passYds)),
        R("TD", (r) => fmtInt(r.stats.passTd)),
        R("INT", (r) => fmtInt(r.stats.passInt)),
        R("YPA", (r) => fmtNum(r.derived.ypa)),
        R("Rush yds", (r) => fmtInt(r.stats.rushYds)),
        R("Rush TD", (r) => fmtInt(r.stats.rushTd)),
      ];
    case "RB":
      return [
        ...lead,
        R("Car", (r) => fmtInt(r.stats.rushAtt)),
        R("Rush yds", (r) => fmtInt(r.stats.rushYds)),
        R("YPC", (r) => fmtNum(r.derived.ypc)),
        R("TD", (r) => fmtInt(r.stats.rushTd + r.stats.recTd)),
        R("Rec", (r) => fmtInt(r.stats.rec)),
        R("Rec yds", (r) => fmtInt(r.stats.recYds)),
      ];
    default:
      return [
        ...lead,
        R("Tgt", (r) => fmtInt(r.stats.targets)),
        R("Rec", (r) => fmtInt(r.stats.rec)),
        R("Yds", (r) => fmtInt(r.stats.recYds)),
        R("TD", (r) => fmtInt(r.stats.recTd)),
        R("YPR", (r) => fmtNum(r.derived.ypr)),
      ];
  }
}

const pffCol = (key: string) => R(PFF_LABELS[key] ?? key, (r) => fmtNum(r.pff?.[key], key.endsWith("rate") ? 1 : 2));

/** Section 5: position-specific advanced metrics, with PFF columns when imported. */
export function advancedColumns(pos: Position, hasPff: boolean): Column<ReportSeason>[] {
  const base: Column<ReportSeason>[] = [L("Season", (r) => String(r.stats.season))];
  switch (pos) {
    case "QB":
      return [
        ...base,
        R("ANY/A", (r) => fmtNum(r.derived.anyA, 2) + (r.stats.sacksEstimated ? "*" : "")),
        R("EPA/dropback", (r) => fmtNum(r.derived.epaPass, 3)),
        R("Sack rate", (r) => fmtPct(r.derived.sackRate) + (r.stats.sacksEstimated ? "*" : "")),
        R("Rush share", (r) => fmtPct(r.derived.rushShare)),
        R("TD:INT", (r) => fmtNum(r.derived.tdInt, 2)),
        ...(hasPff ? ["pass_grade", "btt_rate", "twp_rate", "pressure_to_sack_rate"].map(pffCol) : []),
      ];
    case "RB":
      return [
        ...base,
        R("Carry share", (r) => fmtPct(r.derived.carryShare)),
        R("Target share", (r) => fmtPct(r.derived.targetShare)),
        R("Yds/touch", (r) => fmtNum(r.derived.yardsPerTouch)),
        R("EPA/rush", (r) => fmtNum(r.derived.epaRush, 3)),
        R("Dominator", (r) => fmtPct(r.derived.dominator)),
        ...(hasPff ? ["yco_att", "mtf", "elusive_rating", "yprr"].map(pffCol) : []),
      ];
    default:
      return [
        ...base,
        R("Dominator", (r) => fmtPct(r.derived.dominator)),
        R("Target share", (r) => fmtPct(r.derived.targetShare)),
        R("Rec yds/team att", (r) => fmtNum(r.derived.recYdsPerTeamPassAtt, 2)),
        R("EPA/play", (r) => fmtNum(r.derived.epaAll, 3)),
        ...(hasPff
          ? (pos === "TE" ? ["yprr", "inline_snaps", "slot_snaps", "wide_snaps", "run_block_grade"] : ["yprr", "adot", "slot_rate", "contested_catch_rate", "drop_rate"]).map(pffCol)
          : []),
      ];
  }
}

const rk = (rank: number | null, n: number | null) => (rank == null ? "—" : `${rank}${n ? `/${n}` : ""}`);

/** Section 9: team context by season. */
export const teamColumns: Column<TeamSeason>[] = [
  { label: "Season", get: (t) => String(t.season), align: "left" },
  { label: "Team", get: (t) => t.team, align: "left" },
  { label: "QB quality (pass EPA rk)", get: (t) => `${fmtNum(t.passEpa, 3)} (${rk(t.passEpaRank, t.fbsTeams)})`, align: "right" },
  { label: "Pace rk", get: (t) => rk(t.paceRank, t.fbsTeams), align: "right" },
  { label: "Pass rate", get: (t) => fmtPct(t.passAtt != null && t.rushAtt != null ? t.passAtt / (t.passAtt + t.rushAtt) : null), align: "right" },
  { label: "O-line rk", get: (t) => rk(t.oLineRank, t.fbsTeams), align: "right" },
  { label: "SP+", get: (t) => `${fmtNum(t.spRating)} (${rk(t.spRank, null)})`, align: "right" },
  { label: "SOS rk", get: (t) => rk(t.sosRank, t.fbsTeams), align: "right" },
];
