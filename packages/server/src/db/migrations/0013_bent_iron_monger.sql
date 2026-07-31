CREATE TABLE IF NOT EXISTS "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"session_type" text NOT NULL,
	"session_id" uuid NOT NULL,
	"status" text NOT NULL,
	"recorded_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_lesson_details" ADD COLUMN "channel_name" text;--> statement-breakpoint
ALTER TABLE "live_lesson_details" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_lesson_details" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_session_student_idx" ON "attendance_records" USING btree ("session_type","session_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_records_student_idx" ON "attendance_records" USING btree ("student_id","recorded_at");