import { v4 as uuidv4 } from 'uuid';
import { usePostgres, query } from '../db';
import type { AgentRating, RatingStats, RatingHistory } from '../types/rating';
import { getAgent } from './customAgent';

const TABLE_NAME = 'agent_ratings';

/**
 * 映射数据库行到 AgentRating
 */
function mapRow(row: any): AgentRating {
  return {
    id: row.id,
    agentId: row.agent_id,
    userId: row.user_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 生成默认评论
 */
function generateDefaultComment(rating: number): string {
  const comments: Record<number, string> = {
    1: '非常不满意',
    2: '不满意',
    3: '一般',
    4: '满意',
    5: '非常满意',
  };
  return comments[rating] || '评论';
}

/**
 * 创建评分
 */
export async function createRating(
  data: { agentId: string; userId: string; rating: number; comment?: string }
): Promise<AgentRating> {
  // 验证 Agent 存在
  const agent = await getAgent(data.agentId);
  if (!agent) {
    throw new Error(`Agent 不存在: ${data.agentId}`);
  }

  // 验证评分范围
  if (data.rating < 1 || data.rating > 5) {
    throw new Error('评分必须在 1-5 星之间');
  }

  // 验证评论长度
  if (data.comment && data.comment.length > 500) {
    throw new Error('评论长度不能超过 500 字符');
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const comment = data.comment || generateDefaultComment(data.rating);

  const ratingData: Omit<AgentRating, 'id' | 'createdAt' | 'updatedAt'> = {
    agentId: data.agentId,
    userId: data.userId,
    rating: data.rating,
    comment,
  };

  if (usePostgres) {
    await query(
      `INSERT INTO ${TABLE_NAME}
       (id, agent_id, user_id, rating, comment, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, ratingData.agentId, ratingData.userId, ratingData.rating, ratingData.comment, now, now]
    );
  } else {
    // 文件存储方式
    const ratingsFile = `../data/ratings.json`;
    const ratings = loadRatingsFromFile();
    ratings.push({ ...ratingData, id, createdAt: now, updatedAt: now });
    saveRatingsToFile(ratings);
  }

  return {
    ...ratingData,
    id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 获取评分统计
 */
export async function getRatingStats(agentId: string): Promise<RatingStats | null> {
  // 验证 Agent 存在
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent 不存在: ${agentId}`);
  }

  if (usePostgres) {
    const result = await query(
      `SELECT
        AVG(rating) as average_rating,
        COUNT(*) as total_ratings,
        jsonb_object_agg(rating, COUNT(*)) as rating_counts
       FROM ${TABLE_NAME}
       WHERE agent_id = $1
       GROUP BY agent_id`,
      [agentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const ratingCounts: Record<number, number> = {};

    // 解析 JSONB 对象
    if (row.rating_counts) {
      for (const [rating, count] of Object.entries(row.rating_counts)) {
        ratingCounts[parseInt(rating)] = count as number;
      }
    }

    // 计算百分比
    const total = row.total_ratings || 0;
    const oneStarPercent = total > 0 ? ((ratingCounts[1] || 0) / total) * 100 : 0;
    const twoStarPercent = total > 0 ? ((ratingCounts[2] || 0) / total) * 100 : 0;
    const threeStarPercent = total > 0 ? ((ratingCounts[3] || 0) / total) * 100 : 0;
    const fourStarPercent = total > 0 ? ((ratingCounts[4] || 0) / total) * 100 : 0;
    const fiveStarPercent = total > 0 ? ((ratingCounts[5] || 0) / total) * 100 : 0;

    return {
      agentId,
      averageRating: parseFloat(row.average_rating.toFixed(2)),
      totalRatings: row.total_ratings || 0,
      ratingCounts,
      oneStarPercent,
      twoStarPercent,
      threeStarPercent,
      fourStarPercent,
      fiveStarPercent,
    };
  } else {
    // 文件存储方式
    const ratings = loadRatingsFromFile();
    const agentRatings = ratings.filter((r) => r.agentId === agentId);

    if (agentRatings.length === 0) {
      return null;
    }

    const ratingCounts: Record<number, number> = {};
    agentRatings.forEach((r) => {
      ratingCounts[r.rating] = (ratingCounts[r.rating] || 0) + 1;
    });

    const total = agentRatings.length;
    const averageRating =
      agentRatings.reduce((sum, r) => sum + r.rating, 0) / total;

    return {
      agentId,
      averageRating: parseFloat(averageRating.toFixed(2)),
      totalRatings: total,
      ratingCounts,
      oneStarPercent: (ratingCounts[1] || 0) / total,
      twoStarPercent: (ratingCounts[2] || 0) / total,
      threeStarPercent: (ratingCounts[3] || 0) / total,
      fourStarPercent: (ratingCounts[4] || 0) / total,
      fiveStarPercent: (ratingCounts[5] || 0) / total,
    };
  }
}

/**
 * 获取评分历史
 */
export async function getRatingHistory(
  agentId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<RatingHistory> {
  // 验证 Agent 存在
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent 不存在: ${agentId}`);
  }

  if (usePostgres) {
    const offset = (page - 1) * pageSize;

    const result = await query(
      `SELECT * FROM ${TABLE_NAME}
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentId, pageSize, offset]
    );

    const totalResult = await query(
      `SELECT COUNT(*) as total FROM ${TABLE_NAME} WHERE agent_id = $1`,
      [agentId]
    );

    return {
      rating: result.rows.map(mapRow),
      total: totalResult.rows[0].total,
      page,
      pageSize,
      totalPages: Math.ceil((totalResult.rows[0].total || 0) / pageSize),
    };
  } else {
    // 文件存储方式
    const ratings = loadRatingsFromFile();
    const agentRatings = ratings
      .filter((r) => r.agentId === agentId)
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    const total = agentRatings.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedRatings = agentRatings.slice(start, end);

    return {
      rating: paginatedRatings.map(mapRow),
      total,
      page,
      pageSize,
      totalPages,
    };
  }
}

/**
 * 获取评分详情
 */
export async function getRating(ratingId: string): Promise<AgentRating | null> {
  if (usePostgres) {
    const result = await query(
      `SELECT * FROM ${TABLE_NAME} WHERE id = $1`,
      [ratingId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRow(result.rows[0]);
  } else {
    const ratings = loadRatingsFromFile();
    return ratings.find((r) => r.id === ratingId) || null;
  }
}

/**
 * 删除评分
 */
export async function deleteRating(ratingId: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query(
      `DELETE FROM ${TABLE_NAME} WHERE id = $1`,
      [ratingId]
    );
    return (result.rowCount || 0) > 0;
  } else {
    const ratings = loadRatingsFromFile();
    const initialLength = ratings.length;
    const filteredRatings = ratings.filter((r) => r.id !== ratingId);
    const deleted = initialLength !== filteredRatings.length;

    if (deleted) {
      saveRatingsToFile(filteredRatings);
    }

    return deleted;
  }
}

/**
 * 加载评分文件
 */
function loadRatingsFromFile(): AgentRating[] {
  const ratingsFile = '../data/ratings.json';
  const ratings: AgentRating[] = [];

  if (usePostgres) {
    return ratings;
  }

  try {
    const fs = require('fs');
    const path = require('path');

    if (fs.existsSync(path.resolve(__dirname, ratingsFile))) {
      const raw = fs.readFileSync(path.resolve(__dirname, ratingsFile), 'utf-8');
      const data = JSON.parse(raw) as AgentRating[];
      for (const r of data) ratings.push(r);
    }
  } catch (e) {
    console.warn('加载评分文件失败:', e);
  }

  return ratings;
}

/**
 * 保存评分文件
 */
function saveRatingsToFile(ratings: AgentRating[]): void {
  try {
    const fs = require('fs');
    const path = require('path');

    if (usePostgres) {
      return;
    }

    const ratingsFile = '../data/ratings.json';
    const filePath = path.resolve(__dirname, ratingsFile);

    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      filePath,
      JSON.stringify(ratings, null, 2),
      'utf-8'
    );
  } catch (e) {
    console.error('保存评分文件失败:', e);
  }
}

/**
 * 获取用户对 Agent 的评分（防止重复评分）
 */
export async function getUserRating(
  agentId: string,
  userId: string
): Promise<AgentRating | null> {
  if (usePostgres) {
    const result = await query(
      `SELECT * FROM ${TABLE_NAME}
       WHERE agent_id = $1 AND user_id = $2`,
      [agentId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRow(result.rows[0]);
  } else {
    const ratings = loadRatingsFromFile();
    return ratings.find((r) => r.agentId === agentId && r.userId === userId) || null;
  }
}

/**
 * 获取所有评分（管理员功能）
 */
export async function getAllRatings(): Promise<AgentRating[]> {
  if (usePostgres) {
    const result = await query(
      `SELECT * FROM ${TABLE_NAME} ORDER BY created_at DESC`
    );
    return result.rows.map(mapRow);
  } else {
    const ratings = loadRatingsFromFile();
    return ratings.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}
