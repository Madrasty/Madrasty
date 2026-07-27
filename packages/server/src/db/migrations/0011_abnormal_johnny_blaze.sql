CREATE TABLE IF NOT EXISTS "homework_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"brief" jsonb NOT NULL,
	"max_grade" numeric DEFAULT '100' NOT NULL,
	"due_at" timestamp with time zone,
	"allow_late" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"grade" numeric,
	"teacher_comment" text,
	"graded_by" text,
	"grader_id" uuid,
	"graded_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_program_id_learning_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."learning_programs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_assignment_id_homework_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."homework_assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_grader_id_users_id_fk" FOREIGN KEY ("grader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homework_assignments_lesson_idx" ON "homework_assignments" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_assignments_program_idx" ON "homework_assignments" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homework_submissions_assignment_student_idx" ON "homework_submissions" USING btree ("assignment_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_submissions_student_idx" ON "homework_submissions" USING btree ("student_id");