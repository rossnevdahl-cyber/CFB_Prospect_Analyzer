import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGradingConfig } from "@/lib/config";
import { regrade, rho, tunePosition, tuneWeights, tuningMarkdown, type Scored, type Weights } from "@/lib/tuning";
import { COMPONENTS } from "@/lib/types";
import { rng } from "./helpers/history";

const config = parseGradingConfig(fs.readFileSync(path.join(__dirname, "..", "config", "grading.yaml"), "utf8"));
const spec = config.weights.WR as Weights;

/** Production predicts the outcome; efficiency and context are pure noise. */
function players(n: number, seed: number): Scored[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const t = r();
    return {
      draftYear: 2010 + (i % 14),
      ppg: t * 15,
      scores: { production: t * 100, efficiency: r() * 100, context: r() * 100, age_breakout: (t * 0.5 + r() * 0.5) * 100, draft_capital: (t * 0.6 + r() * 0.4) * 100, pedigree: r() * 100 },
    };
  });
}

describe("weight tuning", () => {
  it("regrade redistributes missing components like gradePlayer", () => {
    expect(regrade({ draftYear: 2020, ppg: 0, scores: { production: 80, efficiency: 40 } }, { ...spec })).toBeCloseTo((80 * 0.3 + 40 * 0.15) / 0.45, 10);
  });

  it("moves weight toward signal and away from noise, keeping fixed components and the total", () => {
    const train = players(400, 1);
    const tuned = tuneWeights(train, spec, ["draft_capital"]);
    expect(tuned.draft_capital).toBe(spec.draft_capital);
    const total = (w: Weights) => COMPONENTS.reduce((a, c) => a + w[c], 0);
    expect(total(tuned)).toBeCloseTo(total(spec), 10);
    expect(tuned.production).toBeGreaterThan(spec.production);
    expect(tuned.efficiency).toBeLessThan(spec.efficiency);
    expect(COMPONENTS.every((c) => tuned[c] >= 0)).toBe(true);
    expect(rho(players(400, 2), tuned)).toBeGreaterThan(rho(players(400, 2), spec));
  });

  it("runs end to end on history rows and reports adoption", async () => {
    const { syntheticHistory } = await import("./helpers/history");
    const res = tunePosition("WR", syntheticHistory("WR", 300, 5), config, { trainThrough: 2016, testThrough: 2022, fixed: ["draft_capital"] });
    expect(res.trainN + res.testN).toBe(300);
    expect(res.trainRho.tuned).toBeGreaterThanOrEqual(res.trainRho.spec);
    const md = tuningMarkdown([res], { generated: "x", trainThrough: 2016, testThrough: 2022, fixed: ["draft_capital"] });
    expect(md).toContain("| WR | ");
    expect(md).toContain("WR: {production:");
  });
});
