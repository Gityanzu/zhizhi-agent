/**
 * Agent 评分系统类型定义
 */

/**
 * 评分状态
 */
export type RatingStatus = 'active' | 'disabled' | 'moderated';

/**
 * 用户评分
 */
export interface UserRating {
  id: string;
  agentId: string;
  userId: string;
  rating: number; // 1-5星
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
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  latestRating?: UserRating;
}

/**
 * 评分创建请求
 */
export interface CreateRatingRequest {
  rating: number;
  comment?: string;
}

/**
 * 评分更新请求
 */
export interface UpdateRatingRequest {
  rating?: number;
  comment?: string;
}

/**
 * 评分查询参数
 */
export interface RatingQueryParams {
  agentId?: string;
  userId?: string;
  status?: RatingStatus;
  sortBy?: 'latest' | 'highest' | 'lowest';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * 评分列表响应
 */
export interface RatingListResponse {
  ratings: UserRating[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}