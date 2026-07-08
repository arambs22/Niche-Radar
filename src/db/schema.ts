import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Keywords que el usuario está trackeando (ej: "cottagecore clipart").
 * Cada keyword es única — no queremos duplicados.
 */
export const keywords = pgTable("keywords", {
  id: serial("id").primaryKey(),
  term: text("term").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Snapshots históricos del volumen de búsqueda de Google Trends.
 * Cada fila = un punto en el tiempo para una keyword específica.
 * La combinación (keywordId, date) debe ser única — no queremos
 * dos valores distintos para el mismo día y la misma keyword.
 */
export const trendSnapshots = pgTable(
  "trend_snapshots",
  {
    id: serial("id").primaryKey(),
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // formato YYYY-MM-DD
    value: integer("value").notNull(), // 0-100, escala de Google Trends
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueKeywordDate: unique().on(table.keywordId, table.date),
  })
);

/**
 * Búsquedas relacionadas que están en alza para una keyword base.
 * growthValue puede ser un número (ej: "250" = +250%) o el texto
 * "Breakout" cuando Google Trends detecta un salto masivo (+5000%+).
 * Por eso lo guardamos como texto, no como número.
 */
export const relatedQueries = pgTable("related_queries", {
  id: serial("id").primaryKey(),
  keywordId: integer("keyword_id")
    .notNull()
    .references(() => keywords.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  growthValue: text("growth_value").notNull(),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});