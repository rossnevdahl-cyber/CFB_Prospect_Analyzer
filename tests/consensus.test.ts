import { describe, expect, it } from "vitest";
import { buildConsensus, compareBoard, missingFromBoard, type SourceSnapshot } from "@/lib/consensus";

const row = (rank: number, name: string, position: string, school: string, cfbdId: string | null = null) => ({
  rank, name, position, school, cfbdId, nameNorm: name.toLowerCase(), schoolNorm: school.toLowerCase(),
});

const ds: SourceSnapshot = { source: "Draft Sharks", asOf: "2026-10-03", rows: [
  row(1, "Jeremiah Smith", "WR", "ohio state", "1"),
  row(2, "Dante Moore", "QB", "oregon", "2"),
  row(3, "Wayne Knight", "RB", "ucla", null),
] };
const mddb: SourceSnapshot = { source: "MDDB", asOf: "2026-10-03", rows: [
  row(1, "Jeremiah Smith", "WR", "ohio state", "1"),
  row(2, "Arch Manning", "QB", "texas", "3"),
  row(3, "Dante Moore", "QB", "oregon", null), // unmatched row joins by name + school
  row(4, "Cam Coleman", "WR", "texas", "4"),
] };

describe("buildConsensus", () => {
  const c = buildConsensus([ds, mddb]);
  const by = (n: string) => c.find((e) => e.name === n)!;

  it("averages ranks; a source that leaves a player off counts one past its last rank", () => {
    expect(by("Jeremiah Smith").average).toBe(1);
    expect(by("Dante Moore").average).toBe(2.5);
    expect(by("Arch Manning").average).toBe((4 + 2) / 2); // DS has 3 players → missing = 4
    expect(by("Wayne Knight").average).toBe((3 + 5) / 2); // MDDB has 4 → missing = 5
    expect(by("Cam Coleman").average).toBe((4 + 4) / 2);
  });

  it("joins unmatched rows to matched ones by name and school", () => {
    expect(c.filter((e) => e.name === "Dante Moore")).toHaveLength(1);
    expect(by("Dante Moore")).toMatchObject({ cfbdId: "2", rankedBy: 2, best: 2, worst: 3, sources: { "Draft Sharks": 2, MDDB: 3 } });
  });

  it("ranks overall and by position, breaking ties by sources ranking the player", () => {
    expect(c.map((e) => e.name)).toEqual(["Jeremiah Smith", "Dante Moore", "Arch Manning", "Wayne Knight", "Cam Coleman"]);
    // Wayne and Cam both average 4 and are ranked by one source each; Wayne's best rank (3) beats Cam's (4).
    expect(by("Arch Manning").positionRank).toBe(2);
    expect(by("Cam Coleman")).toMatchObject({ rank: 5, positionRank: 2 });
  });
});

describe("compareBoard", () => {
  const c = buildConsensus([ds, mddb]);
  const board = [
    { cfbdId: "4", position: "WR" }, // Cam Coleman: mine 1, consensus 5 → +4
    { cfbdId: "1", position: "WR" },
    { cfbdId: "3", position: "QB" },
    { cfbdId: "99", position: "TE" }, // not ranked anywhere
  ];
  it("computes overall gaps (positive = my guy)", () => {
    const cmp = compareBoard(board, c);
    expect(cmp.map((x) => [x.cfbdId, x.myRank, x.consensusRank, x.gap])).toEqual([
      ["4", 1, 5, 4],
      ["1", 2, 1, -1],
      ["3", 3, 3, 0],
      ["99", 4, null, null],
    ]);
  });
  it("computes positional gaps in a position view", () => {
    expect(compareBoard(board, c, "WR").map((x) => [x.myRank, x.consensusRank, x.gap])).toEqual([[1, 2, 1], [2, 1, -1]]);
  });
  it("lists consensus players missing from the board", () => {
    expect(missingFromBoard(board, c, 4).map((e) => e.name)).toEqual(["Dante Moore", "Wayne Knight"]);
    expect(missingFromBoard(board, c, 1, "QB").map((e) => e.name)).toEqual(["Dante Moore"]);
  });
});
