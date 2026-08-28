import { Router } from "express";
import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries } from "../db/schema.js";
import { and, eq, isNull, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.middleware.js";

export const trendsRouter = Router();

trendsRouter.use(requireAuth);

/**
 * GET /api/trends?geo=US
 * Returns the snapshot history for the authenticated user's active
 * (non-archived) keywords for a given country (or worldwide if geo is
 * omitted), grouped by keyword.
 */
trendsRouter.get("/trends", async (req, res, next) => {
  try {
    const geo = typeof req.query.geo === "string" ? req.query.geo : "";

    const allKeywords = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));
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
 * Returns rising related queries grouped by keyword, for the
 * authenticated user's active (non-archived) keywords in a given
 * country (or worldwide if geo is omitted).
 */
trendsRouter.get("/related", async (req, res, next) => {
  try {
    const geo = typeof req.query.geo === "string" ? req.query.geo : "";

    const allKeywords = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));
    const allRelated = await db
      .select()
      .from(relatedQueries)
      .where(eq(relatedQueries.geo, geo))
      .orderBy(desc(relatedQueries.collectedAt));

    const result = allKeywords
      .map((kw) => {
        const kwRelated = allRelated.filter((r) => r.keywordId === kw.id);
        // relatedQueries rows are never replaced between collection runs
        // (unlike trendSnapshots, which has a uniqueness constraint) —
        // GET /:id/related relies on that to show archived keywords' full
        // history. Here, on the active dashboard, only the most recent
        // collection's rows represent what's currently rising; without this
        // filter every past run's rows pile up together. allRelated is
        // ordered by collectedAt desc, so kwRelated[0] is the latest.
        const latestDate = kwRelated[0]?.collectedAt.toISOString().slice(0, 10);
        return {
          id: kw.id,
          term: kw.term,
          category: kw.category,
          rising: kwRelated
            .filter((r) => r.collectedAt.toISOString().slice(0, 10) === latestDate)
            .map((r) => ({ query: r.query, growthValue: r.growthValue })),
        };
      })
      .filter((kw) => kw.rising.length > 0);

    res.json(result);
  } catch (err) {
    next(err);
  }
});
