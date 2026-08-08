import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import {
  fetchInterestOverTime,
  fetchRelatedQueries,
  sleep,
} from "./googleTrends.service.js";
import { getTodayLocal } from "../utils/date.js";
import { logger } from "../utils/logger.js";

const BASE_DELAY_MS = 8000;
const JITTER_MS = 3000;
const MAX_CONSECUTIVE_FAILURES = 3;

type CollectionStatus = "skipped" | "success" | "failed";

function randomDelay(): number {
  return BASE_DELAY_MS + Math.floor(Math.random() * JITTER_MS);
}

/** Returns every tracked keyword across all users. */
async function getAllKeywords() {
  return db.select().from(keywords);
}

async function collectForKeyword(
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
    logger.info(`  [${geo || "worldwide"}] "${term}" skipped (already collected today)`);
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
      `  [${geo || "worldwide"}] "${term}" ok (${timeline.length} snapshots, ${rising.length} related queries)`
    );
    return "success";
  } catch (err) {
    logger.error(`Failed to collect "${term}" for region "${geo || "worldwide"}"`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}

/**
 * Collects trend data for every tracked keyword across all users, for a
 * single region. Runs sequentially and stops early after repeated
 * consecutive failures (likely a temporary upstream rate limit).
 */
export async function collectTrendsForAllUsers(geo: string = ""): Promise<void> {
  const allKeywords = await getAllKeywords();

  let consecutiveFailures = 0;
  let skipped = 0;
  let succeeded = 0;
  let failed = 0;

  for (const { id, term } of allKeywords) {
    const status = await collectForKeyword(id, term, geo);

    if (status === "skipped") {
      skipped++;
      await sleep(700);
      continue;
    }

    if (status === "success") {
      succeeded++;
      consecutiveFailures = 0;
    } else {
      failed++;
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          `Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures (likely rate-limited).`
        );
        break;
      }
    }

    await sleep(randomDelay());
  }

  logger.info(`Summary: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed`);
}