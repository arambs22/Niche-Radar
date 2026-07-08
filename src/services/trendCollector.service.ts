import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import {
  fetchInterestOverTime,
  fetchRelatedQueries,
  sleep,
} from "./googleTrends.service.js";
import type { KeywordConfig } from "../config/keywords.js";
import { logger } from "../utils/logger.js";
import { getTodayLocal } from "../utils/date.js";

const BASE_DELAY_MS = 5000;
const JITTER_MS = 3000; // variación aleatoria para no ser tan predecibles
const MAX_CONSECUTIVE_FAILURES = 3;

type CollectionStatus = "skipped" | "success" | "failed";

function randomDelay(): number {
  return BASE_DELAY_MS + Math.floor(Math.random() * JITTER_MS);
}

async function ensureKeywordExists(
  term: string,
  category: string
): Promise<number> {
  const existing = await db
    .select()
    .from(keywords)
    .where(eq(keywords.term, term))
    .limit(1);

  if (existing.length > 0) {
    return existing[0]!.id;
  }

  const inserted = await db
    .insert(keywords)
    .values({ term, category })
    .returning({ id: keywords.id });

  return inserted[0]!.id;
}

async function collectForKeywordAndRegion(
  keywordId: number,
  term: string,
  geo: string
): Promise<CollectionStatus> {
  const today = getTodayLocal();

  const alreadyCollectedToday = await db
    .select()
    .from(trendSnapshots)
    .where(
      and(
        eq(trendSnapshots.keywordId, keywordId),
        eq(trendSnapshots.geo, geo),
        eq(trendSnapshots.date, today)
      )
    )
    .limit(1);

  if (alreadyCollectedToday.length > 0) {
    logger.info(`  [${geo || "worldwide"}] ⏭ ya recolectado hoy`);
    return "skipped";
  }

  try {
    const timeline = await fetchInterestOverTime(term, geo);
    for (const point of timeline) {
      await db
        .insert(trendSnapshots)
        .values({ keywordId, geo, date: point.date, value: point.value })
        .onConflictDoNothing();
    }

    await sleep(randomDelay());

    const rising = await fetchRelatedQueries(term, geo);
    for (const item of rising) {
      await db.insert(relatedQueries).values({
        keywordId,
        geo,
        query: item.query,
        growthValue: item.growthValue,
      });
    }

    logger.info(
      `  [${geo || "worldwide"}] ${timeline.length} snapshots, ${rising.length} related queries`
    );
    return "success";
  } catch (err) {
    logger.error(
      `Failed to collect "${term}" for region "${geo || "worldwide"}"`,
      { error: err instanceof Error ? err.message : String(err) }
    );
    return "failed";
  }
}

export async function collectTrendsForAll(
  keywordConfigs: KeywordConfig[],
  geo: string = ""
): Promise<void> {
  let consecutiveFailures = 0;
  let skipped = 0;
  let succeeded = 0;
  let failed = 0;

  for (const { term, category } of keywordConfigs) {
    const keywordId = await ensureKeywordExists(term, category);
    const status = await collectForKeywordAndRegion(keywordId, term, geo);

    if (status === "skipped") {
      skipped++;
      await sleep(700);
      continue; // sin esperar — no gastamos request, no hay razón para pausar
    }

    if (status === "success") {
      succeeded++;
      consecutiveFailures = 0;
    } else {
      failed++;
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          `${MAX_CONSECUTIVE_FAILURES} fallos seguidos — probable bloqueo temporal de Google. ` +
            `Deteniendo. Espera varias horas (idealmente al día siguiente) antes de reintentar.`
        );
        break;
      }
    }

    // Solo esperamos cuando SÍ hicimos una request real (éxito o fallo).
    await sleep(randomDelay());
  }

  logger.info(
    `Resumen: ${succeeded} exitosas, ${skipped} omitidas, ${failed} fallidas`
  );
}