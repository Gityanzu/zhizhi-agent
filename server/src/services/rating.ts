import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { usePostgres, query } from '../db';
import type {
  UserRating,
  RatingStats,
  CreateRatingRequest,
  UpdateRatingRequest,
  RatingQueryParams,
  RatingListResponse,
  RatingStatus,
} from '../types/rating';

const PERSIST_DIR = path.resolve(__dirname, '../../data');
const RATINGS_FILE = path.join(PERSIST_DIR, 'ratings.json');

// 确保目录存在
if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

// 模拟数据存储
let ratings: UserRating[] = [];
let ratingsLoaded = false;

/**
 * 加载评分数据
 */
function loadRatings(): void {
  if (ratingsLoaded) return;

  if (fs.existsSync(RATINGS_FILE)) {
    try {
      const raw = fs.readFileSync(RATINGS_FILE, 'utf-8');
      ratings = JSON.parse(raw) as UserRating[];
      console.log(`Agent 评分已加载: ${ratings.length} 条`);
    } catch (e) {
      console.warn('加载 Agent 评分失败:', e);
      ratings = [];
    }
  } else {
    ratings = [];
  }

  ratingsLoaded = true;
}

/**
 * 保存评分数据
 */
function saveRatings(): void {
  try {
    fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratings, null, 2));
  } catch (e) {
    console.error('保存 Agent 评分失败:', e);
  }
}

/**
 * 验证评分数据
 */
function validateRating(rating: number, comment?: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (rating < 1 || rating > 5) {
    errors.push('评分必须在 1-5 星之间');
  }

  if (comment && comment.trim().length > 1000) {
    errors.push('评论不能超过 1000 个字符');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 创建用户评分
 */
export async function createUserRating(
  agentId: string,
  userId: string,
  data: CreateRatingRequest
): Promise<UserRating> {
  loadRatings();

  const validation = validateRating(data.rating, data.comment);
  if (!validation.valid) {
    throw new Error(`评分验证失败: ${validation.errors.join(', ')}`);
  }

  // 检查用户是否已经评分过
  const existingRating = ratings.find(r => r.agentId === agentId && r.userId === userId);
  if (existingRating) {
    throw new Error('您已经对此 Agent 评分过了');
  }

  const rating: UserRating = {
    id: uuidv4(),
    agentId,
    userId,
    rating: data.rating,
    comment: data.comment,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
  };

  ratings.push(rating);
  saveRatings();

  return rating;
}

/**
 * 更新用户评分
 */
export async function updateUserRating(
  ratingId: string,
  userId: string,
  data: UpdateRatingRequest
): Promise<UserRating> {
  loadRatings();

  const ratingIndex = ratings.findIndex(r => r.id === ratingId && r.userId === userId);
  if (ratingIndex === -1) {
    throw new Error('评分不存在或无权修改');
  }

  const rating = ratings[ratingIndex];

  // 更新评分
  if (data.rating !== undefined) {
    const validation = validateRating(data.rating, data.comment);
    if (!validation.valid) {
      throw new Error(`评分验证失败: ${validation.errors.join(', ')}`);
    }
    rating.rating = data.rating;
  }

  // 更新评论
  if (data.comment !== undefined) {
    rating.comment = data.comment;
  }

  rating.updatedAt = new Date().toISOString();
  ratings[ratingIndex] = rating;
  saveRatings();

  return rating;
}

/**
 * 删除用户评分
 */
export async function deleteUserRating(ratingId: string, userId: string): Promise<boolean> {
  loadRatings();

  const ratingIndex = ratings.findIndex(r => r.id === ratingId && r.userId === userId);
  if (ratingIndex === -1) {
    return false;
  }

  ratings.splice(ratingIndex, 1);
  saveRatings();

  return true;
}

/**
 * 获取用户评分
 */
export async function getUserRating(agentId: string, userId: string): Promise<UserRating | null> {
  loadRatings();

  const rating = ratings.find(r => r.agentId === agentId && r.userId === userId);
  return rating || null;
}

/**
 * 获取评分列表
 */
export async function getRatings(params: RatingQueryParams): Promise<RatingListResponse> {
  loadRatings();

  let filteredRatings = [...ratings];

  // 筛选
  if (params.agentId) {
    filteredRatings = filteredRatings.filter(r => r.agentId === params.agentId);
  }

  if (params.userId) {
    filteredRatings = filteredRatings.filter(r => r.userId === params.userId);
  }

  if (params.status) {
    filteredRatings = filteredRatings.filter(r => r.status === params.status);
  }

  // 排序
  if (params.sortBy) {
    filteredRatings.sort((a, b) => {
      let compareValue = 0;

      switch (params.sortBy) {
        case 'latest':
          compareValue = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
        case 'highest':
          compareValue = b.rating - a.rating;
          break;
        case 'lowest':
          compareValue = a.rating - b.rating;
          break;
      }

      return params.sortOrder === 'desc' ? compareValue : -compareValue;
    });
  } else {
    // 默认按最新排序
    filteredRatings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // 分页
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 10, 50);
  const total = filteredRatings.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRatings = filteredRatings.slice(startIndex, endIndex);

  return {
    ratings: paginatedRatings,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * 获取评分统计
 */
export async function getRatingStats(agentId: string): Promise<RatingStats> {
  loadRatings();

  const agentRatings = ratings.filter(r => r.agentId === agentId && r.status === 'active');

  const totalRatings = agentRatings.length;
  const averageRating = totalRatings > 0
    ? agentRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
    : 0;

  // 计算评分分布
  const ratingDistribution = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  agentRatings.forEach(r => {
    ratingDistribution[r.rating as keyof typeof ratingDistribution]++;
  });

  // 获取最新评分
  const latestRating = agentRatings.length > 0
    ? agentRatings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : undefined;

  return {
    agentId,
    averageRating: Number(averageRating.toFixed(2)),
    totalRatings,
    ratingDistribution,
    latestRating,
  };
}

/**
 * 获取所有 Agent 的评分统计
 */
export async function getAllAgentsRatingStats(): Promise<RatingStats[]> {
  loadRatings();

  // 获取所有唯一的 agentId
  const agentIds = [...new Set(ratings.map(r => r.agentId))];

  return Promise.all(
    agentIds.map(async (agentId) => {
      return await getRatingStats(agentId);
    })
  );
}

/**
 * 禁用评分（管理员功能）
 */
export async function disableRating(ratingId: string, adminId: string): Promise<UserRating> {
  loadRatings();

  const rating = ratings.find(r => r.id === ratingId);
  if (!rating) {
    throw new Error('评分不存在');
  }

  rating.status = 'disabled';
  rating.updatedAt = new Date().toISOString();
  saveRatings();

  return rating;
}

/**
 * 恢复评分（管理员功能）
 */
export async function restoreRating(ratingId: string, adminId: string): Promise<UserRating> {
  loadRatings();

  const rating = ratings.find(r => r.id === ratingId);
  if (!rating) {
    throw new Error('评分不存在');
  }

  rating.status = 'active';
  rating.updatedAt = new Date().toISOString();
  saveRatings();

  return rating;
}

/**
 * 删除评分（管理员功能）
 */
export async function adminDeleteRating(ratingId: string, adminId: string): Promise<boolean> {
  loadRatings();

  const ratingIndex = ratings.findIndex(r => r.id === ratingId);
  if (ratingIndex === -1) {
    return false;
  }

  ratings.splice(ratingIndex, 1);
  saveRatings();

  return true;
}