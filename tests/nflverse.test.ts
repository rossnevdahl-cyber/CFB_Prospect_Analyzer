import { describe, expect, it } from "vitest";
import { parseCombine, parseDraftPicks, parsePlayers, parseSeasonStats } from "@/lib/adapters/nflverse";
import { backtestMarkdown, runBacktest } from "@/lib/backtest";
import { parseGradingConfig } from "@/lib/config";
import { fantasyPoints, ppgYears1to3 } from "@/lib/fantasy";
import { computeHistoryPlayer, draftPosition, pearson, spearman } from "@/lib/history";
import { seasonStatsSchema, teamSeasonSchema } from "@/lib/types";
import fs from "node:fs";
import path from "node:path";
import { syntheticHistory } from "./helpers/history";

const config = parseGradingConfig(fs.readFileSync(path.join(__dirname, "..", "config", "grading.yaml"), "utf8"));
const read = (f: string) => fs.readFileSync(path.join(__dirname, "fixtures", "nflverse", f), "utf8");

describe("nflverse parsers (recorded CSV excerpts)", () => {
  it("draft picks", () => {
    const picks = parseDraftPicks(read("draft_picks.csv"));
    expect(picks[0]).toMatchObject({ season: 2021, round: 1, pick: 5, gsisId: "00-0036900", pfrId: "ChasJa00", name: "Ja'Marr Chase", position: "WR", college: "LSU" });
  });
  it("combine", () => {
    const c = parseCombine(read("combine.csv"));
    expect(c[0]).toMatchObject({ name: "Ja'Marr Chase", heightIn: 72, weight: 201, forty: 4.34, vertical: 41, broad: 132, cone: 6.96, shuttle: 3.99, bench: null, pfrId: "ChasJa00" });
  });
  it("players and season stats", () => {
    expect(parsePlayers(read("players.csv"))[0]).toMatchObject({ gsisId: "00-0036900", birthDate: "2000-03-01" });
    const s = parseSeasonStats(read("player_stats_season.csv"));
    expect(s.map((x) => x.season)).toEqual([2021, 2022, 2023]); // POST row dropped
    expect(s[0]).toMatchObject({ games: 17, receptions: 81, receivingYards: 1455, receivingTds: 13, rushingYards: 21, fumblesLost: 1 });
  });
});

describe("fantasy outcome", () => {
  it("scores full PPR with 5-pt passing TDs", () => {
    const pts = fantasyPoints(
      { season: 2024, games: 1, passingYards: 250, passingTds: 2, interceptions: 1, rushingYards: 30, rushingTds: 1, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPt: 0 },
      config.scoring,
    );
    expect(pts).toBeCloseTo(250 * 0.04 + 10 - 2 + 3 + 6, 10);
  });
  it("PPG over NFL seasons 1–3 from the recorded excerpt", () => {
    const seasons = parseSeasonStats(read("player_stats_season.csv"));
    const { ppg, games } = ppgYears1to3(seasons, 2021, config.scoring);
    // 2021: 81 rec + 145.5 (1455 yds) + 78 (13 TD) + 2.1 (21 rush yds) − 2 (1 fumble lost) = 304.6
    // 2022: 87 + 104.6 + 54 (9 TD) + 0.8 − 4 (2 lost) = 242.4
    // 2023: 100 + 121.6 + 42 − 0.6 (−6 rush) − 0.28 (−7 pass yds) = 262.72
    expect(games).toBe(17 + 12 + 16);
    expect(ppg).toBeCloseTo((304.6 + 242.4 + 262.72) / 45, 6);
  });
});

describe("history and backtest", () => {
  it("maps CFBD draft position names", () => {
    expect(draftPosition("Wide Receiver")).toBe("WR");
    expect(draftPosition("Fullback")).toBe("RB");
    expect(draftPosition("Offensive Tackle")).toBeNull();
  });
  it("computes features as of the final college season, ignoring post-draft rows", () => {
    const s = (season: number, recYds: number) => seasonStatsSchema.parse({ season, team: "LSU", conference: null, games: null, rec: 50, recYds, recTd: 8 });
    const t = (season: number) => teamSeasonSchema.parse({ season, team: "LSU", games: 13, passAtt: 400, passYds: 4000, passTd: 40, rushAtt: null, rushYds: null, rushTd: null, sacksAllowed: null, plays: null, passEpa: null, passEpaRank: null, paceRank: null, lineYards: null, oLineRank: null, spRating: null, spRank: null, sos: null, sosRank: null, fbsTeams: null });
    const out = computeHistoryPlayer({
      position: "WR", draftYear: 2021, overallPick: 5,
      stats: [s(2018, 500), s(2019, 1780), s(2021, 9999)], teams: [t(2018), t(2019)],
      birthdate: "2000-03-01", combine: null, combineRefs: [], recruitRating: 0.95, nflSeasons: [], config, coverageStart: 2004,
    });
    expect(out.features.peak_dominator).toBeCloseTo((1780 / 4000 + 8 / 40) / 2, 10);
    expect(out.features.draft_pick).toBe(5);
    expect(out.collegeComplete).toBe(false); // opted out of 2020: final season ≠ draft year − 1
    expect(out.collegeLine).toMatch(/^2019 LSU: 50-1,780-8/);
  });
  it("correlations", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 1000])).toBeCloseTo(1);
  });
  it("backtest finds the signal in a synthetic history", () => {
    const history = [...syntheticHistory("WR", 150, 1), ...syntheticHistory("RB", 150, 2)];
    const rows = runBacktest(history, config, { latestDraft: 2022, excludeRecent: 0 });
    const wr = rows.find((r) => r.position === "WR")!;
    expect(wr.n).toBe(150);
    expect(wr.spearman!).toBeGreaterThan(0.5);
    expect(rows.find((r) => r.position === "QB")!.n).toBe(0);
    expect(backtestMarkdown(rows, { generated: "x", configNote: "", excluded: "" })).toContain("| WR | 150 |");
  });
});
