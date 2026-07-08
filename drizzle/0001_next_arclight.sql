ALTER TABLE "trend_snapshots" DROP CONSTRAINT "trend_snapshots_keyword_id_date_unique";--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "related_queries" ADD COLUMN "geo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_snapshots" ADD COLUMN "geo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_snapshots" ADD CONSTRAINT "trend_snapshots_keyword_id_geo_date_unique" UNIQUE("keyword_id","geo","date");