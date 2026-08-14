import googleTrends from "google-trends-api";

export interface TrendPoint {
  date: string;
  value: number;
}

export interface RelatedQueryResult {
  query: string;
  growthValue: string;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Fetches the interest-over-time series for a keyword over the last 90 days. */
export async function fetchInterestOverTime(
  keyword: string,
  geo: string = ""
): Promise<TrendPoint[]> {
  const raw = await googleTrends.interestOverTime({
    keyword,
    startTime: new Date(Date.now() - NINETY_DAYS_MS),
    geo,
  });

  const parsed = JSON.parse(raw);
  const timelineData = parsed.default?.timelineData ?? [];

  return timelineData.map((point: any) => ({
    date: new Date(Number(point.time) * 1000).toISOString().slice(0, 10),
    value: point.value[0],
  }));
}

/**
 * Fetches interest-over-time series for up to 5 keywords in a single
 * request (Google Trends' own comparison-terms limit). Returns each
 * keyword's series keyed by the exact string passed in, in the same
 * order as the response's per-item value arrays.
 */
export async function fetchInterestOverTimeBatch(
  keywords: string[],
  geo: string = ""
): Promise<Record<string, TrendPoint[]>> {
  const raw = await googleTrends.interestOverTime({
    keyword: keywords,
    startTime: new Date(Date.now() - NINETY_DAYS_MS),
    geo,
  });

  const parsed = JSON.parse(raw);
  const timelineData = parsed.default?.timelineData ?? [];

  const result: Record<string, TrendPoint[]> = {};
  for (const keyword of keywords) {
    result[keyword] = [];
  }

  for (const point of timelineData as any[]) {
    const date = new Date(Number(point.time) * 1000).toISOString().slice(0, 10);
    keywords.forEach((keyword, index) => {
      const value = point.value[index];
      if (value !== undefined) {
        result[keyword]!.push({ date, value });
      }
    });
  }

  return result;
}

/** Fetches rising related queries for a keyword over the last 90 days. */
export async function fetchRelatedQueries(
  keyword: string,
  geo: string = ""
): Promise<RelatedQueryResult[]> {
  const raw = await googleTrends.relatedQueries({
    keyword,
    startTime: new Date(Date.now() - NINETY_DAYS_MS),
    geo,
  });

  const parsed = JSON.parse(raw);
  const rankedList = parsed.default?.rankedList?.[1]?.rankedKeyword ?? [];

  return rankedList.map((item: any) => ({
    query: item.query,
    growthValue: String(item.value),
  }));
}

/** Resolves after the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}