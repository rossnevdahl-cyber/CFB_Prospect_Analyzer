import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findComps, similarityFromDistance } from "@/lib/comps";
import { parseGradingConfig, tierFor } from "@/lib/config";
import { gradePlayer } from "@/lib/grading";
import { syntheticHistory } from "./helpers/history";

const yaml = fs.readFileSync(path.join(__dirname, "..", "config", "grading.yaml"), "utf8");
const config = parseGradingConfig(yaml);
const history = syntheticHistory("WR");

describe("grading config", () => {
  it("parses the repo's grading.yaml", () => {
    expect(config.weights.WR.production).toBe(0.3);
    expect(config.breakout_threshold.TE).toBe(0.15);
    expect(config.scoring.pass_td).toBe(5);
  });
  it("maps grades to tiers by highest cutoff cleared", () => {
    expect(tierFor(90, config.tiers)).toBe("Elite");
    expect(tierFor(70, config.tiers)).toBe("Starter");
    expect(tierFor(54.9, config.tiers)).toBe("Dart");
    expect(tierFor(10, config.tiers)).toBe("Below Dart");
  });
  it("editing the yaml changes the grade with no code change", () => {
    const player = { ...history[5].features, athletic_score: null };
    const base = gradePlayer(player, "WR", history, config);
    const edited = parseGradingConfig(yaml.replace("WR: {production: 0.30", "WR: {production: 0.90"));
    const after = gradePlayer(player, "WR", history, edited);
    expect(after.score).not.toBe(base.score);
    const tiers = parseGradingConfig(yaml.replace("tiers: {Elite: 85, Starter: 70, Flex: 55, Dart: 40}", "tiers: {Elite: 1, Starter: 0.5}"));
    expect(gradePlayer(player, "WR", history, tiers).tier).toBe("Elite");
  });
});

describe("gradePlayer", () => {
  it("redistributes missing weight and reports confidence", () => {
    const features = { ...history[0].features, athletic_score: null };
    const g = gradePlayer(features, "WR", history, config);
    const ath = g.components.find((c) => c.component === "athleticism")!;
    expect(ath.score).toBeNull();
    expect(ath.reason).toMatch(/until the player tests/);
    expect(g.confidence).toBeCloseTo(0.9, 10); // athleticism weight 0.10 of 1.00
    const eff = g.components.filter((c) => c.score != null).reduce((a, c) => a + c.effectiveWeight, 0);
    expect(eff).toBeCloseTo(1, 10);
    expect(g.score).toBeGreaterThanOrEqual(0);
    expect(g.score).toBeLessThanOrEqual(100);
  });
  it("skips features without enough history (e.g. YPRR without PFF history)", () => {
    const g = gradePlayer({ ...history[0].features, pff_yprr: 2.5 }, "WR", history, config);
    const yprr = g.components.find((c) => c.component === "efficiency")!.features.find((f) => f.key === "pff_yprr")!;
    expect(yprr.percentile).toBeNull();
    expect(yprr.note).toMatch(/history sample too small/);
  });
  it("returns no grade with zero confidence when the history table is empty", () => {
    const g = gradePlayer(history[0].features, "WR", [], config);
    expect(g.score).toBeNull();
    expect(g.confidence).toBe(0);
  });
  it("ranks a dominant profile above a weak one", () => {
    const best = [...history].sort((a, b) => (b.nflPpg ?? 0) - (a.nflPpg ?? 0))[0];
    const worst = [...history].sort((a, b) => (a.nflPpg ?? 0) - (b.nflPpg ?? 0))[0];
    expect(gradePlayer(best.features, "WR", history, config).score!).toBeGreaterThan(gradePlayer(worst.features, "WR", history, config).score!);
  });
});

describe("comps", () => {
  it("finds the nearest complete-college players with similarity ≥ threshold", () => {
    const target = history[11];
    const comps = findComps({ features: target.features, heightIn: target.heightIn, weight: target.weight }, "WR", history, config, target.id);
    expect(comps.length).toBeGreaterThan(0);
    expect(comps.length).toBeLessThanOrEqual(5);
    expect(comps.every((c) => c.similarity >= 0.6)).toBe(true);
    expect(comps.map((c) => c.id)).not.toContain(target.id);
    const byId = new Map(history.map((h) => [h.id, h]));
    expect(comps.every((c) => byId.get(c.id)!.collegeComplete)).toBe(true);
    for (let i = 1; i < comps.length; i++) expect(comps[i - 1].similarity).toBeGreaterThanOrEqual(comps[i].similarity);
  });
  it("an identical profile is a 100% match", () => {
    const twin = { ...history[3], id: "twin", collegeComplete: true };
    const comps = findComps({ features: twin.features, heightIn: twin.heightIn, weight: twin.weight }, "WR", [...history, twin], config, history[3].id);
    expect(comps[0].id).toBe("twin");
    expect(comps[0].similarity).toBeCloseTo(1, 10);
    expect(similarityFromDistance(1)).toBeCloseTo(Math.exp(-0.5), 10);
  });
});
