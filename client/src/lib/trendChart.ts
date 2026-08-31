import type { RegionTimeline } from "../components/TrendChart";

/** Number of distinct dates plotted across all series — for a caller-rendered "showing N days" label alongside the chart. */
export function countChartDays(series: RegionTimeline[]): number {
  return new Set(series.flatMap((s) => s.timeline.map((point) => point.date))).size;
}
