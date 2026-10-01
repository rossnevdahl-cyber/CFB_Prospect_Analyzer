import type { GradingConfig } from "./config";
import { gradePlayer, type HistoryRow } from "./grading";
import { pearson, spearman } from "./history";
import { COMPONENTS, POSITIONS, type Position } from "./types";

export type BacktestRow = { position: Position; n: number; pearson: number | null; spearman: number | null; pickBaseline: number | null; components: Record<string, number | null> };

/**
 * Grades every drafted player as of their final college season and correlates the grade with NFL
 * years 1–3 PPG. Players drafted in the last `excludeRecent` classes are left out (incomplete outcomes).
 */
export function runBacktest(history: HistoryRow[], config: GradingConfig, opts: { latestDraft: number; excludeRecent?: number; minGames?: number } = { latestDraft: 9999 }): BacktestRow[] {
  const cutoff = opts.latestDraft - (opts.excludeRecent ?? 0);
  return POSITIONS.map((position) => {
    const pool = history.filter((h) => h.position === position);
    const sample = pool.filter((h) => h.draftYear <= cutoff);
    const graded = sample.map((h) => ({ h, g: gradePlayer(h.features, position, pool, config) }));
    // Players who never played count as zero PPG — a bust is an outcome, not missing data.
    const ppg = (h: HistoryRow) => (h.nflGames != null && h.nflGames >= (opts.minGames ?? 1) ? (h.nflPpg ?? 0) : 0);
    const withGrade = graded.filter((x) => x.g.score != null);
    const comp: Record<string, number | null> = {};
    for (const c of COMPONENTS) {
      const xs = graded.filter((x) => x.g.components.find((k) => k.component === c)?.score != null);
      comp[c] = pearson(xs.map((x) => x.g.components.find((k) => k.component === c)!.score as number), xs.map((x) => ppg(x.h)));
    }
    const picks = sample.filter((h) => h.draftPick != null);
    return {
      position,
      n: withGrade.length,
      pearson: pearson(withGrade.map((x) => x.g.score as number), withGrade.map((x) => ppg(x.h))),
      spearman: spearman(withGrade.map((x) => x.g.score as number), withGrade.map((x) => ppg(x.h))),
      pickBaseline: spearman(picks.map((h) => -(h.draftPick as number)), picks.map(ppg)),
      components: comp,
    };
  });
}

export function backtestMarkdown(rows: BacktestRow[], meta: { generated: string; configNote: string; excluded: string }): string {
  const f = (v: number | null) => (v == null ? "—" : v.toFixed(3));
  const lines = [
    "# Backtest: grade vs NFL years 1–3 PPG",
    "",
    `_Generated ${meta.generated}. ${meta.configNote} ${meta.excluded}_`,
    "",
    "| Position | Players graded | Pearson r | Spearman ρ | Draft-pick-only ρ |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...rows.map((r) => `| ${r.position} | ${r.n} | ${f(r.pearson)} | ${f(r.spearman)} | ${f(r.pickBaseline)} |`),
    "",
    "## Component correlations (Pearson r with PPG)",
    "",
    `| Position | ${COMPONENTS.join(" | ")} |`,
    `| --- | ${COMPONENTS.map(() => "---:").join(" | ")} |`,
    ...rows.map((r) => `| ${r.position} | ${COMPONENTS.map((c) => f(r.components[c])).join(" | ")} |`),
    "",
    "Percentiles are computed against the full historical table, including the player being graded.",
    "",
  ];
  return lines.join("\n");
}
