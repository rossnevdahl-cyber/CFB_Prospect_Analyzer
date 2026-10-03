CREATE TABLE "fantasy_rankings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"as_of" date NOT NULL,
	"format" text NOT NULL,
	"class_year" integer NOT NULL,
	"rank" integer NOT NULL,
	"cfbd_id" text,
	"player_name" text NOT NULL,
	"name_norm" text NOT NULL,
	"school" text,
	"school_norm" text DEFAULT '' NOT NULL,
	"position" text,
	"nfl_rank" integer,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fr_snapshot_idx" ON "fantasy_rankings" USING btree ("class_year","format","source","as_of");--> statement-breakpoint
CREATE INDEX "fr_player_idx" ON "fantasy_rankings" USING btree ("cfbd_id");--> statement-breakpoint
CREATE INDEX "fr_name_idx" ON "fantasy_rankings" USING btree ("name_norm");