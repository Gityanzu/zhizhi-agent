import { api } from './request';
import type {
  AgentComment,
  CommentListResponse,
  CommentRequest,
  LikeRequest,
  CommentStats,
  CommentTree,
} from '@/types/comment';

// ==================== 评论操作 ====================

/**
 * 发表评论
 */
export async function createComment(agentId: string, data: {
  content: string;
  userId: string;
  parentId?: string;
}): Promise<AgentComment> {
  const res = await api.post(`/agent-market/comments/${agentId}`, data);
  return res.data;
}

// ==================== 评论查询 ====================

/**
 * 获取评论列表
 */
export async function getComments(
  agentId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<CommentListResponse> {
  const params: any = { page, pageSize };
  const res = await api.get(`/agent-market/comments/${agentId}`, {
    params,
  });
  return res.data;
}

/**
 * 获取评论详情
 */
export async function getComment(agentId: string, commentId: string): Promise<AgentComment> {
  const res = await api.get(`/agent-market/comments/${agentId}/${commentId}`);
  return res.data;
}

/**
 * 获取评论树结构
 */
export async function getCommentTree(agentId: string): Promise<CommentTree> {
  const res = await api.get(`/agent-market/comments/${agentId}/tree`);
  return res.data;
}

/**
 * 获取评论统计
 */
export async function getCommentStats(agentId: string): Promise<CommentStats> {
  const res = await api.get(`/agent-market/comments/${agentId}/stats`);
  return res.data;
}

// ==================== 交互操作 ====================

/**
 * 点赞评论
 */
export async function likeComment(agentId: string, data: {
  commentId: string;
  userId: string;
}): Promise<void> {
  const res = await api.post(`/agent-market/comments/${agentId}/like`, data);
  return res.data;
}

// ==================== 管理员功能 ====================

/**
 * 删除评论
 */
export async function deleteComment(agentId: string, commentId: string): Promise<void> {
  await api.delete(`/agent-market/comments/${agentId}/${commentId}`);
}

/**
 * 获取所有评论
 */
export async function getAllComments(): Promise<AgentComment[]> {
  const res = await api.get('/agent-market/comments/admin');
  return res.data;
}

/**
 * 获取用户评论
 */
export async function getUserComments(userId: string): Promise<AgentComment[]> {
  const res = await api.get(`/agent-market/comments/user/${userId}`);
  return res.data;
}