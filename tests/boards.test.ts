import { describe, expect, it } from "vitest";
import { addEntry, boardToCsv, boardToMarkdown, moveOverall, moveToRank, moveWithinPosition, positionRanks, removeEntry, sameOrder, setTier, type BoardEntry } from "@/lib/boards";
import { POSITIONS, type Position } from "@/lib/types";
import { rng } from "./helpers/history";

const board: BoardEntry[] = Array.from({ length: 40 }, (_, i) => ({
  cfbdId: `p${i + 1}`,
  name: `Player ${i + 1}`,
  position: POSITIONS[(i * 7) % 4],
  school: "State",
  tier: i < 10 ? "Tier 1" : i < 25 ? "Tier 2" : null,
}));

const ids = (b: BoardEntry[]) => b.map((e) => e.cfbdId);

describe("40-player board", () => {
  it("overall moves renumber ranks without losing anyone", () => {
    const moved = moveOverall(board, "p40", 0);
    expect(moved[0].cfbdId).toBe("p40");
    expect(moved).toHaveLength(40);
    expect(new Set(ids(moved)).size).toBe(40);
    expect(ids(moveToRank(moved, "p40", 40))).toEqual(ids(board));
  });

  it("position-view moves only swap that position's slots on the overall board", () => {
    const pos: Position = "WR";
    const wrSlots = board.map((e, i) => (e.position === pos ? i : -1)).filter((i) => i >= 0);
    const lastWr = board[wrSlots[wrSlots.length - 1]].cfbdId;
    const moved = moveWithinPosition(board, pos, lastWr, 0);
    // Non-WRs keep their exact overall ranks
    board.forEach((e, i) => {
      if (e.position !== pos) expect(moved[i].cfbdId).toBe(e.cfbdId);
    });
    // WRs occupy the same slots, reordered
    wrSlots.forEach((slot) => expect(moved[slot].position).toBe(pos));
    expect(moved[wrSlots[0]].cfbdId).toBe(lastWr);
    expect(positionRanks(moved).get(lastWr)).toBe("WR1");
  });

  it("random position and overall moves keep both views consistent", () => {
    const r = rng(42);
    let b = board;
    for (let k = 0; k < 500; k++) {
      const view = r() < 0.5 ? null : POSITIONS[Math.floor(r() * 4)];
      const visible = view ? b.filter((e) => e.position === view) : b;
      const who = visible[Math.floor(r() * visible.length)].cfbdId;
      const to = Math.floor(r() * visible.length);
      const before = b;
      b = view ? moveWithinPosition(b, view, who, to) : moveOverall(b, who, to);
      expect(b).toHaveLength(40);
      expect(new Set(ids(b)).size).toBe(40);
      if (view) {
        // Slots by position are unchanged by a position-view move
        expect(b.map((e) => e.position)).toEqual(before.map((e) => e.position));
        // and the position view equals the filtered overall board
        expect(ids(b.filter((e) => e.position === view))[to]).toBe(who);
      }
    }
  });

  it("add, remove, tier and snapshot equality", () => {
    const added = addEntry(board, { cfbdId: "new", name: "New", position: "TE", school: "X", tier: null });
    expect(added).toHaveLength(41);
    expect(addEntry(added, added[0])).toHaveLength(41); // one spot per player
    expect(removeEntry(added, "new")).toEqual(board);
    expect(sameOrder(board, [...board])).toBe(true);
    expect(sameOrder(board, setTier(board, "p1", "Fade"))).toBe(false);
    expect(sameOrder(board, moveOverall(board, "p2", 0))).toBe(false);
  });

  it("exports CSV and markdown with tier dividers", () => {
    const csv = boardToCsv(board.slice(0, 3), { p1: { grade: 81.2, tier: "Starter" } });
    expect(csv.split("\n")[0]).toBe("rank,pos_rank,player,position,school,my_tier,app_grade,app_tier");
    expect(csv).toContain("1,QB1,Player 1,QB,State,Tier 1,81.2,Starter");
    const md = boardToMarkdown(2027, board.slice(8, 12), {});
    expect(md).toContain("**— Tier 1 —**");
    expect(md).toContain("**— Tier 2 —**");
  });
});
