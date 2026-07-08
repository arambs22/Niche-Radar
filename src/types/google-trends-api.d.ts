declare module "google-trends-api" {
  interface InterestOverTimeOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  interface RelatedQueriesOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
  }

  function interestOverTime(options: InterestOverTimeOptions): Promise<string>;
  function relatedQueries(options: RelatedQueriesOptions): Promise<string>;
  function relatedTopics(options: RelatedQueriesOptions): Promise<string>;
  function interestByRegion(options: InterestOverTimeOptions): Promise<string>;
  function dailyTrends(options: {
    trendDate?: Date;
    geo?: string;
  }): Promise<string>;
  function realTimeTrends(options: {
    geo?: string;
    category?: string;
  }): Promise<string>;

  const googleTrends: {
    interestOverTime: typeof interestOverTime;
    relatedQueries: typeof relatedQueries;
    relatedTopics: typeof relatedTopics;
    interestByRegion: typeof interestByRegion;
    dailyTrends: typeof dailyTrends;
    realTimeTrends: typeof realTimeTrends;
  };

  export default googleTrends;
}