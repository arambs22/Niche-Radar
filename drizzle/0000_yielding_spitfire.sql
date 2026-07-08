CREATE TABLE "keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "keywords_term_unique" UNIQUE("term")
);
--> statement-breakpoint
CREATE TABLE "related_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword_id" integer NOT NULL,
	"query" text NOT NULL,
	"growth_value" text NOT NULL,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword_id" integer NOT NULL,
	"date" text NOT NULL,
	"value" integer NOT NULL,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trend_snapshots_keyword_id_date_unique" UNIQUE("keyword_id","date")
);
--> statement-breakpoint
ALTER TABLE "related_queries" ADD CONSTRAINT "related_queries_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_snapshots" ADD CONSTRAINT "trend_snapshots_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;