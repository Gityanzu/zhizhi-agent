import { v4 as uuidv4 } from 'uuid';
import { usePostgres, query } from '../db';
import { getAgent } from './customAgent';
import type { AgentComment, CommentListResponse, CommentTree, CommentRequest, LikeRequest, CommentStats } from '../types/comment';

const TABLE_NAME = 'agent_comments';

/**
 * 映射数据库行到 AgentComment
 */
function mapRow(row: any): AgentComment {
  return {
    id: row.id,
    agentId: row.agent_id,
    userId: row.user_id,
    parentId: row.parent_id,
    content: row.content,
    likes: row.likes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 验证评论内容
 */
function validateCommentContent(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!content || content.trim() === '') {
    errors.push('评论内容不能为空');
  }

  if (content.length > 2000) {
    errors.push('评论内容不能超过 2000 字符');
  }

  if (content.trim().length < 10) {
    errors.push('评论内容至少需要 10 个字符');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 创建评论
 */
export async function createComment(data: CommentRequest & { userId: string }): Promise<AgentComment> {
  // 验证 Agent 存在
  const agent = await getAgent(data.agentId);
  if (!agent) {
    throw new Error(`Agent 不存在: ${data.agentId}`);
  }

  // 验证评论内容
  const validation = validateCommentContent(data.content);
  if (!validation.valid) {
    throw new Error(`评论验证失败: ${validation.errors.join(', ')}`);
  }

  // 如果是回复评论，检查父评论是否存在
  if (data.parentId) {
    const parentComment = await getComment(data.parentId);
    if (!parentComment) {
      throw new Error(`父评论不存在: ${data.parentId}`);
    }
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  const commentData: Omit<AgentComment, 'id' | 'createdAt' | 'updatedAt'> = {
    agentId: data.agentId,
    userId: data.userId,
    parentId: data.parentId,
    content: data.content,
    likes: 0,
  };

  if (usePostgres) {
    await query(
      `INSERT INTO ${TABLE_NAME}
       (id, agent_id, user_id, parent_id, content, likes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, commentData.agentId, commentData.userId, commentData.parentId, commentData.content, commentData.likes, now, now]
    );
  } else {
    // 文件存储方式
    const commentsFile = `../data/comments.json`;
    const comments = loadCommentsFromFile();
    comments.push({ ...commentData, id, createdAt: now, updatedAt: now });
    saveCommentsToFile(comments);
  }

  return {
    ...commentData,
    id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 获取评论列表
 */
export async function getComments(
  agentId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<CommentListResponse> {
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
      comments: result.rows.map(mapRow),
      total: totalResult.rows[0].total,
      page,
      pageSize,
      totalPages: Math.ceil((totalResult.rows[0].total || 0) / pageSize),
    };
  } else {
    // 文件存储方式
    const comments = loadCommentsFromFile();
    const agentComments = comments
      .filter((c) => c.agentId === agentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = agentComments.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedComments = agentComments.slice(start, end);

    return {
      comments: paginatedComments, // No need to map since they're already in the correct format
      total,
      page,
      pageSize,
      totalPages,
    };
  }
}

/**
 * 获取评论详情
 */
export async function getComment(commentId: string): Promise<AgentComment | null> {
  if (usePostgres) {
    const result = await query(
      `SELECT * FROM ${TABLE_NAME} WHERE id = $1`,
      [commentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRow(result.rows[0]);
  } else {
    const comments = loadCommentsFromFile();
    return comments.find((c) => c.id === commentId) || null;
  }
}

/**
 * 删除评论
 */
export async function deleteComment(commentId: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query(
      `DELETE FROM ${TABLE_NAME} WHERE id = $1`,
      [commentId]
    );
    return (result.rowCount || 0) > 0;
  } else {
    const comments = loadCommentsFromFile();
    const initialLength = comments.length;
    const filteredComments = comments.filter((c) => c.id !== commentId);
    const deleted = initialLength !== filteredComments.length;

    if (deleted) {
      saveCommentsToFile(filteredComments);
    }

    return deleted;
  }
}

/**
 * 点赞评论
 */
export async function likeComment(data: LikeRequest): Promise<void> {
  const comment = await getComment(data.commentId);
  if (!comment) {
    throw new Error(`评论不存在: ${data.commentId}`);
  }

  if (usePostgres) {
    await query(
      `UPDATE ${TABLE_NAME} SET likes = likes + 1 WHERE id = $1`,
      [data.commentId]
    );
  } else {
    const comments = loadCommentsFromFile();
    const commentIndex = comments.findIndex((c) => c.id === data.commentId);
    if (commentIndex >= 0) {
      comments[commentIndex].likes += 1;
      comments[commentIndex].updatedAt = new Date().toISOString();
      saveCommentsToFile(comments);
    }
  }
}

/**
 * 获取评论树结构
 */
export async function getCommentTree(agentId: string): Promise<CommentTree[]> {
  const { comments } = await getComments(agentId, 1, 1000);

  // 构建评论树
  const commentMap = new Map<string, CommentTree>();
  const rootComments: CommentTree[] = [];

  // 第一次遍历：创建所有评论节点
  comments.forEach((comment) => {
    const node: CommentTree = {
      ...comment,
      replies: [],
    };
    commentMap.set(comment.id, node);
  });

  // 第二次遍历：构建层级关系
  comments.forEach((comment) => {
    const node = commentMap.get(comment.id);
    if (comment.parentId) {
      const parent = commentMap.get(comment.parentId);
      if (parent) {
        parent.replies!.push(node!);
      }
    } else {
      rootComments.push(node!);
    }
  });

  return rootComments;
}

/**
 * 获取评论统计
 */
export async function getCommentStats(agentId: string): Promise<CommentStats | null> {
  // 验证 Agent 存在
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent 不存在: ${agentId}`);
  }

  if (usePostgres) {
    const result = await query(
      `SELECT
        COUNT(*) as total_comments,
        SUM(likes) as total_likes,
       AVG(LENGTH(content)) as average_length
       FROM ${TABLE_NAME}
       WHERE agent_id = $1`,
      [agentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      agentId,
      totalComments: row.total_comments || 0,
      totalLikes: row.total_likes || 0,
      averageLength: parseFloat(row.average_length?.toFixed(2) || '0'),
    };
  } else {
    const comments = loadCommentsFromFile();
    const agentComments = comments.filter((c) => c.agentId === agentId);

    if (agentComments.length === 0) {
      return null;
    }

    const totalComments = agentComments.length;
    const totalLikes = agentComments.reduce((sum, c) => sum + c.likes, 0);
    const averageLength = agentComments.reduce((sum, c) => sum + c.content.length, 0) / totalComments;

    return {
      agentId,
      totalComments,
      totalLikes,
      averageLength: parseFloat(averageLength.toFixed(2)),
    };
  }
}

/**
 * 加载评论文件
 */
function loadCommentsFromFile(): AgentComment[] {
  const commentsFile = '../data/comments.json';
  const comments: AgentComment[] = [];

  if (usePostgres) {
    return comments;
  }

  try {
    const fs = require('fs');
    const path = require('path');

    if (fs.existsSync(path.resolve(__dirname, commentsFile))) {
      const raw = fs.readFileSync(path.resolve(__dirname, commentsFile), 'utf-8');
      const data = JSON.parse(raw) as AgentComment[];
      for (const c of data) comments.push(c);
    }
  } catch (e) {
    console.warn('加载评论文件失败:', e);
  }

  return comments;
}

/**
 * 保存评论文件
 */
function saveCommentsToFile(comments: AgentComment[]): void {
  try {
    const fs = require('fs');
    const path = require('path');

    if (usePostgres) {
      return;
    }

    const commentsFile = '../data/comments.json';
    const filePath = path.resolve(__dirname, commentsFile);

    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      filePath,
      JSON.stringify(comments, null, 2),
      'utf-8'
    );
  } catch (e) {
    console.error('保存评论文件失败:', e);
  }
}

/**
 * 获取所有评论（管理员功能）
 */
export async function getAllComments(): Promise<AgentComment[]> {
  if (usePostgres) {
    const result = await query(
      `SELECT * FROM ${TABLE_NAME} ORDER BY created_at DESC`
    );
    return result.rows.map(mapRow);
  } else {
    const comments = loadCommentsFromFile();
    return comments.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

/**
 * 获取用户评论
 */
export async function getUserComments(userId: string): Promise<AgentComment[]> {
  if (usePostgres) {
    const result = await query(
      `SELECT * FROM ${TABLE_NAME} WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(mapRow);
  } else {
    const comments = loadCommentsFromFile();
    return comments
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
