import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { POSITIONS, COMPONENTS } from "./types";

const weightsSchema = z.object(
  Object.fromEntries(COMPONENTS.map((c) => [c, z.number().min(0)])) as Record<
    (typeof COMPONENTS)[number],
    z.ZodNumber
  >,
);

export const gradingConfigSchema = z.object({
  scoring: z.object({
    ppr: z.number().default(1),
    pass_td: z.number().default(5),
    pass_yd: z.number().default(0.04),
    rush_rec_yd: z.number().default(0.1),
    rush_rec_td: z.number().default(6),
    int: z.number().default(-2),
    fumble_lost: z.number().default(-2),
    two_pt: z.number().default(2),
    superflex: z.boolean().default(true),
  }),
  weights: z.object(
    Object.fromEntries(POSITIONS.map((p) => [p, weightsSchema])) as Record<
      (typeof POSITIONS)[number],
      typeof weightsSchema
    >,
  ),
  breakout_threshold: z.object({ WR: z.number(), TE: z.number(), RB: z.number() }),
  tiers: z.record(z.string(), z.number()),
  comps: z.object({ count: z.number().int().positive(), min_similarity: z.number().min(0).max(1) }),
  min_history_sample: z.number().int().nonnegative().default(30),
  comp_size_weight: z.number().min(0).default(0.1),
});

export type GradingConfig = z.infer<typeof gradingConfigSchema>;

export function parseGradingConfig(text: string): GradingConfig {
  return gradingConfigSchema.parse(YAML.parse(text));
}

let cached: GradingConfig | null = null;

/** Loads config/grading.yaml. Read once per server instance; a redeploy picks up edits. */
export function loadGradingConfig(): GradingConfig {
  if (cached) return cached;
  const file = path.join(process.cwd(), "config", "grading.yaml");
  cached = parseGradingConfig(fs.readFileSync(file, "utf8"));
  return cached;
}

/** Tier label for a 0–100 grade, using the highest cutoff the grade clears. */
export function tierFor(grade: number, tiers: Record<string, number>): string {
  const sorted = Object.entries(tiers).sort((a, b) => b[1] - a[1]);
  for (const [name, cutoff] of sorted) if (grade >= cutoff) return name;
  return "Below Dart";
}
