export interface User {
  id: number;
  email: string;
  historyRetentionDays: number;
}

export interface Keyword {
  id: number;
  userId: number;
  term: string;
  category: string;
  createdAt: string;
  removedAt: string | null;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface KeywordTrend {
  id: number;
  term: string;
  category: string;
  timeline: TrendPoint[];
}

export interface RelatedQuery {
  query: string;
  growthValue: string;
}

export interface KeywordRelated {
  id: number;
  term: string;
  category: string;
  rising: RelatedQuery[];
}

export interface KeywordHistoryEntry {
  id: number;
  term: string;
  category: string;
  createdAt: string;
  removedAt: string | null;
  regions: string[];
}

export interface KeywordHistoryTrends {
  id: number;
  term: string;
  category: string;
  series: { region: string; timeline: TrendPoint[] }[];
}

export interface KeywordHistoryRelated {
  id: number;
  term: string;
  category: string;
  columns: { region: string; rising: RelatedQuery[] }[];
}
