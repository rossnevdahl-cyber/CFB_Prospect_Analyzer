import { describe, expect, it } from "vitest";
import { athleticScore, type CombineRef } from "@/lib/athletic";
import type { Combine } from "@/lib/types";

const refs: CombineRef[] = Array.from({ length: 100 }, (_, i) => ({
  weight: 180 + (i % 40),
  // Heavier players run slower: 4.30 + 0.004 per lb, plus spread.
  forty: 4.3 + (180 + (i % 40) - 180) * 0.004 + (i % 10) * 0.02,
  vertical: 30 + (i % 12),
  broad: 115 + (i % 15),
  cone: null,
  shuttle: null,
  bench: null,
}));

const player = (p: Partial<Combine>): Combine => ({
  season: 2025, heightIn: 73, weight: 200, forty: null, vertical: null, broad: null, cone: null, shuttle: null, bench: null, source: "test", ...p,
});

describe("athleticScore", () => {
  it("says not yet tested without combine data", () => {
    expect(athleticScore(null, refs)).toMatchObject({ score: null, reason: "Not yet tested" });
  });
  it("needs at least two drills", () => {
    expect(athleticScore(player({ forty: 4.4 }), refs).score).toBeNull();
  });
  it("scores 0–10 and rewards fast times", () => {
    const fast = athleticScore(player({ forty: 4.3, vertical: 41, broad: 129 }), refs);
    const slow = athleticScore(player({ forty: 4.8, vertical: 30, broad: 115 }), refs);
    expect(fast.score!).toBeGreaterThan(8);
    expect(slow.score!).toBeLessThan(2);
    expect(fast.score!).toBeLessThanOrEqual(10);
  });
  it("size-adjusts: the same 40 is worth more at a heavier weight", () => {
    const light = athleticScore(player({ weight: 182, forty: 4.45, vertical: 35 }), refs);
    const heavy = athleticScore(player({ weight: 218, forty: 4.45, vertical: 35 }), refs);
    const p = (r: typeof light) => r.drills.find((d) => d.drill === "forty")!.percentile!;
    expect(p(heavy)).toBeGreaterThan(p(light));
  });
});
