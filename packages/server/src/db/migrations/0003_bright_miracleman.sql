DO $$ BEGIN
 CREATE TYPE "public"."enrollment_source" AS ENUM('purchase', 'admin_grant', 'free');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'expired', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"source" "enrollment_source" NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_invites" (
	"lesson_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_invites_lesson_id_student_id_pk" PRIMARY KEY("lesson_id","student_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_progress" (
	"student_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"opened_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "lesson_progress_student_id_lesson_id_pk" PRIMARY KEY("student_id","lesson_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_program_id_learning_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."learning_programs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_invites" ADD CONSTRAINT "lesson_invites_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_invites" ADD CONSTRAINT "lesson_invites_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_student_program_idx" ON "enrollments" USING btree ("student_id","program_id");