import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRankingsText, roundFromRank } from "@/lib/adapters/rankingsText";

const fx = (f: string) => fs.readFileSync(path.join(__dirname, "fixtures", "rankings", f), "utf8");

describe("parseRankingsText", () => {
  it("reads Draft Sharks lines (Name, POS, School) with order as rank", () => {
    const r = parseRankingsText(fx("draft-sharks-2027-sf.txt"));
    expect(r.layout).toBe("lines");
    expect(r.rows).toHaveLength(50);
    expect(r.rows[0]).toEqual({ rank: 1, name: "Jeremiah Smith", position: "WR", school: "Ohio State", nflRank: null });
    expect(r.rows[12]).toMatchObject({ rank: 13, name: "Trey'Dez Green", position: "TE", school: "LSU" });
    expect(r.rows[25]).toMatchObject({ name: "Isaiah Sategna III", school: "Oklahoma" });
    expect(r.rows[28]).toMatchObject({ name: "Mario Craver", school: "Texas A&M" });
    expect(r.skipped).toEqual([]);
  });

  it("reads MDDB cards, capturing the NFL board rank and skipping ads and filters", () => {
    const r = parseRankingsText(fx("mddb-2027-sf-excerpt.txt"));
    expect(r.layout).toBe("cards");
    expect(r.rows.map((x) => x.rank)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(r.rows[0]).toEqual({ rank: 1, name: "Jeremiah Smith", position: "WR", school: "Ohio State", nflRank: 1 });
    expect(r.rows[7]).toMatchObject({ name: "Darian Mensah", school: "Miami (FL)", nflRank: 7 });
    expect(r.rows[14]).toMatchObject({ name: "Nick Marsh", nflRank: 32 });
    expect(r.skipped.join(" ")).toContain("Fantasy Hub");
  });

  it("handles a tab-separated card copy", () => {
    const text = "1\tJeremiah Smith\tWR\tOhio State\tUDFA\tBB #1\n2\tArch Manning\tQB\tTexas\tUDFA\tBB #2\n3\tCam Coleman\tWR\tTexas\tUDFA\tBB #8";
    const r = parseRankingsText(text);
    expect(r.layout).toBe("cards");
    expect(r.rows[2]).toEqual({ rank: 3, name: "Cam Coleman", position: "WR", school: "Texas", nflRank: 8 });
  });

  it("reads numbered lines and skips tier labels", () => {
    const r = parseRankingsText("Tier 1\n1. Jeremiah Smith, WR, Ohio State\n2) Arch Manning - QB, QB, Texas\nTier 2\n7 KJ Duff\tWR\tRutgers");
    expect(r.rows.map((x) => [x.rank, x.name, x.position, x.school])).toEqual([
      [1, "Jeremiah Smith", "WR", "Ohio State"],
      [2, "Arch Manning - QB", "QB", "Texas"],
      [7, "KJ Duff", "WR", "Rutgers"],
    ]);
    expect(r.skipped).toEqual(["Tier 1", "Tier 2"]);
  });

  it("reads CSV and TSV tables with headers", () => {
    const csv = parseRankingsText("Rank,Player,Pos,School,BB\n1,Jeremiah Smith,WR1,Ohio State,1\n2,Arch Manning,QB1,Texas,2");
    expect(csv.layout).toBe("table");
    expect(csv.rows[1]).toEqual({ rank: 2, name: "Arch Manning", position: "QB", school: "Texas", nflRank: 2 });
    const tsv = parseRankingsText("Player\tPosition\tCollege\nJeremiah Smith\tWR\tOhio State");
    expect(tsv.rows[0]).toMatchObject({ rank: 1, name: "Jeremiah Smith", school: "Ohio State" });
  });

  it("projects rounds from NFL board ranks", () => {
    expect(roundFromRank(1)).toBe(1);
    expect(roundFromRank(40)).toBe(2);
    expect(roundFromRank(500)).toBe(7);
  });
});

describe("top 50 cap", () => {
  it("keeps the 50 best ranks in rank order", async () => {
    const { topRanked, RANKING_LIMIT } = await import("@/lib/adapters/rankingsText");
    expect(RANKING_LIMIT).toBe(50);
    const rows = Array.from({ length: 80 }, (_, i) => ({ rank: 80 - i, name: `P${80 - i}` }));
    const top = topRanked(rows);
    expect(top).toHaveLength(50);
    expect(top[0].rank).toBe(1);
    expect(top.at(-1)!.rank).toBe(50);
  });
  it("applies to a full MDDB-style paste of 364 players", async () => {
    const { topRanked } = await import("@/lib/adapters/rankingsText");
    const cards = Array.from({ length: 364 }, (_, i) => `${i + 1}\nPlayer ${i + 1}\nWR\nState\nUDFA\nBB #${i + 3}`).join("\n");
    const parsed = parseRankingsText(cards);
    expect(parsed.rows).toHaveLength(364);
    const kept = topRanked(parsed.rows);
    expect(kept).toHaveLength(50);
    expect(kept.at(-1)).toMatchObject({ rank: 50, name: "Player 50", nflRank: 52 });
  });
});
