ALTER TABLE "keywords" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "history_retention_days" integer DEFAULT 15 NOT NULL;