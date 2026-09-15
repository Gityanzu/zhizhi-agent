/**
 * Agent 统计和分析相关类型定义
 */

/**
 * Agent 访问统计
 */
export interface AgentViewStats {
  agentId: string;
  viewCount: number;
  lastViewedAt: string;
  viewHistory: {
    date: string;
    count: number;
  }[];
}

/**
 * 模板使用统计
 */
export interface TemplateUsageStats {
  templateId: string;
  templateName: string;
  usageCount: number;
  lastUsedAt: string;
  usageByAgent: {
    agentId: string;
    agentName: string;
    count: number;
  }[];
}

/**
 * 评分趋势统计
 */
export interface RatingTrendStats {
  agentId: string;
  name: string;
  ratingDistribution: {
    rating: number;
    count: number;
  }[];
  ratingTrend: {
    date: string;
    averageRating: number;
    ratingCount: number;
  }[];
  latestRating?: number;
  averageRating: number;
  totalRatings: number;
}

/**
 * 热门 Agent 统计
 */
export interface PopularAgentStats {
  agentId: string;
  name: string;
  category?: string;
  tags?: string[];
  rating: number;
  ratingCount: number;
  viewCount: number;
  templateCount: number;
  popularityScore: number;
  rank: number;
}

/**
 * 统计汇总
 */
export interface AnalyticsSummary {
  totalAgents: number;
  totalViews: number;
  totalRatings: number;
  averageRating: number;
  mostPopularAgent: PopularAgentStats;
  topCategories: Array<{
    name: string;
    count: number;
  }>;
  topTags: Array<{
    name: string;
    count: number;
  }>;
}

/**
 * 日期范围统计请求
 */
export interface DateRangeStatsRequest {
  startDate: string;
  endDate: string;
}

/**
 * 统计响应
 */
export interface StatsResponse<T> {
  data: T;
  period: string;
  total: number;
}
