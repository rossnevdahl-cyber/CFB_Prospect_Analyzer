CREATE TABLE "adp_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"cfbd_id" text,
	"player_name" text NOT NULL,
	"name_norm" text NOT NULL,
	"school" text,
	"school_norm" text DEFAULT '' NOT NULL,
	"position" text,
	"adp" real NOT NULL,
	"format" text NOT NULL,
	"source" text NOT NULL,
	"as_of" date NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "big_board_ranks" (
	"id" serial PRIMARY KEY NOT NULL,
	"cfbd_id" text,
	"player_name" text NOT NULL,
	"name_norm" text NOT NULL,
	"school" text,
	"school_norm" text DEFAULT '' NOT NULL,
	"position" text,
	"rank" integer NOT NULL,
	"projected_round" integer,
	"source" text NOT NULL,
	"as_of" date NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_year" integer NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tiers" jsonb NOT NULL,
	"entries" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"class_year" integer PRIMARY KEY NOT NULL,
	"tiers" jsonb NOT NULL,
	"entries" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combine_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"pfr_id" text,
	"cfb_id" text,
	"player_name" text NOT NULL,
	"name_norm" text NOT NULL,
	"position" text NOT NULL,
	"school" text,
	"school_norm" text,
	"height_in" real,
	"weight" real,
	"forty" real,
	"bench" real,
	"vertical" real,
	"broad" real,
	"cone" real,
	"shuttle" real
);
--> statement-breakpoint
CREATE TABLE "history_players" (
	"id" text PRIMARY KEY NOT NULL,
	"cfbd_id" text,
	"gsis_id" text,
	"pfr_id" text,
	"name" text NOT NULL,
	"position" text NOT NULL,
	"college" text NOT NULL,
	"draft_year" integer NOT NULL,
	"draft_round" integer,
	"draft_pick" integer,
	"birthdate" date,
	"height_in" real,
	"weight" real,
	"features" jsonb NOT NULL,
	"college_seasons" jsonb NOT NULL,
	"college_line" text DEFAULT '' NOT NULL,
	"college_complete" boolean DEFAULT false NOT NULL,
	"nfl_ppg" real,
	"nfl_games" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"file_name" text,
	"rows" integer NOT NULL,
	"matched" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"cfbd_id" text NOT NULL,
	"player_name" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pff_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"cfbd_id" text,
	"player_name" text NOT NULL,
	"name_norm" text NOT NULL,
	"team" text,
	"team_norm" text DEFAULT '' NOT NULL,
	"position" text,
	"season" integer NOT NULL,
	"metrics" jsonb NOT NULL,
	"file_name" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"cfbd_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"team" text NOT NULL,
	"position" text NOT NULL,
	"grade" real,
	"tier" text,
	"data" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_players" (
	"cfbd_id" text NOT NULL,
	"season" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"full_name" text NOT NULL,
	"name_norm" text NOT NULL,
	"team" text NOT NULL,
	"position" text,
	"height" integer,
	"weight" integer,
	"jersey" integer,
	"class_year" integer,
	"home_city" text,
	"home_state" text,
	"home_country" text,
	"recruit_ids" jsonb,
	CONSTRAINT "roster_players_cfbd_id_season_pk" PRIMARY KEY("cfbd_id","season")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" integer PRIMARY KEY NOT NULL,
	"school" text NOT NULL,
	"conference" text,
	"abbreviation" text,
	"color" text,
	"alt_color" text,
	"logo" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_school_unique" UNIQUE("school")
);
--> statement-breakpoint
CREATE TABLE "video_cache" (
	"cfbd_id" text PRIMARY KEY NOT NULL,
	"videos" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"cfbd_id" text NOT NULL,
	"video_id" text NOT NULL,
	"action" text NOT NULL,
	"video" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "adp_name_idx" ON "adp_entries" USING btree ("name_norm");--> statement-breakpoint
CREATE INDEX "bb_name_idx" ON "big_board_ranks" USING btree ("name_norm");--> statement-breakpoint
CREATE INDEX "snap_class_idx" ON "board_snapshots" USING btree ("class_year","taken_at");--> statement-breakpoint
CREATE INDEX "combine_pos_idx" ON "combine_results" USING btree ("position");--> statement-breakpoint
CREATE INDEX "combine_name_idx" ON "combine_results" USING btree ("name_norm");--> statement-breakpoint
CREATE INDEX "history_pos_idx" ON "history_players" USING btree ("position");--> statement-breakpoint
CREATE INDEX "history_cfbd_idx" ON "history_players" USING btree ("cfbd_id");--> statement-breakpoint
CREATE INDEX "notes_player_idx" ON "notes" USING btree ("cfbd_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pff_player_season_idx" ON "pff_imports" USING btree ("name_norm","team_norm","season");--> statement-breakpoint
CREATE INDEX "roster_name_idx" ON "roster_players" USING btree ("name_norm");--> statement-breakpoint
CREATE INDEX "roster_team_idx" ON "roster_players" USING btree ("team","season");--> statement-breakpoint
CREATE UNIQUE INDEX "video_override_idx" ON "video_overrides" USING btree ("cfbd_id","video_id");