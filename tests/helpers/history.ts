import type { HistoryRow } from "@/lib/grading";
import type { Position } from "@/lib/types";

/** Deterministic pseudo-random generator so synthetic histories are stable across runs. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Synthetic history where a latent "talent" drives production, efficiency, draft capital and
 * NFL PPG — enough structure for grading, comps and backtest tests.
 */
export function syntheticHistory(position: Position, n = 200, seed = 7): HistoryRow[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const talent = r();
    const noise = () => (r() - 0.5) * 0.3;
    const pick = Math.max(1, Math.round(250 - talent * 240 + noise() * 100));
    return {
      id: `${position}-${i}`,
      cfbdId: `h${i}`,
      name: `${position} Player ${i}`,
      position,
      college: "State",
      draftYear: 2008 + (i % 15),
      draftRound: Math.min(7, Math.ceil(pick / 32)),
      draftPick: pick,
      heightIn: 70 + Math.round(r() * 6),
      weight: 190 + Math.round(r() * 40),
      features: {
        peak_dominator: 0.15 + talent * 0.3 + noise() * 0.1,
        career_dominator: 0.1 + talent * 0.2 + noise() * 0.1,
        peak_rec_ytpa: 1 + talent * 2.5 + noise(),
        peak_scrim_ypg: 40 + talent * 80 + noise() * 30,
        peak_epa_all: 0.2 + talent * 0.4 + noise() * 0.2,
        pff_yprr: null,
        breakout_age: 21.5 - talent * 3 + noise(),
        age_at_peak: 22 - talent * 2 + noise(),
        athletic_score: i % 3 === 0 ? null : 3 + talent * 5 + noise() * 4,
        draft_pick: pick,
        recruit_rating: 0.82 + talent * 0.15 + noise() * 0.05,
        context_raw: noise(),
      },
      collegeLine: `line ${i}`,
      collegeComplete: i % 10 !== 0,
      nflPpg: Math.max(0, talent * 16 + noise() * 10),
      nflGames: 30,
    };
  });
}
