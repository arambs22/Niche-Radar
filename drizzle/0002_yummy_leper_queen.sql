CREATE TABLE "keyword_collection_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword_id" integer NOT NULL,
	"geo" text DEFAULT '' NOT NULL,
	"last_attempt_at" timestamp NOT NULL,
	"last_success_at" timestamp,
	"last_error_message" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "keyword_collection_status_keyword_id_geo_unique" UNIQUE("keyword_id","geo")
);
--> statement-breakpoint
CREATE TABLE "user_regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"geo" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_regions_user_id_geo_unique" UNIQUE("user_id","geo")
);
--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "auto_collect_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_collection_status" ADD CONSTRAINT "keyword_collection_status_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_regions" ADD CONSTRAINT "user_regions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;