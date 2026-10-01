import { z } from "zod";

export const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export const positionSchema = z.enum(POSITIONS);
export type Position = z.infer<typeof positionSchema>;

export const COMPONENTS = [
  "production",
  "efficiency",
  "age_breakout",
  "athleticism",
  "draft_capital",
  "pedigree",
  "context",
] as const;
export type Component = (typeof COMPONENTS)[number];

export const COMPONENT_LABELS: Record<Component, string> = {
  production: "Production",
  efficiency: "Efficiency",
  age_breakout: "Age & breakout",
  athleticism: "Athleticism",
  draft_capital: "Draft capital",
  pedigree: "Pedigree",
  context: "Context adjustment",
};

/** Maps CFBD roster positions onto the four supported positions. */
export function normalizePosition(pos: string | null | undefined): Position | null {
  if (!pos) return null;
  const p = pos.toUpperCase().trim();
  if (p === "QB") return "QB";
  if (p === "RB" || p === "HB" || p === "FB" || p === "TB") return "RB";
  if (p === "WR" || p === "SL" || p === "FL" || p === "SE") return "WR";
  if (p === "TE") return "TE";
  return null;
}

export const CLASS_LABELS: Record<number, string> = { 1: "FR", 2: "SO", 3: "JR", 4: "SR", 5: "5th" };

/** One college season of box-score production, keyed by CFBD player id. */
export const seasonStatsSchema = z.object({
  season: z.number().int(),
  team: z.string(),
  conference: z.string().nullable(),
  games: z.number().nullable(),
  passCmp: z.number().default(0),
  passAtt: z.number().default(0),
  passYds: z.number().default(0),
  passTd: z.number().default(0),
  passInt: z.number().default(0),
  rushAtt: z.number().default(0),
  rushYds: z.number().default(0),
  rushTd: z.number().default(0),
  rec: z.number().default(0),
  recYds: z.number().default(0),
  recTd: z.number().default(0),
  /** Targets are not in the free CFBD box score; filled from PFF imports when present. */
  targets: z.number().nullable().default(null),
  /** Sacks taken (QB). Estimated from team sacks allowed × share of team pass attempts. */
  sacks: z.number().nullable().default(null),
  sackYds: z.number().nullable().default(null),
  sacksEstimated: z.boolean().default(false),
  epaPass: z.number().nullable().default(null),
  epaRush: z.number().nullable().default(null),
  epaAll: z.number().nullable().default(null),
  usage: z.number().nullable().default(null),
});
export type SeasonStats = z.infer<typeof seasonStatsSchema>;

/** Team-level totals and context for one season. */
export const teamSeasonSchema = z.object({
  season: z.number().int(),
  team: z.string(),
  games: z.number().nullable(),
  passAtt: z.number().nullable(),
  passYds: z.number().nullable(),
  passTd: z.number().nullable(),
  rushAtt: z.number().nullable(),
  rushYds: z.number().nullable(),
  rushTd: z.number().nullable(),
  sacksAllowed: z.number().nullable(),
  plays: z.number().nullable(),
  /** Team passing EPA/play — proxy for QB quality. */
  passEpa: z.number().nullable(),
  passEpaRank: z.number().nullable(),
  paceRank: z.number().nullable(),
  lineYards: z.number().nullable(),
  oLineRank: z.number().nullable(),
  spRating: z.number().nullable(),
  spRank: z.number().nullable(),
  /** Average SP+ rating of opponents faced. */
  sos: z.number().nullable(),
  sosRank: z.number().nullable(),
  fbsTeams: z.number().nullable(),
});
export type TeamSeason = z.infer<typeof teamSeasonSchema>;

export const recruitingSchema = z.object({
  year: z.number().int(),
  stars: z.number().nullable(),
  rating: z.number().nullable(),
  nationalRank: z.number().nullable(),
  positionRank: z.number().nullable(),
  recruitPosition: z.string().nullable(),
  school: z.string().nullable(),
  committedTo: z.string().nullable(),
});
export type Recruiting = z.infer<typeof recruitingSchema>;

export const combineSchema = z.object({
  season: z.number().int().nullable(),
  heightIn: z.number().nullable(),
  weight: z.number().nullable(),
  forty: z.number().nullable(),
  vertical: z.number().nullable(),
  broad: z.number().nullable(),
  cone: z.number().nullable(),
  shuttle: z.number().nullable(),
  bench: z.number().nullable(),
  source: z.string(),
});
export type Combine = z.infer<typeof combineSchema>;

export const DRILLS = ["forty", "vertical", "broad", "cone", "shuttle", "bench"] as const;
export type Drill = (typeof DRILLS)[number];
export const DRILL_LABELS: Record<Drill, string> = {
  forty: "40-yard dash",
  vertical: "Vertical",
  broad: "Broad jump",
  cone: "3-cone",
  shuttle: "Shuttle",
  bench: "Bench",
};
/** Timed drills: lower is better. */
export const LOWER_IS_BETTER: Record<Drill, boolean> = {
  forty: true,
  vertical: false,
  broad: false,
  cone: true,
  shuttle: true,
  bench: false,
};

export type DataGap = { section: string; field: string; reason: string };
export type SourceStamp = { source: string; detail: string; fetchedAt: string | null };
