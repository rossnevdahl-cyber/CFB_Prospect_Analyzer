import { describe, expect, it } from "vitest";
import { anyA, buildCareerProfile, deriveSeason, dominator, parseHeight, percentileRank, projectedDraftYear, seasonAge, currentSeason } from "@/lib/metrics";
import { seasonStatsSchema, teamSeasonSchema, type SeasonStats, type TeamSeason } from "@/lib/types";

const season = (p: Partial<SeasonStats> & { season: number; team: string }): SeasonStats =>
  seasonStatsSchema.parse({ conference: null, games: null, ...p });

const team = (t: Partial<TeamSeason> & { season: number; team: string }): TeamSeason =>
  teamSeasonSchema.parse({
    games: 13, passAtt: null, passYds: null, passTd: null, rushAtt: null, rushYds: null, rushTd: null, sacksAllowed: null,
    plays: null, passEpa: null, passEpaRank: null, paceRank: null, lineYards: null, oLineRank: null, spRating: null, spRank: null,
    sos: null, sosRank: null, fbsTeams: null, ...t,
  });

const thresholds = { WR: 0.2, TE: 0.15, RB: 0.15 };

// Five hand-calculated players (phase 2 acceptance: derived metrics match hand calculations).
describe("hand-calculated players", () => {
  it("1. WR transfer — dominator, rec yds per team attempt, breakout age, career dominator", () => {
    const stats = [
      season({ season: 2023, team: "Ohio State", rec: 40, recYds: 600, recTd: 5 }),
      season({ season: 2024, team: "Oregon", rec: 85, recYds: 1300, recTd: 12 }),
    ];
    const teams = [
      team({ season: 2023, team: "Ohio State", passYds: 3500, passTd: 30, passAtt: 400 }),
      team({ season: 2024, team: "Oregon", passYds: 3700, passTd: 32, passAtt: 420 }),
    ];
    const p = buildCareerProfile("WR", stats, teams, "2004-03-15", thresholds);
    // (600/3500 + 5/30) / 2
    expect(p.seasons[0].dominator).toBeCloseTo(0.169047619, 8);
    // (1300/3700 + 12/32) / 2
    expect(p.seasons[1].dominator).toBeCloseTo(0.363175676, 8);
    expect(p.seasons[0].recYdsPerTeamPassAtt).toBeCloseTo(1.5, 8);
    expect(p.seasons[1].recYdsPerTeamPassAtt).toBeCloseTo(3.095238095, 8);
    expect(p.breakoutSeason).toBe(2024);
    // 2004-03-15 → 2024-09-01 = 7475 days
    expect(p.breakoutAge).toBeCloseTo(7475 / 365.2425, 6);
    // pooled: (1900/7200 + 17/62) / 2
    expect(p.careerDominator).toBeCloseTo(0.269041219, 8);
    expect(p.peakSeason).toBe(2024);
    expect(p.noBreakout).toBe(false);
  });

  it("2. TE — lower breakout threshold", () => {
    const stats = [season({ season: 2024, team: "Iowa", rec: 50, recYds: 640, recTd: 6 })];
    const teams = [team({ season: 2024, team: "Iowa", passYds: 3200, passTd: 24, passAtt: 350 })];
    const p = buildCareerProfile("TE", stats, teams, null, thresholds);
    expect(p.seasons[0].dominator).toBeCloseTo(0.225, 10); // (0.2 + 0.25)/2
    expect(p.breakoutSeason).toBe(2024);
    expect(p.breakoutAge).toBeNull(); // no birthdate
    // Same season would not be a WR breakout at 20% if dominator were 0.18
    expect(buildCareerProfile("WR", [season({ season: 2024, team: "Iowa", rec: 40, recYds: 576, recTd: 4 })], teams, null, thresholds).breakoutSeason).toBeNull();
  });

  it("3. RB — scrimmage dominator, carry share, YPC, yards per touch", () => {
    const s = season({ season: 2024, team: "Georgia", rushAtt: 220, rushYds: 1250, rushTd: 14, rec: 30, recYds: 250, recTd: 2, games: 12 });
    const t = team({ season: 2024, team: "Georgia", passYds: 2800, rushYds: 2600, passTd: 20, rushTd: 30, rushAtt: 500, passAtt: 380 });
    const d = deriveSeason("RB", s, t, null);
    expect(d.dominator).toBeCloseTo((1500 / 5400 + 16 / 50) / 2, 10);
    expect(d.carryShare).toBeCloseTo(0.44, 10);
    expect(d.ypc).toBeCloseTo(1250 / 220, 10);
    expect(d.yardsPerTouch).toBeCloseTo(6, 10);
    expect(d.scrimYpg).toBeCloseTo(125, 10);
  });

  it("4. QB — ANY/A, completion %, sack rate, TD:INT", () => {
    const s = season({ season: 2024, team: "LSU", passCmp: 300, passAtt: 450, passYds: 3800, passTd: 32, passInt: 8, sacks: 25, sackYds: 160 });
    expect(anyA(s)).toBeCloseTo(3920 / 475, 10); // (3800 + 640 − 360 − 160) / (450 + 25)
    const d = deriveSeason("QB", s, team({ season: 2024, team: "LSU", rushYds: 2000 }), null);
    expect(d.compPct).toBeCloseTo(2 / 3, 10);
    expect(d.sackRate).toBeCloseTo(25 / 475, 10);
    expect(d.tdInt).toBe(4);
    expect(d.dominator).toBeNull();
  });

  it("5. WR late breakout — age measured on Sept. 1", () => {
    const teams = [2021, 2022, 2023].map((y) => team({ season: y, team: "Utah", passYds: 3000, passTd: 20, passAtt: 400 }));
    const stats = [
      season({ season: 2021, team: "Utah", rec: 20, recYds: 300, recTd: 2 }), // (0.10 + 0.10)/2 = 0.10
      season({ season: 2022, team: "Utah", rec: 30, recYds: 450, recTd: 3 }), // 0.15
      season({ season: 2023, team: "Utah", rec: 60, recYds: 750, recTd: 5 }), // 0.25
    ];
    const p = buildCareerProfile("WR", stats, teams, "2001-09-02", thresholds);
    expect(p.seasons.map((s) => s.dominator)).toEqual([0.1, 0.15, 0.25].map((x) => expect.closeTo(x, 10)));
    expect(p.breakoutSeason).toBe(2023);
    // One day short of 22 on 2023-09-01: 8034 days
    expect(p.breakoutAge).toBeCloseTo(8034 / 365.2425, 6);
    expect(p.breakoutAge!).toBeLessThan(22);
  });
});

describe("helpers", () => {
  it("dominator falls back to yards share when the team threw no TDs", () => {
    const s = season({ season: 2024, team: "Army", recYds: 300, recTd: 0 });
    expect(dominator("WR", s, team({ season: 2024, team: "Army", passYds: 1000, passTd: 0 }))).toBeCloseTo(0.3);
  });
  it("seasonAge uses Sept. 1", () => {
    expect(seasonAge("2005-09-01", 2025)).toBeCloseTo(20, 2);
  });
  it("percentileRank uses mid-rank and flips for lower-is-better", () => {
    expect(percentileRank(3, [1, 2, 3, 4, 5])).toBe(50);
    expect(percentileRank(5, [1, 2, 3, 4, 5])).toBe(90);
    expect(percentileRank(1, [1, 2, 3, 4, 5], false)).toBe(90);
  });
  it("parses heights", () => {
    expect(parseHeight("6-2")).toBe(74);
    expect(parseHeight("5'11\"")).toBe(71);
    expect(parseHeight("73")).toBe(73);
  });
  it("projects draft classes", () => {
    expect(projectedDraftYear(2026, 1)).toBe(2029);
    expect(projectedDraftYear(2026, 3)).toBe(2027);
    expect(projectedDraftYear(2026, 5)).toBe(2027);
    expect(currentSeason(new Date("2026-10-01"))).toBe(2026);
    expect(currentSeason(new Date("2026-03-01"))).toBe(2025);
  });
});
