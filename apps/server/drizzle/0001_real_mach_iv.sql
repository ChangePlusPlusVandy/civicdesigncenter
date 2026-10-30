CREATE TYPE "public"."actor_type" AS ENUM('participant', 'teacher', 'system');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('applied', 'rejected');--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "participant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "seq" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "actor_type" "actor_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "teacher_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "team_id" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "outcome" "outcome" DEFAULT 'applied' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "role" text DEFAULT 'seat' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("team_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_same_game_fk" FOREIGN KEY ("team_id","game_id") REFERENCES "public"."teams"("team_id","game_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_game_seq_index" ON "events" USING btree ("game_id","seq");--> statement-breakpoint
CREATE INDEX "events_team_idx" ON "events" USING btree ("team_id");