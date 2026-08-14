import { Router } from "express";
import { z } from "zod";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries, users, keywordCollectionStatus } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { MAX_CONSECUTIVE_FAILURES } from "../services/trendCollector.service.js";

export const keywordsRouter = Router();

keywordsRouter.use(requireAuth);

const createKeywordSchema = z.object({
  term: z.string().trim().min(1, "El término no puede estar vacío"),
  category: z.string().trim().min(1).optional(),
});

/** POST / — creates a keyword owned by the authenticated user, or restores it if it was previously archived under the same term. */
keywordsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createKeywordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { term, category } = parsed.data;

    const [existing] = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), eq(keywords.term, term)))
      .limit(1);

    if (existing && existing.removedAt === null) {
      res.status(409).json({ error: "Ya estás trackeando esa keyword" });
      return;
    }

    if (existing) {
      const [restored] = await db
        .update(keywords)
        .set({ removedAt: null, ...(category ? { category } : {}) })
        .where(eq(keywords.id, existing.id))
        .returning();
      res.status(200).json(restored);
      return;
    }

    const [keyword] = await db
      .insert(keywords)
      .values({ userId: req.userId!, term, ...(category ? { category } : {}) })
      .returning();

    res.status(201).json(keyword);
  } catch (err) {
    // Drizzle wraps driver errors in a DrizzleQueryError; the original
    // Postgres error (with its `code`) lives in `.cause`.
    const pgCode = (err as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: "Ya estás trackeando esa keyword" });
      return;
    }
    next(err);
  }
});

/** GET / — lists the authenticated user's active keywords, or active+archived (with per-region coverage) when ?includeRemoved=true. */
keywordsRouter.get("/", async (req, res, next) => {
  try {
    if (req.query.includeRemoved === "true") {
      const retentionDays = await getRetentionDays(req.userId!);
      await purgeExpired(req.userId!, retentionDays);

      const all = await db
        .select()
        .from(keywords)
        .where(eq(keywords.userId, req.userId!))
        .orderBy(keywords.createdAt);

      const withRegions = await Promise.all(
        all.map(async (kw) => ({ ...kw, regions: await getKeywordRegions(kw.id) }))
      );

      res.json(withRegions);
      return;
    }

    const result = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)))
      .orderBy(keywords.category, keywords.term);

    const geoParam = req.query.geo;
    if (typeof geoParam !== "string") {
      res.json(result);
      return;
    }

    const geos = geoParam.split(",");
    const withStatus = await Promise.all(
      result.map(async (kw) => ({
        ...kw,
        collectionStatus: await getCollectionStatusForKeyword(kw.id, geos),
      }))
    );
    res.json(withStatus);
  } catch (err) {
    next(err);
  }
});

/** DELETE /:id — archives a keyword owned by the authenticated user (soft delete; its data is kept until it expires from history). */
keywordsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const archived = await db
      .update(keywords)
      .set({ removedAt: new Date() })
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!), isNull(keywords.removedAt)))
      .returning({ id: keywords.id });

    if (archived.length === 0) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** PATCH /:id/restore — un-archives a keyword owned by the authenticated user. */
keywordsRouter.patch("/:id/restore", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const [restored] = await db
      .update(keywords)
      .set({ removedAt: null })
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!), isNotNull(keywords.removedAt)))
      .returning();

    if (!restored) {
      res.status(404).json({ error: "Keyword archivada no encontrada" });
      return;
    }

    res.json(restored);
  } catch (err) {
    next(err);
  }
});

const autoCollectSchema = z.object({
  paused: z.boolean(),
});

/** PATCH /:id/auto-collect — pauses or resumes automatic collection for a keyword owned by the authenticated user. */
keywordsRouter.patch("/:id/auto-collect", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const parsed = autoCollectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const [updated] = await db
      .update(keywords)
      .set({ autoCollectPaused: parsed.data.paused })
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/** GET /:id/trends — full trend history for one keyword, across every region it has data for, regardless of archived status. */
keywordsRouter.get("/:id/trends", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const [keyword] = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!)))
      .limit(1);

    if (!keyword) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    const snapshots = await db
      .select()
      .from(trendSnapshots)
      .where(eq(trendSnapshots.keywordId, id))
      .orderBy(trendSnapshots.geo, trendSnapshots.date);

    const byRegion = new Map<string, { date: string; value: number }[]>();
    for (const s of snapshots) {
      const list = byRegion.get(s.geo) ?? [];
      list.push({ date: s.date, value: s.value });
      byRegion.set(s.geo, list);
    }

    res.json({
      id: keyword.id,
      term: keyword.term,
      category: keyword.category,
      series: Array.from(byRegion.entries()).map(([region, timeline]) => ({ region, timeline })),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /:id/related — full related-queries history for one keyword, across every region, regardless of archived status. */
keywordsRouter.get("/:id/related", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const [keyword] = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!)))
      .limit(1);

    if (!keyword) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    const related = await db
      .select()
      .from(relatedQueries)
      .where(eq(relatedQueries.keywordId, id))
      .orderBy(relatedQueries.geo, relatedQueries.collectedAt);

    const byRegion = new Map<string, { query: string; growthValue: string }[]>();
    for (const r of related) {
      const list = byRegion.get(r.geo) ?? [];
      list.push({ query: r.query, growthValue: r.growthValue });
      byRegion.set(r.geo, list);
    }

    res.json({
      id: keyword.id,
      term: keyword.term,
      category: keyword.category,
      columns: Array.from(byRegion.entries()).map(([region, rising]) => ({ region, rising })),
    });
  } catch (err) {
    next(err);
  }
});

async function getRetentionDays(userId: number): Promise<number> {
  const [user] = await db
    .select({ historyRetentionDays: users.historyRetentionDays })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.historyRetentionDays ?? 15;
}

async function purgeExpired(userId: number, retentionDays: number): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  await db
    .delete(keywords)
    .where(and(eq(keywords.userId, userId), isNotNull(keywords.removedAt), lt(keywords.removedAt, cutoff)));
}

async function getKeywordRegions(keywordId: number): Promise<string[]> {
  const snapshotGeos = await db
    .selectDistinct({ geo: trendSnapshots.geo })
    .from(trendSnapshots)
    .where(eq(trendSnapshots.keywordId, keywordId));
  const relatedGeos = await db
    .selectDistinct({ geo: relatedQueries.geo })
    .from(relatedQueries)
    .where(eq(relatedQueries.keywordId, keywordId));
  return Array.from(new Set([...snapshotGeos.map((s) => s.geo), ...relatedGeos.map((r) => r.geo)]));
}

interface KeywordRegionStatus {
  blocked: boolean;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
}

/**
 * Per-region collection status for one keyword. A keyword only counts as
 * "blocked" once it has failed as many times in a row as the collector
 * itself treats as a likely rate limit — a single transient failure (a
 * flaky related-queries request, say) must not light up the dashboard.
 */
async function getCollectionStatusForKeyword(
  keywordId: number,
  geos: string[]
): Promise<Record<string, KeywordRegionStatus>> {
  const rows = await db
    .select()
    .from(keywordCollectionStatus)
    .where(eq(keywordCollectionStatus.keywordId, keywordId));

  const byGeo: Record<string, KeywordRegionStatus> = {};
  for (const geo of geos) {
    const row = rows.find((r) => r.geo === geo);
    if (row) {
      byGeo[geo] = {
        blocked: row.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
        lastAttemptAt: row.lastAttemptAt.toISOString(),
        lastSuccessAt: row.lastSuccessAt ? row.lastSuccessAt.toISOString() : null,
        consecutiveFailures: row.consecutiveFailures,
      };
    }
  }
  return byGeo;
}
