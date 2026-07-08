import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries } from "../db/schema.js";
import { eq, and} from "drizzle-orm";
import {
  fetchInterestOverTime,
  fetchRelatedQueries,
  sleep,
} from "./googleTrends.service.js";
import type { KeywordConfig } from "../config/keywords.js";
import { logger } from "../utils/logger.js";

const DELAY_BETWEEN_REQUESTS_MS = 5000; // subimos de 3s a 5s, más conservador
const MAX_CONSECUTIVE_FAILURES = 3;

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
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);

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
    logger.info(
      `  [${geo || "worldwide"}] ya se recolectó hoy, se omite (ahorra requests)`
    );
    return true;
  }

  try {
    const timeline = await fetchInterestOverTime(term, geo);
    for (const point of timeline) {
      await db
        .insert(trendSnapshots)
        .values({ keywordId, geo, date: point.date, value: point.value })
        .onConflictDoNothing();
    }

    await sleep(DELAY_BETWEEN_REQUESTS_MS);

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
    return true;
  } catch (err) {
    logger.error(
      `Failed to collect "${term}" for region "${geo || "worldwide"}"`,
      { error: err instanceof Error ? err.message : String(err) }
    );
    return false;
  }
}

/**
 * Recolecta tendencias para UN SOLO país (geo) a la vez, secuencialmente,
 * una keyword después de otra. Nunca corre en paralelo.
 *
 * Si detecta varios fallos seguidos (probable rate-limit de Google), se
 * detiene por su cuenta en vez de seguir "atacando" — es mejor parar y
 * reintentar más tarde que quemar el resto de las keywords fallando.
 */
export async function collectTrendsForAll(
  keywordConfigs: KeywordConfig[],
  geo: string = ""
): Promise<void> {
  let consecutiveFailures = 0;

  for (const { term, category } of keywordConfigs) {
    logger.info(
      `Collecting trends for: "${term}" (${category}) [${geo || "worldwide"}]`
    );

    const keywordId = await ensureKeywordExists(term, category);
    const success = await collectForKeywordAndRegion(keywordId, term, geo);

    if (success) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          `${MAX_CONSECUTIVE_FAILURES} fallos seguidos — Google probablemente bloqueó temporalmente esta IP. ` +
            `Deteniendo la recolección para no empeorarlo. Espera 15-30 minutos (o más) antes de reintentar.`
        );
        return;
      }
    }

    // Siempre esperamos antes de la siguiente keyword, haya fallado o no.
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }
}