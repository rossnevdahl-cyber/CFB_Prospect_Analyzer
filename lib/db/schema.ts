import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** FBS teams from CFBD, refreshed by sync-rosters. */
export const teams = pgTable("teams", {
  id: integer("id").primaryKey(),
  school: text("school").notNull().unique(),
  conference: text("conference"),
  abbreviation: text("abbreviation"),
  color: text("color"),
  altColor: text("alt_color"),
  logo: text("logo"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Cached CFBD rosters, one row per player per season. Used for search and season-to-team mapping. */
export const rosterPlayers = pgTable(
  "roster_players",
  {
    cfbdId: text("cfbd_id").notNull(),
    season: integer("season").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fullName: text("full_name").notNull(),
    nameNorm: text("name_norm").notNull(),
    team: text("team").notNull(),
    position: text("position"),
    height: integer("height"),
    weight: integer("weight"),
    jersey: integer("jersey"),
    classYear: integer("class_year"),
    homeCity: text("home_city"),
    homeState: text("home_state"),
    homeCountry: text("home_country"),
    recruitIds: jsonb("recruit_ids").$type<string[] | null>(),
  },
  (t) => [
    primaryKey({ columns: [t.cfbdId, t.season] }),
    index("roster_name_idx").on(t.nameNorm),
    index("roster_team_idx").on(t.team, t.season),
  ],
);

/** Response cache for every adapter. expires_at null means never expires (past seasons). */
export const apiCache = pgTable("api_cache", {
  key: text("key").primaryKey(),
  source: text("source").notNull(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

/** Last generated report per player, including the grade the boards display. */
export const reports = pgTable("reports", {
  cfbdId: text("cfbd_id").primaryKey(),
  name: text("name").notNull(),
  team: text("team").notNull(),
  position: text("position").notNull(),
  grade: real("grade"),
  tier: text("tier"),
  data: jsonb("data").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Drafted players with college features as of their final season and NFL years 1–3 outcome. */
export const historyPlayers = pgTable(
  "history_players",
  {
    id: text("id").primaryKey(),
    cfbdId: text("cfbd_id"),
    gsisId: text("gsis_id"),
    pfrId: text("pfr_id"),
    name: text("name").notNull(),
    position: text("position").notNull(),
    college: text("college").notNull(),
    draftYear: integer("draft_year").notNull(),
    draftRound: integer("draft_round"),
    draftPick: integer("draft_pick"),
    birthdate: date("birthdate"),
    heightIn: real("height_in"),
    weight: real("weight"),
    features: jsonb("features").$type<Record<string, number | null>>().notNull(),
    collegeSeasons: jsonb("college_seasons").notNull(),
    collegeLine: text("college_line").notNull().default(""),
    collegeComplete: boolean("college_complete").notNull().default(false),
    nflPpg: real("nfl_ppg"),
    nflGames: integer("nfl_games"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("history_pos_idx").on(t.position), index("history_cfbd_idx").on(t.cfbdId)],
);

/** nflverse combine results — the reference population for athletic scores. */
export const combineResults = pgTable(
  "combine_results",
  {
    id: serial("id").primaryKey(),
    season: integer("season").notNull(),
    pfrId: text("pfr_id"),
    cfbId: text("cfb_id"),
    playerName: text("player_name").notNull(),
    nameNorm: text("name_norm").notNull(),
    position: text("position").notNull(),
    school: text("school"),
    schoolNorm: text("school_norm"),
    heightIn: real("height_in"),
    weight: real("weight"),
    forty: real("forty"),
    bench: real("bench"),
    vertical: real("vertical"),
    broad: real("broad"),
    cone: real("cone"),
    shuttle: real("shuttle"),
  },
  (t) => [index("combine_pos_idx").on(t.position), index("combine_name_idx").on(t.nameNorm)],
);

/** PFF College CSV rows, one per player-season. Metrics keyed by PFF column name. */
export const pffImports = pgTable(
  "pff_imports",
  {
    id: serial("id").primaryKey(),
    cfbdId: text("cfbd_id"),
    playerName: text("player_name").notNull(),
    nameNorm: text("name_norm").notNull(),
    team: text("team"),
    teamNorm: text("team_norm").notNull().default(""),
    position: text("position"),
    season: integer("season").notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull(),
    fileName: text("file_name"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pff_player_season_idx").on(t.nameNorm, t.teamNorm, t.season)],
);

export const bigBoardRanks = pgTable(
  "big_board_ranks",
  {
    id: serial("id").primaryKey(),
    cfbdId: text("cfbd_id"),
    playerName: text("player_name").notNull(),
    nameNorm: text("name_norm").notNull(),
    school: text("school"),
    schoolNorm: text("school_norm").notNull().default(""),
    position: text("position"),
    rank: integer("rank").notNull(),
    projectedRound: integer("projected_round"),
    source: text("source").notNull(),
    asOf: date("as_of").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bb_name_idx").on(t.nameNorm)],
);

export const adpEntries = pgTable(
  "adp_entries",
  {
    id: serial("id").primaryKey(),
    cfbdId: text("cfbd_id"),
    playerName: text("player_name").notNull(),
    nameNorm: text("name_norm").notNull(),
    school: text("school"),
    schoolNorm: text("school_norm").notNull().default(""),
    position: text("position"),
    adp: real("adp").notNull(),
    format: text("format").notNull(),
    source: text("source").notNull(),
    asOf: date("as_of").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("adp_name_idx").on(t.nameNorm)],
);

export const importLog = pgTable("import_log", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  fileName: text("file_name"),
  rows: integer("rows").notNull(),
  matched: integer("matched").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    cfbdId: text("cfbd_id").notNull(),
    playerName: text("player_name").notNull().default(""),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [index("notes_player_idx").on(t.cfbdId)],
);

export type BoardTier = { label: string; color: string };
export type BoardEntry = {
  cfbdId: string;
  name: string;
  position: string;
  school: string;
  tier: string | null;
};

/** One board per draft class. Order lives in a single jsonb array so a reorder is one atomic write. */
export const boards = pgTable("boards", {
  classYear: integer("class_year").primaryKey(),
  tiers: jsonb("tiers").$type<BoardTier[]>().notNull(),
  entries: jsonb("entries").$type<BoardEntry[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const boardSnapshots = pgTable(
  "board_snapshots",
  {
    id: serial("id").primaryKey(),
    classYear: integer("class_year").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    tiers: jsonb("tiers").$type<BoardTier[]>().notNull(),
    entries: jsonb("entries").$type<BoardEntry[]>().notNull(),
  },
  (t) => [index("snap_class_idx").on(t.classYear, t.takenAt)],
);

export const videoCache = pgTable("video_cache", {
  cfbdId: text("cfbd_id").primaryKey(),
  videos: jsonb("videos").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Manual video fixes: pin, hide, or a pasted link. They survive cache refreshes. */
export const videoOverrides = pgTable(
  "video_overrides",
  {
    id: serial("id").primaryKey(),
    cfbdId: text("cfbd_id").notNull(),
    videoId: text("video_id").notNull(),
    action: text("action").$type<"pin" | "hide" | "add">().notNull(),
    video: jsonb("video"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("video_override_idx").on(t.cfbdId, t.videoId)],
);
