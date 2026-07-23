DO $$ BEGIN
 CREATE TYPE "public"."payment_provider" AS ENUM('paymob', 'fawry', 'vodafone_cash', 'instapay', 'stripe', 'mock');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."purchasable_type" AS ENUM('learning_program', 'subscription', 'booking', 'center_plan');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'paid', 'failed', 'refunded', 'partially_refunded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"beneficiary_id" uuid,
	"purchasable_type" "purchasable_type" NOT NULL,
	"purchasable_id" uuid NOT NULL,
	"amount_egp" numeric NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"payment_provider" "payment_provider" NOT NULL,
	"provider_reference" text,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_beneficiary_id_users_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_purchasable_idx" ON "transactions" USING btree ("purchasable_type","purchasable_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_provider_reference_idx" ON "transactions" USING btree ("payment_provider","provider_reference");