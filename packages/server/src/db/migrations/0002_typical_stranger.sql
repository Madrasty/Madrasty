CREATE TABLE IF NOT EXISTS "audio_lesson_details" (
	"lesson_id" uuid PRIMARY KEY NOT NULL,
	"audio_url" text,
	"duration_seconds" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_lesson_details" (
	"lesson_id" uuid PRIMARY KEY NOT NULL,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"meeting_url" text,
	"recording_url" text,
	"attendance_taken" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pdf_lesson_details" (
	"lesson_id" uuid PRIMARY KEY NOT NULL,
	"file_url" text,
	"page_count" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recorded_lesson_details" (
	"lesson_id" uuid PRIMARY KEY NOT NULL,
	"video_url" text,
	"duration_seconds" integer,
	"attachments" jsonb
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audio_lesson_details" ADD CONSTRAINT "audio_lesson_details_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "live_lesson_details" ADD CONSTRAINT "live_lesson_details_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pdf_lesson_details" ADD CONSTRAINT "pdf_lesson_details_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recorded_lesson_details" ADD CONSTRAINT "recorded_lesson_details_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
