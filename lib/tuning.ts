import type { GradingConfig } from "./config";
import { gradePlayer, type HistoryRow } from "./grading";
import { spearman } from "./history";
import { COMPONENTS, type Component, type Position } from "./types";

export type Weights = Record<Component, number>;

/** Component scores computed once per player; re-weighting them is then cheap. */
export type Scored = { draftYear: number; ppg: number; scores: Partial<Record<Component, number>> };

/** Never-played counts as zero PPG — a bust is an outcome, not missing data. */
export function outcome(h: HistoryRow): number {
  return h.nflGames != null && h.nflGames >= 1 ? (h.nflPpg ?? 0) : 0;
}

export function scorePlayers(position: Position, history: HistoryRow[], config: GradingConfig, latestDraft: number): Scored[] {
  const pool = history.filter((h) => h.position === position);
  return pool
    .filter((h) => h.draftYear <= latestDraft)
    .map((h) => {
      const g = gradePlayer(h.features, position, pool, config);
      const scores: Scored["scores"] = {};
      for (const c of g.components) if (c.score != null) scores[c.component] = c.score;
      return { draftYear: h.draftYear, ppg: outcome(h), scores };
    });
}

/** Grade under a weight set, with missing components' weight redistributed (same rule as gradePlayer). */
export function regrade(s: Scored, w: Weights): number | null {
  let sum = 0, used = 0;
  for (const c of COMPONENTS) {
    const v = s.scores[c];
    if (v == null || w[c] <= 0) continue;
    sum += v * w[c];
    used += w[c];
  }
  return used ? sum / used : null;
}

export function rho(players: Scored[], w: Weights): number {
  const xs: number[] = [], ys: number[] = [];
  for (const p of players) {
    const g = regrade(p, w);
    if (g == null) continue;
    xs.push(g);
    ys.push(p.ppg);
  }
  return spearman(xs, ys) ?? 0;
}

const round = (x: number) => Math.round(x * 100) / 100;

/**
 * Greedy pairwise search: repeatedly move `step` of weight from one tunable component to another
 * while it raises Spearman ρ on the training players. Fixed components keep their weight, so the
 * total stays the same and fixed choices (e.g. draft capital) are respected.
 */
export function tuneWeights(train: Scored[], start: Weights, fixed: Component[], step = 0.05, maxIter = 200): Weights {
  const tunable = COMPONENTS.filter((c) => !fixed.includes(c));
  let best = { ...start };
  let bestRho = rho(train, best);
  for (let iter = 0; iter < maxIter; iter++) {
    let improved = false;
    for (const from of tunable) {
      for (const to of tunable) {
        if (from === to || best[from] < step - 1e-9) continue;
        const cand = { ...best, [from]: round(best[from] - step), [to]: round(best[to] + step) };
        const r = rho(train, cand);
        // Require a real gain so ties don't wander.
        if (r > bestRho + 1e-4) {
          best = cand;
          bestRho = r;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

export type TuningResult = {
  position: Position;
  trainN: number;
  testN: number;
  spec: Weights;
  tuned: Weights;
  trainRho: { spec: number; tuned: number };
  testRho: { spec: number; tuned: number };
  /** Tuned weights are adopted only when they do not do worse on the held-out classes. */
  adopt: boolean;
};

export function tunePosition(position: Position, history: HistoryRow[], config: GradingConfig, opts: { trainThrough: number; testThrough: number; fixed: Component[] }): TuningResult {
  const players = scorePlayers(position, history, config, opts.testThrough);
  const train = players.filter((p) => p.draftYear <= opts.trainThrough);
  const test = players.filter((p) => p.draftYear > opts.trainThrough);
  const spec = { ...config.weights[position] } as Weights;
  const tuned = tuneWeights(train, spec, opts.fixed);
  const result = {
    position,
    trainN: train.length,
    testN: test.length,
    spec,
    tuned,
    trainRho: { spec: rho(train, spec), tuned: rho(train, tuned) },
    testRho: { spec: rho(test, spec), tuned: rho(test, tuned) },
  };
  return { ...result, adopt: result.testRho.tuned >= result.testRho.spec };
}

export function tuningMarkdown(results: TuningResult[], meta: { generated: string; trainThrough: number; testThrough: number; fixed: Component[] }): string {
  const f = (v: number) => v.toFixed(3);
  const w = (x: Weights) => `{${COMPONENTS.map((c) => `${c}: ${x[c].toFixed(2)}`).join(", ")}}`;
  const lines = [
    "# Weight tuning",
    "",
    `_Generated ${meta.generated}. Weights searched on draft classes through ${meta.trainThrough}, checked on ${meta.trainThrough + 1}–${meta.testThrough}. Fixed: ${meta.fixed.join(", ") || "none"}._`,
    "",
    "| Position | Train n | Test n | Train ρ spec → tuned | Test ρ spec → tuned | Adopt |",
    "| --- | ---: | ---: | ---: | ---: | :---: |",
    ...results.map((r) => `| ${r.position} | ${r.trainN} | ${r.testN} | ${f(r.trainRho.spec)} → ${f(r.trainRho.tuned)} | ${f(r.testRho.spec)} → ${f(r.testRho.tuned)} | ${r.adopt ? "yes" : "no"} |`),
    "",
    "## Weights",
    "",
    "```yaml",
    "weights:",
    ...results.map((r) => `  ${r.position}: ${w(r.adopt ? r.tuned : r.spec)}`),
    "```",
    "",
    "## Spec weights (for reference)",
    "",
    "```yaml",
    ...results.map((r) => `  ${r.position}: ${w(r.spec)}`),
    "```",
    "",
  ];
  return lines.join("\n");
}
