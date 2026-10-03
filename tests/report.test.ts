import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CfbdAdapter } from "@/lib/adapters/cfbd";
import { MemoryCache } from "@/lib/cache";
import { parseGradingConfig } from "@/lib/config";
import { reportToMarkdown } from "@/lib/markdown";
import { buildReport, PlayerNotFoundError } from "@/lib/report/build";
import type { RosterRow } from "@/lib/report/types";
import { fixtureFetch } from "./helpers/fixtureFetch";
import { syntheticHistory } from "./helpers/history";
import { MemoryRepo } from "./helpers/memoryRepo";

const config = parseGradingConfig(fs.readFileSync(path.join(__dirname, "..", "config", "grading.yaml"), "utf8"));
const ID = "4870001";

const roster = (season: number, team: string, classYear: number): RosterRow => ({
  cfbdId: ID, season, firstName: "Test", lastName: "Receiver", fullName: "Test Receiver", team, position: "WR",
  height: 73, weight: 195, jersey: 1, classYear, homeCity: "Dallas", homeState: "TX", homeCountry: "USA", recruitIds: ["r1"],
});

let repo: MemoryRepo;
beforeEach(() => {
  repo = new MemoryRepo();
  repo.roster = [roster(2024, "Ohio State", 1), roster(2025, "Oregon", 2)];
  repo.birth = { date: "2005-10-01", source: "manual override" };
});

function adapter(cache = new MemoryCache()) {
  const f = fixtureFetch("cfbd/wr-transfer.json");
  return { cfbd: new CfbdAdapter({ apiKey: "test", cache, fetch: f, season: 2025 }), f, cache };
}

describe("buildReport (CFBD fixtures)", () => {
  it("fills sections 1, 4, 9, 10 and 14 for a transfer WR", async () => {
    const { cfbd } = adapter();
    const r = await buildReport(ID, { cfbd, repo, config, now: new Date("2026-10-01T12:00:00Z") });

    // 1. Header
    expect(r.player).toMatchObject({ name: "Test Receiver", team: "Oregon", position: "WR", classLabel: "SO", hometown: "Dallas, TX", heightIn: 73, weight: 195 });
    expect(r.player.age).toBeCloseTo(21, 1);
    expect(r.player.projectedDraftYear).toBe(2027);

    // 4. Season rows with transfer noted, games from box scores
    expect(r.seasons.map((s) => [s.stats.season, s.stats.team, s.transfer, s.stats.games])).toEqual([
      [2024, "Ohio State", false, 12],
      [2025, "Oregon", true, 13],
    ]);
    expect(r.seasons[1].stats).toMatchObject({ rec: 85, recYds: 1300, recTd: 12, rushAtt: 5, rushYds: 40, epaAll: 0.62 });

    // 5/6. Derived metrics
    expect(r.seasons[0].derived.dominator).toBeCloseTo((600 / 3500 + 5 / 30) / 2, 8);
    expect(r.seasons[1].derived.dominator).toBeCloseTo((1300 / 3700 + 12 / 32) / 2, 8);
    expect(r.profile.breakoutSeason).toBe(2025);
    expect(r.profile.breakoutAge).toBeCloseTo(19.92, 2); // 2005-10-01 → 2025-09-01

    // 9. Team context: QB quality, pace, O-line, SP+, SOS ranks among the fixture's 3 teams
    const ore = r.teamContext.find((t) => t.season === 2025)!;
    expect(ore).toMatchObject({ team: "Oregon", passEpaRank: 2, spRating: 25, spRank: 2, fbsTeams: 3, games: 13 });
    expect(ore.paceRank).toBe(1); // 980/13 plays per game is the fastest
    expect(ore.sos).toBeCloseTo((30 + 15) / 2, 10); // played Ohio State and Michigan

    // 10. Recruiting with computed position rank
    expect(r.recruiting).toMatchObject({ stars: 4, rating: 0.9712, nationalRank: 25, positionRank: 3, year: 2024 });

    // 13/14. Gaps and sources
    expect(r.gaps.map((g) => g.field)).toEqual(expect.arrayContaining(["Combine / pro day", "Fantasy rookie rankings", "NFL consensus board rank", "Dynasty rookie ADP", "Composite grade and comps", "Offers"]));
    expect(r.sources[0].source).toBe("CollegeFootballData");
    expect(r.dataPulledAt).not.toBeNull();

    // No history yet → no grade, zero confidence
    expect(r.grade.score).toBeNull();
  });

  it("serves the second build entirely from cache", async () => {
    const { cfbd, f, cache } = adapter();
    await buildReport(ID, { cfbd, repo, config });
    const firstCalls = f.requests.length;
    expect(firstCalls).toBeGreaterThan(5);
    const again = adapter(cache);
    const r = await buildReport(ID, { cfbd: again.cfbd, repo, config });
    expect(again.f.requests).toHaveLength(0);
    expect(r.timings.cfbdCacheHits).toBe(r.timings.cfbdCalls);
  });

  it("grades, finds comps and uses imports when history and CSVs exist", async () => {
    const { cfbd } = adapter();
    repo.historyRows = syntheticHistory("WR", 200, 3);
    repo.board = [{ source: "Consensus", rank: 20, projectedRound: null, asOf: "2026-09-01" }];
    repo.adpRows = [{ source: "FantasyPros", adp: 3.2, format: "superflex", asOf: "2026-09-15" }];
    repo.fantasyRows = {
      spots: [{ source: "Draft Sharks", rank: 9, format: "superflex", classYear: 2027, asOf: "2026-10-03" }],
      consensus: [{ format: "superflex", classYear: 2027, rank: 7, positionRank: 3, average: 8.5, rankedBy: 2, sources: 2 }],
    };
    repo.pffRows = [{ season: 2025, team: "Oregon", metrics: { yprr: 3.1, targets: 110 } }];
    const r = await buildReport(ID, { cfbd, repo, config });
    expect(r.grade.score).not.toBeNull();
    expect(r.grade.tier).toBeTruthy();
    expect(r.grade.confidence).toBeCloseTo(0.9, 5); // athleticism missing (untested)
    expect(r.rankings.projectedRound).toBe(1);
    expect(r.rankings.consensus[0]).toMatchObject({ rank: 7, positionRank: 3 });
    expect(r.gaps.map((g) => g.field)).not.toContain("Fantasy rookie rankings");
    const md = reportToMarkdown(r);
    expect(md).toContain("- Fantasy rookie consensus (2027 Superflex): #7, WR3 — average 8.5, ranked by 2 of 2 sources");
    expect(md).toContain("- Draft Sharks (2027 Superflex): #9");
    expect(r.features.draft_pick).toBe(16); // round 1 midpoint
    expect(r.seasons[1].stats.targets).toBe(110);
    expect(r.seasons[1].derived.targetShare).toBeCloseTo(110 / 420, 10);
    expect(r.comps.length).toBeGreaterThan(0);
    expect(r.gaps.map((g) => g.field)).not.toContain("Targets / target share");
  });

  it("renders markdown with every section in order", async () => {
    const { cfbd } = adapter();
    repo.noteRows = [{ id: 1, body: "Strong hands, **elite** YAC.", createdAt: "2026-09-20T15:00:00Z", updatedAt: "2026-09-21T15:00:00Z" }];
    const r = await buildReport(ID, { cfbd, repo, config });
    const md = reportToMarkdown(r);
    const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      "Grade summary", "Historical comps", "Season-by-season stats", "Advanced metrics", "Market share and breakout",
      "Athletic testing", "Rankings", "Team context", "Recruiting", "Film and highlights", "My notes", "Data gaps", "Sources and timestamps",
    ]);
    expect(md).toMatch(/^# Test Receiver — WR, Oregon/);
    expect(md).toContain("| 2025 | Oregon (transfer) |");
    expect(md).toContain("Strong hands, **elite** YAC.");
    expect(md).toContain("(edited ");
    expect(md).toContain("Not yet tested.");
  });

  it("rejects unknown ids and unsupported positions", async () => {
    const { cfbd } = adapter();
    await expect(buildReport("nope", { cfbd, repo, config })).rejects.toBeInstanceOf(PlayerNotFoundError);
    repo.roster = [{ ...roster(2025, "Oregon", 2), position: "OL" }];
    await expect(buildReport(ID, { cfbd, repo, config })).rejects.toThrow(/only QB, RB, WR and TE/);
  });
});
