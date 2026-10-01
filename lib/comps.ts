import type { GradingConfig } from "./config";
import { featureDefs, population, type FeatureVector, type HistoryRow } from "./grading";
import type { Position } from "./types";

export type Comp = {
  id: string;
  name: string;
  college: string;
  draftYear: number;
  draftRound: number | null;
  draftPick: number | null;
  collegeLine: string;
  nflPpg: number | null;
  nflGames: number | null;
  similarity: number;
};

type Dim = { key: string; weight: number; mean: number; sd: number };

function stats(values: number[]): { mean: number; sd: number } {
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
  return { mean, sd };
}

/** Builds standardized dimensions (z-scores within position) weighted like the grade. */
export function compDimensions(position: Position, history: HistoryRow[], config: GradingConfig): Dim[] {
  const weights = config.weights[position];
  const defs = featureDefs(position);
  const atPos = history.filter((h) => h.position === position);
  const dims: Dim[] = [];
  for (const d of defs) {
    const pop = population(atPos, d.key);
    if (pop.length < config.min_history_sample) continue;
    const siblings = defs.filter((x) => x.component === d.component).length;
    const { mean, sd } = stats(pop);
    if (sd === 0) continue;
    dims.push({ key: d.key, weight: weights[d.component] / siblings, mean, sd });
  }
  for (const key of ["height_in", "weight"] as const) {
    const pop = atPos.map((h) => (key === "height_in" ? h.heightIn : h.weight)).filter((v): v is number => v != null);
    if (pop.length < config.min_history_sample) continue;
    const { mean, sd } = stats(pop);
    if (sd === 0) continue;
    dims.push({ key, weight: config.comp_size_weight / 2, mean, sd });
  }
  return dims;
}

function vectorOf(h: Pick<HistoryRow, "features" | "heightIn" | "weight">): FeatureVector {
  return { ...h.features, height_in: h.heightIn, weight: h.weight };
}

/**
 * Weighted Euclidean distance over standardized features both players have, normalized by the
 * weight compared. Returns null when they share less than half the available weight.
 */
export function distance(a: FeatureVector, b: FeatureVector, dims: Dim[]): number | null {
  const total = dims.reduce((s, d) => s + d.weight, 0);
  let sum = 0, used = 0;
  for (const d of dims) {
    const x = a[d.key], y = b[d.key];
    if (x == null || y == null) continue;
    const dz = (x - d.mean) / d.sd - (y - d.mean) / d.sd;
    sum += d.weight * dz * dz;
    used += d.weight;
  }
  if (!used || used < total / 2) return null;
  return Math.sqrt(sum / used);
}

/** Similarity in [0,1]: a Gaussian kernel on standardized distance. d=1 ≈ 0.61. */
export function similarityFromDistance(d: number): number {
  return Math.exp(-(d * d) / 2);
}

/** Top-N nearest historical players with complete college data. */
export function findComps(
  player: { features: FeatureVector; heightIn: number | null; weight: number | null },
  position: Position,
  history: HistoryRow[],
  config: GradingConfig,
  excludeId?: string,
): Comp[] {
  const dims = compDimensions(position, history, config);
  if (!dims.length) return [];
  const me = vectorOf(player);
  const out: Comp[] = [];
  for (const h of history) {
    if (h.position !== position || !h.collegeComplete || h.id === excludeId) continue;
    if (excludeId && h.cfbdId && h.cfbdId === excludeId) continue;
    const d = distance(me, vectorOf(h), dims);
    if (d == null) continue;
    const similarity = similarityFromDistance(d);
    if (similarity < config.comps.min_similarity) continue;
    out.push({
      id: h.id,
      name: h.name,
      college: h.college,
      draftYear: h.draftYear,
      draftRound: h.draftRound,
      draftPick: h.draftPick,
      collegeLine: h.collegeLine,
      nflPpg: h.nflPpg,
      nflGames: h.nflGames,
      similarity,
    });
  }
  return out.sort((a, b) => b.similarity - a.similarity).slice(0, config.comps.count);
}
