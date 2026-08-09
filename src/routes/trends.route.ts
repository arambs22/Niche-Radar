import { Router } from "express";
import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

export const trendsRouter = Router();

/**
 * GET /api/trends?geo=US
 * Returns the snapshot history for all keywords for a given country
 * (or worldwide if geo is omitted), grouped by keyword.
 */
trendsRouter.get("/trends", async (req, res, next) => {
  try {
    const geo = typeof req.query.geo === "string" ? req.query.geo : "";

    const allKeywords = await db.select().from(keywords);
    const allSnapshots = await db
      .select()
      .from(trendSnapshots)
      .where(eq(trendSnapshots.geo, geo))
      .orderBy(trendSnapshots.date);

    const result = allKeywords.map((kw) => ({
      id: kw.id,
      term: kw.term,
      category: kw.category,
      timeline: allSnapshots
        .filter((s) => s.keywordId === kw.id)
        .map((s) => ({ date: s.date, value: s.value })),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/related?geo=US
 * Returns rising related queries grouped by keyword, for a given
 * country (or worldwide if geo is omitted).
 */
trendsRouter.get("/related", async (req, res, next) => {
  try {
    const geo = typeof req.query.geo === "string" ? req.query.geo : "";

    const allKeywords = await db.select().from(keywords);
    const allRelated = await db
      .select()
      .from(relatedQueries)
      .where(eq(relatedQueries.geo, geo))
      .orderBy(desc(relatedQueries.collectedAt));

    const result = allKeywords
      .map((kw) => ({
        id: kw.id,
        term: kw.term,
        category: kw.category,
        rising: allRelated
          .filter((r) => r.keywordId === kw.id)
          .map((r) => ({ query: r.query, growthValue: r.growthValue })),
      }))
      .filter((kw) => kw.rising.length > 0);

    res.json(result);
  } catch (err) {
    next(err);
  }
});