/**
 * Agent 评分相关类型定义
 */

/**
 * Agent 评分
 */
export interface AgentRating {
  id: string;
  agentId: string;
  userId: string;
  rating: number; // 1-5 星
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 评分统计信息
 */
export interface RatingStats {
  agentId: string;
  averageRating: number;
  totalRatings: number;
  ratingCounts: Record<number, number>; // 每个分数的数量
  fiveStarPercent: number; // 5星百分比
  fourStarPercent: number; // 4星百分比
  threeStarPercent: number; // 3星百分比
  twoStarPercent: number; // 2星百分比
  oneStarPercent: number; // 1星百分比
}

/**
 * 评分历史
 */
export interface RatingHistory {
  rating: AgentRating[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 评分响应
 */
export interface RatingResponse {
  code: number;
  message: string;
  data: AgentRating | RatingStats | RatingHistory;
}

/**
 * 评分请求
 */
export interface RatingRequest {
  agentId: string;
  rating: number;
  comment?: string;
}
