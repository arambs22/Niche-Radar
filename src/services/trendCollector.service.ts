import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries, keywordCollectionStatus, userRegions } from "../db/schema.js";
import { eq, and, isNull } from "drizzle-orm";
import {
  fetchInterestOverTimeBatch,
  fetchRelatedQueries,
  sleep,
} from "./googleTrends.service.js";
import { getTodayLocal } from "../utils/date.js";
import { logger } from "../utils/logger.js";

const BASE_DELAY_MS = 8000;
const JITTER_MS = 3000;
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_KEYWORDS_PER_REQUEST = 5;

type CollectionStatus = "success" | "failed";

interface KeywordRow {
  id: number;
  term: string;
}

function randomDelay(): number {
  return BASE_DELAY_MS + Math.floor(Math.random() * JITTER_MS);
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/** Every actively tracked (non-archived, not paused) keyword across all users. */
async function getEligibleKeywords(): Promise<KeywordRow[]> {
  return db
    .select({ id: keywords.id, term: keywords.term })
    .from(keywords)
    .where(and(isNull(keywords.removedAt), eq(keywords.autoCollectPaused, false)));
}

/** Filters out keywords that already have a snapshot for this region today (local time), so groups sent to Google only contain keywords that actually need data. */
async function filterAlreadyCollectedToday(group: KeywordRow[], geo: string): Promise<KeywordRow[]> {
  const today = getTodayLocal();
  const pending: KeywordRow[] = [];

  for (const kw of group) {
    const existing = await db
      .select()
      .from(trendSnapshots)
      .where(
        and(eq(trendSnapshots.keywordId, kw.id), eq(trendSnapshots.geo, geo), eq(trendSnapshots.date, today))
      )
      .limit(1);

    if (existing.length === 0) {
      pending.push(kw);
    } else {
      logger.info(`  [${geo || "worldwide"}] "${kw.term}" skipped (already collected today)`);
    }
  }

  return pending;
}

async function recordCollectionSuccess(keywordId: number, geo: string, attemptedAt: Date): Promise<void> {
  await db
    .insert(keywordCollectionStatus)
    .values({
      keywordId,
      geo,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: attemptedAt,
      lastErrorMessage: null,
      consecutiveFailures: 0,
    })
    .onConflictDoUpdate({
      target: [keywordCollectionStatus.keywordId, keywordCollectionStatus.geo],
      set: { lastAttemptAt: attemptedAt, lastSuccessAt: attemptedAt, lastErrorMessage: null, consecutiveFailures: 0 },
    });
}

async function recordCollectionFailure(
  keywordId: number,
  geo: string,
  attemptedAt: Date,
  message: string
): Promise<void> {
  const [existing] = await db
    .select()
    .from(keywordCollectionStatus)
    .where(and(eq(keywordCollectionStatus.keywordId, keywordId), eq(keywordCollectionStatus.geo, geo)))
    .limit(1);

  const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;

  await db
    .insert(keywordCollectionStatus)
    .values({ keywordId, geo, lastAttemptAt: attemptedAt, lastErrorMessage: message, consecutiveFailures })
    .onConflictDoUpdate({
      target: [keywordCollectionStatus.keywordId, keywordCollectionStatus.geo],
      set: { lastAttemptAt: attemptedAt, lastErrorMessage: message, consecutiveFailures },
    });
}

/**
 * Collects one batched interest-over-time request for the whole group,
 * then one related-queries request per keyword in the group (unbatched —
 * see Global Constraints in the plan for why). Records collection status
 * per keyword regardless of outcome.
 */
async function collectForChunk(group: KeywordRow[], geo: string): Promise<CollectionStatus[]> {
  const attemptedAt = new Date();

  let interestByTerm: Record<string, { date: string; value: number }[]>;
  try {
    interestByTerm = await fetchInterestOverTimeBatch(
      group.map((kw) => kw.term),
      geo
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed batch of ${group.length} for region "${geo || "worldwide"}"`, { error: message });
    for (const kw of group) {
      await recordCollectionFailure(kw.id, geo, attemptedAt, message);
    }
    return group.map(() => "failed" as const);
  }

  for (const kw of group) {
    const timeline = interestByTerm[kw.term] ?? [];
    for (const point of timeline) {
      await db
        .insert(trendSnapshots)
        .values({ keywordId: kw.id, geo, date: point.date, value: point.value })
        .onConflictDoNothing();
    }
  }

  await sleep(randomDelay());

  const statuses: CollectionStatus[] = [];
  for (const kw of group) {
    try {
      const rising = await fetchRelatedQueries(kw.term, geo);
      for (const item of rising) {
        await db.insert(relatedQueries).values({
          keywordId: kw.id,
          geo,
          query: item.query,
          growthValue: item.growthValue,
        });
      }
      await recordCollectionSuccess(kw.id, geo, attemptedAt);
      statuses.push("success");
      const timeline = interestByTerm[kw.term] ?? [];
      logger.info(`  [${geo || "worldwide"}] "${kw.term}" ok (${timeline.length} snapshots, ${rising.length} related queries)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed related queries for "${kw.term}" in region "${geo || "worldwide"}"`, { error: message });
      await recordCollectionFailure(kw.id, geo, attemptedAt, message);
      statuses.push("failed");
    }
    await sleep(randomDelay());
  }

  return statuses;
}

/**
 * Collects trend data for every eligible keyword across all users, for a
 * single region, in groups of up to 5 keywords per request. Runs
 * sequentially and stops early after repeated consecutive group failures
 * (likely a temporary upstream rate limit).
 */
export async function collectTrendsForAllUsers(geo: string = ""): Promise<void> {
  const eligible = await getEligibleKeywords();
  const groups = chunk(eligible, MAX_KEYWORDS_PER_REQUEST);

  let consecutiveFailedGroups = 0;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const group of groups) {
    const pending = await filterAlreadyCollectedToday(group, geo);
    skipped += group.length - pending.length;

    if (pending.length === 0) {
      continue;
    }

    const statuses = await collectForChunk(pending, geo);
    succeeded += statuses.filter((s) => s === "success").length;
    failed += statuses.filter((s) => s === "failed").length;

    if (statuses.includes("success")) {
      consecutiveFailedGroups = 0;
    } else {
      consecutiveFailedGroups++;
      if (consecutiveFailedGroups >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          `Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failed groups (likely rate-limited).`
        );
        break;
      }
    }
  }

  logger.info(`Summary [${geo || "worldwide"}]: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed`);
}

/**
 * Collects trend data across every region tracked by any user (plus
 * Worldwide, always implicit), one region at a time, sequentially. This
 * is the entry point for the scheduled collection endpoint.
 */
export async function collectTrendsForAllRegions(): Promise<void> {
  const regions = await getAllTrackedRegions();
  for (const geo of regions) {
    logger.info(`Starting collection for geo="${geo || "worldwide"}"...`);
    await collectTrendsForAllUsers(geo);
  }
}

async function getAllTrackedRegions(): Promise<string[]> {
  const rows = await db.selectDistinct({ geo: userRegions.geo }).from(userRegions);
  return ["", ...rows.map((r) => r.geo)];
}
