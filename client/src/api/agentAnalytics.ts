import { api } from './request';

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
  mostPopularAgent: PopularAgentStats | null;
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
 * 统计响应包装器
 */
interface StatsResponse<T> {
  data: T;
  period: string;
  total: number;
}

/**
 * 获取单个 Agent 的访问统计
 */
export async function getAgentViewStats(agentId: string): Promise<StatsResponse<AgentViewStats>> {
  const response = await api.get(`/api/agent-market/analytics/views/${agentId}`);
  return response.data;
}

/**
 * 获取所有 Agent 的访问统计
 */
export async function getAllAgentViewStats(
  limit?: number
): Promise<StatsResponse<AgentViewStats[]>> {
  const response = await api.get('/api/agent-market/analytics/views', {
    params: { limit },
  });
  return response.data;
}

/**
 * 增加访问计数
 */
export async function incrementViewCount(agentId: string): Promise<void> {
  await api.post(`/api/agent-market/analytics/views/${agentId}`);
}

/**
 * 获取单个模板的使用统计
 */
export async function getTemplateUsageStats(templateId: string): Promise<StatsResponse<TemplateUsageStats>> {
  const response = await api.get(`/api/agent-market/analytics/usage/${templateId}`);
  return response.data;
}

/**
 * 获取所有模板的使用统计
 */
export async function getAllTemplateUsageStats(
  limit?: number
): Promise<StatsResponse<TemplateUsageStats[]>> {
  const response = await api.get('/api/agent-market/analytics/usage', {
    params: { limit },
  });
  return response.data;
}

/**
 * 获取单个 Agent 的评分趋势统计
 */
export async function getRatingTrendStats(
  agentId: string
): Promise<StatsResponse<RatingTrendStats>> {
  const response = await api.get(`/api/agent-market/analytics/ratings/${agentId}`);
  return response.data;
}

/**
 * 获取所有 Agent 的评分趋势统计
 */
export async function getAllRatingTrendStats(
  limit?: number
): Promise<StatsResponse<RatingTrendStats[]>> {
  const response = await api.get('/api/agent-market/analytics/ratings', {
    params: { limit },
  });
  return response.data;
}

/**
 * 获取热门 Agent 列表
 */
export async function getPopularAgentsStats(
  limit?: number
): Promise<StatsResponse<PopularAgentStats[]>> {
  const response = await api.get('/api/agent-market/analytics/popular', {
    params: { limit },
  });
  return response.data;
}

/**
 * 获取统计汇总
 */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const response = await api.get('/api/agent-market/analytics/summary');
  return response.data;
}
