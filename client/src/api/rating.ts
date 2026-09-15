import { api } from './request';
import type {
  AgentRating,
  RatingStats,
  RatingHistory,
  RatingRequest,
} from '@/types/rating';

// ==================== 评分操作 ====================

/**
 * 对 Agent 进行评分
 */
export async function rateAgent(agentId: string, data: {
  userId: string;
  rating: number;
  comment?: string;
}): Promise<AgentRating> {
  const res = await api.post(`/agent-market/ratings/${agentId}`, data);
  return res.data;
}

// ==================== 评分查询 ====================

/**
 * 获取评分统计
 */
export async function getRatingStats(agentId: string): Promise<RatingStats> {
  const res = await api.get(`/agent-market/ratings/${agentId}/stats`);
  return res.data;
}

/**
 * 获取评分历史
 */
export async function getRatingHistory(
  agentId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<RatingHistory> {
  const params: any = { page, pageSize };
  const res = await api.get(`/agent-market/ratings/${agentId}/history`, {
    params,
  });
  return res.data;
}

/**
 * 获取评分详情
 */
export async function getRating(ratingId: string): Promise<AgentRating> {
  const res = await api.get(`/agent-market/ratings/${ratingId}`);
  return res.data;
}

/**
 * 删除评分
 */
export async function deleteRating(ratingId: string): Promise<void> {
  await api.delete(`/agent-market/ratings/${ratingId}`);
}

// ==================== 管理员功能 ====================

/**
 * 获取所有评分
 */
export async function getAllRatings(): Promise<AgentRating[]> {
  const res = await api.get('/agent-market/ratings');
  return res.data;
}
