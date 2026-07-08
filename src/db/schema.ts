import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Keywords que el sistema está trackeando (ej: "cottagecore clipart").
 * category agrupa por tipo de producto (ej: "clipart", "svg", "planner").
 */
export const keywords = pgTable("keywords", {
  id: serial("id").primaryKey(),
  term: text("term").notNull().unique(),
  category: text("category").notNull().default("general"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Snapshots históricos del volumen de búsqueda de Google Trends.
 * geo usa códigos ISO 3166-1 alpha-2 (ej: "US", "MX"), o "" para mundial.
 * La combinación (keywordId, geo, date) debe ser única.
 */
export const trendSnapshots = pgTable(
  "trend_snapshots",
  {
    id: serial("id").primaryKey(),
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    geo: text("geo").notNull().default(""),
    date: text("date").notNull(), // formato YYYY-MM-DD
    value: integer("value").notNull(), // 0-100
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueKeywordGeoDate: unique().on(table.keywordId, table.geo, table.date),
  })
);

/**
 * Búsquedas relacionadas en alza, también por país.
 * growthValue puede ser un número como texto (ej: "250") o "Breakout".
 */
export const relatedQueries = pgTable("related_queries", {
  id: serial("id").primaryKey(),
  keywordId: integer("keyword_id")
    .notNull()
    .references(() => keywords.id, { onDelete: "cascade" }),
  geo: text("geo").notNull().default(""),
  query: text("query").notNull(),
  growthValue: text("growth_value").notNull(),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});