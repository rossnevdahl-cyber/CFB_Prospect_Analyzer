import { DRILLS, LOWER_IS_BETTER, type Combine, type Drill } from "./types";
import { percentileRank } from "./metrics";

/** One historical combine row at the same position, used as the reference population. */
export type CombineRef = Pick<Combine, Drill | "weight">;

type Fit = { slope: number; intercept: number };

/** Least-squares fit of drill result against weight, so heavier players are not penalized for being big. */
function fitAgainstWeight(points: { w: number; v: number }[]): Fit | null {
  if (points.length < 10) return null;
  const n = points.length;
  const mw = points.reduce((a, p) => a + p.w, 0) / n;
  const mv = points.reduce((a, p) => a + p.v, 0) / n;
  let cov = 0, varW = 0;
  for (const p of points) {
    cov += (p.w - mw) * (p.v - mv);
    varW += (p.w - mw) ** 2;
  }
  const slope = varW === 0 ? 0 : cov / varW;
  return { slope, intercept: mv - slope * mw };
}

export type AthleticResult = {
  score: number | null;
  drills: { drill: Drill; value: number; percentile: number | null }[];
  reason?: string;
};

/**
 * Athletic score (0–10): position-specific, size-adjusted percentile of each drill
 * against the historical combine database, averaged. Needs at least two drills.
 */
export function athleticScore(player: Combine | null, refs: CombineRef[]): AthleticResult {
  if (!player) return { score: null, drills: [], reason: "Not yet tested" };
  const drills: AthleticResult["drills"] = [];
  for (const drill of DRILLS) {
    const value = player[drill];
    if (value == null) continue;
    const pts = refs
      .filter((r) => r[drill] != null && r.weight != null)
      .map((r) => ({ w: r.weight as number, v: r[drill] as number }));
    if (pts.length < 10) {
      drills.push({ drill, value, percentile: null });
      continue;
    }
    const fit = player.weight != null ? fitAgainstWeight(pts) : null;
    const residual = (w: number | null, v: number) => (fit && w != null ? v - (fit.intercept + fit.slope * w) : v);
    const population = pts.map((p) => residual(fit ? p.w : null, p.v));
    const pct = percentileRank(residual(player.weight, value), population, !LOWER_IS_BETTER[drill]);
    drills.push({ drill, value, percentile: pct });
  }
  const scored = drills.filter((d) => d.percentile != null);
  if (scored.length < 2) {
    return {
      score: null,
      drills,
      reason: drills.length ? "Fewer than two drills with a historical reference" : "No drills recorded",
    };
  }
  const avg = scored.reduce((a, d) => a + (d.percentile as number), 0) / scored.length;
  return { score: Math.round(avg) / 10, drills };
}
