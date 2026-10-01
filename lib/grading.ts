import type { GradingConfig } from "./config";
import { tierFor } from "./config";
import type { CareerProfile } from "./metrics";
import { percentileRank } from "./metrics";
import { COMPONENTS, type Component, type Position } from "./types";

export type FeatureDef = {
  key: string;
  label: string;
  component: Component;
  higherIsBetter: boolean;
  format: "pct" | "num1" | "num2" | "num3" | "int" | "age";
};

const production = (pos: Position): FeatureDef[] =>
  pos === "QB"
    ? [
        { key: "peak_total_ypg", label: "Peak total yards/game", component: "production", higherIsBetter: true, format: "num1" },
        { key: "career_rush_share", label: "Rushing share of team yards", component: "production", higherIsBetter: true, format: "pct" },
      ]
    : [
        { key: "peak_dominator", label: "Peak dominator", component: "production", higherIsBetter: true, format: "pct" },
        { key: "career_dominator", label: "Career dominator", component: "production", higherIsBetter: true, format: "pct" },
        { key: "peak_rec_ytpa", label: "Peak rec yds / team pass att", component: "production", higherIsBetter: true, format: "num2" },
        { key: "peak_scrim_ypg", label: "Peak scrimmage yards/game", component: "production", higherIsBetter: true, format: "num1" },
      ];

const efficiency = (pos: Position): FeatureDef[] => {
  const e = (key: string, label: string, format: FeatureDef["format"] = "num2"): FeatureDef => ({
    key, label, component: "efficiency", higherIsBetter: true, format,
  });
  switch (pos) {
    case "QB":
      return [e("peak_any_a", "Peak ANY/A"), e("career_any_a", "Career ANY/A"), e("peak_epa_pass", "Peak EPA/dropback", "num3"), e("pff_pass_grade", "PFF passing grade", "num1")];
    case "RB":
      return [e("peak_epa_rush", "Peak EPA/rush", "num3"), e("career_ypc", "Career YPC"), e("pff_yco", "Yards after contact/att"), e("pff_yprr", "YPRR")];
    default:
      return [e("peak_epa_all", "Peak EPA/play", "num3"), e("pff_yprr", "YPRR")];
  }
};

const ageBreakout = (pos: Position): FeatureDef[] =>
  pos === "QB"
    ? [{ key: "age_at_peak", label: "Age at peak season", component: "age_breakout", higherIsBetter: false, format: "age" }]
    : [
        { key: "breakout_age", label: "Breakout age", component: "age_breakout", higherIsBetter: false, format: "age" },
        { key: "age_at_peak", label: "Age at peak season", component: "age_breakout", higherIsBetter: false, format: "age" },
      ];

export function featureDefs(pos: Position): FeatureDef[] {
  return [
    ...production(pos),
    ...efficiency(pos),
    ...ageBreakout(pos),
    { key: "athletic_score", label: "Athletic score", component: "athleticism", higherIsBetter: true, format: "num1" },
    { key: "draft_pick", label: "Draft pick (actual or projected)", component: "draft_capital", higherIsBetter: false, format: "int" },
    { key: "recruit_rating", label: "Recruiting composite", component: "pedigree", higherIsBetter: true, format: "num3" },
    { key: "context_raw", label: "Team context (QB, pace, SOS)", component: "context", higherIsBetter: true, format: "num2" },
  ];
}

export type FeatureVector = Record<string, number | null>;

export type FeatureInputs = {
  profile: CareerProfile;
  athleticScore: number | null;
  draftPick: number | null;
  recruitRating: number | null;
  contextRaw: number | null;
  pff?: { passGrade?: number | null; yco?: number | null; yprr?: number | null };
};

/**
 * Turns a career profile into the grade's feature vector. A player who never hit the breakout
 * threshold is scored as breaking out one year after their last season.
 */
export function extractFeatures(i: FeatureInputs): FeatureVector {
  const p = i.profile;
  const breakout = p.breakoutAge ?? (p.noBreakout && p.finalSeasonAge != null ? p.finalSeasonAge + 1 : null);
  return {
    peak_total_ypg: p.peakTotalYpg,
    career_rush_share: p.careerRushShare,
    peak_dominator: p.peakDominator,
    career_dominator: p.careerDominator,
    peak_rec_ytpa: p.peakRecYdsPerTeamPassAtt,
    peak_scrim_ypg: p.peakScrimYpg,
    peak_any_a: p.peakAnyA,
    career_any_a: p.careerAnyA,
    peak_epa_pass: p.peakEpaPass,
    peak_epa_rush: p.peakEpaRush,
    peak_epa_all: p.peakEpaAll,
    career_ypc: p.careerYpc,
    pff_pass_grade: i.pff?.passGrade ?? null,
    pff_yco: i.pff?.yco ?? null,
    pff_yprr: i.pff?.yprr ?? null,
    breakout_age: p.position === "QB" ? null : breakout,
    age_at_peak: p.ageAtPeak,
    athletic_score: i.athleticScore,
    draft_pick: i.draftPick,
    recruit_rating: i.recruitRating,
    context_raw: i.contextRaw,
  };
}

/** A historical player: features as of their final college season, plus NFL outcome. */
export type HistoryRow = {
  id: string;
  cfbdId: string | null;
  name: string;
  position: Position;
  college: string;
  draftYear: number;
  draftRound: number | null;
  draftPick: number | null;
  heightIn: number | null;
  weight: number | null;
  features: FeatureVector;
  collegeLine: string;
  collegeComplete: boolean;
  nflPpg: number | null;
  nflGames: number | null;
};

export type ComponentResult = {
  component: Component;
  weight: number;
  effectiveWeight: number;
  score: number | null;
  reason: string | null;
  features: { key: string; label: string; value: number | null; percentile: number | null; note?: string }[];
};

export type GradeResult = {
  score: number | null;
  tier: string | null;
  confidence: number;
  components: ComponentResult[];
};

/** Collects the population of a feature across history at one position. */
export function population(history: HistoryRow[], key: string): number[] {
  return history.map((h) => h.features[key]).filter((v): v is number => v != null && Number.isFinite(v));
}

/**
 * Weighted average of component percentiles. Components that cannot be computed hand their
 * weight to the rest; confidence is the share of total weight backed by real data.
 */
export function gradePlayer(
  features: FeatureVector,
  position: Position,
  history: HistoryRow[],
  config: GradingConfig,
): GradeResult {
  const weights = config.weights[position];
  const totalWeight = COMPONENTS.reduce((a, c) => a + weights[c], 0);
  const defs = featureDefs(position);
  const atPos = history.filter((h) => h.position === position);

  const components: ComponentResult[] = COMPONENTS.map((component) => {
    const fs = defs.filter((d) => d.component === component).map((d) => {
      const value = features[d.key] ?? null;
      const pop = population(atPos, d.key);
      if (value == null) return { key: d.key, label: d.label, value, percentile: null, note: "no data" };
      if (pop.length < config.min_history_sample) {
        return { key: d.key, label: d.label, value, percentile: null, note: `history sample too small (${pop.length})` };
      }
      return { key: d.key, label: d.label, value, percentile: percentileRank(value, pop, d.higherIsBetter) };
    });
    const scored = fs.filter((f) => f.percentile != null);
    const score = scored.length ? scored.reduce((a, f) => a + (f.percentile as number), 0) / scored.length : null;
    let reason: string | null = null;
    if (score == null) {
      if (component === "athleticism" && features.athletic_score == null) reason = "Excluded until the player tests";
      else if (fs.every((f) => f.value == null)) reason = "No data";
      else reason = "Not enough historical data to rank against";
    }
    return { component, weight: weights[component], effectiveWeight: 0, score, reason, features: fs };
  });

  const backed = components.filter((c) => c.score != null && c.weight > 0);
  const backedWeight = backed.reduce((a, c) => a + c.weight, 0);
  for (const c of backed) c.effectiveWeight = backedWeight ? c.weight / backedWeight : 0;
  const score = backedWeight
    ? backed.reduce((a, c) => a + (c.score as number) * c.effectiveWeight, 0)
    : null;
  const rounded = score == null ? null : Math.round(score * 10) / 10;
  return {
    score: rounded,
    tier: rounded == null ? null : tierFor(rounded, config.tiers),
    confidence: totalWeight ? backedWeight / totalWeight : 0,
    components,
  };
}
