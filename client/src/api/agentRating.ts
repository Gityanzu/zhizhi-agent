import { api } from './request';

/**
 * 评分状�? */
export type RatingStatus = 'active' | 'disabled';

/**
 * 创建评分请求
 */
export interface CreateRatingRequest {
  rating: number;
  comment?: string;
}

/**
 * 更新评分请求
 */
export interface UpdateRatingRequest {
  rating: number;
  comment?: string;
}

/**
 * 评分
 */
export interface UserRating {
  id: string;
  agentId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: string;
  updatedAt: string;
  status: RatingStatus;
}

/**
 * 评分统计
 */
export interface RatingStats {
  agentId: string;
  averageRating: number;
  totalRatings: number;
  ratingDistribution: {
    rating: number;
    count: number;
  }[];
  latestRating?: {
    rating: number;
    comment?: string;
  };
}

/**
 * Agent 评分统计
 */
export interface AgentRatingStats {
  agentId: string;
  averageRating: number;
  totalRatings: number;
  ratingDistribution: {
    rating: number;
    count: number;
  }[];
  latestRating?: {
    rating: number;
    comment?: string;
  };
}

/**
 * 创建评分
 */
export async function createUserRating(
  agentId: string,
  userId: string,
  data: CreateRatingRequest
): Promise<UserRating> {
  const response = await api.post('/api/agent-market/ratings', {
    agentId,
    userId,
    ...data,
  });
  return response.data;
}

/**
 * 更新评分
 */
export async function updateUserRating(
  ratingId: string,
  userId: string,
  data: UpdateRatingRequest
): Promise<UserRating> {
  const response = await api.put(`/api/agent-market/ratings/${ratingId}`, {
    userId,
    ...data,
  });
  return response.data;
}

/**
 * 删除评分
 */
export async function deleteUserRating(ratingId: string, userId: string): Promise<boolean> {
  await api.delete(`/api/agent-market/ratings/${ratingId}`, {
    data: { userId },
  });
  return true;
}

/**
 * 获取用户评分
 */
export async function getUserRating(agentId: string, userId: string): Promise<UserRating | null> {
  try {
    const response = await api.get(`/api/agent-market/ratings/user/${agentId}/${userId}`);
    return response.data;
  } catch (error) {
    return null;
  }
}

/**
 * 获取评分列表
 */
export async function getRatings(params: {
  agentId: string;
  sortBy?: 'latest' | 'highest' | 'lowest';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Promise<{
  ratings: UserRating[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const queryParams = new URLSearchParams();
  if (params.sortBy) queryParams.append('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
  if (params.page) queryParams.append('page', params.page.toString());
  if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());

  const response = await api.get(`/api/agent-market/ratings/${params.agentId}?${queryParams}`);
  return response.data;
}

/**
 * 获取评分统计
 */
export async function getRatingStats(agentId: string): Promise<RatingStats> {
  const response = await api.get(`/api/agent-market/ratings/${agentId}/stats`);
  return response.data;
}

/**
 * 获取所�?Agent 的评分统�? */
export async function getAllAgentsRatingStats(): Promise<AgentRatingStats[]> {
  const response = await api.get('/api/agent-market/ratings/stats');
  return response.data;
}

/**
 * 禁用评分（管理员�? */
export async function disableRating(ratingId: string, moderatorId: string): Promise<UserRating> {
  const response = await api.patch(`/api/agent-market/ratings/${ratingId}/disable`, {
    moderatorId,
  });
  return response.data;
}

/**
 * 恢复评分（管理员�? */
export async function restoreRating(ratingId: string, moderatorId: string): Promise<UserRating> {
  const response = await api.patch(`/api/agent-market/ratings/${ratingId}/restore`, {
    moderatorId,
  });
  return response.data;
}

/**
 * 删除评分（管理员�? */
export async function adminDeleteRating(ratingId: string, moderatorId: string): Promise<boolean> {
  await api.delete(`/api/agent-market/ratings/${ratingId}`, {
    data: { moderatorId },
  });
  return true;
}
