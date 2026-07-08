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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}