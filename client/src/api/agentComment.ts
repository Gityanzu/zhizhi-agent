import request from './request';

/**
 * 评论状�? */
export type CommentStatus = 'active' | 'pending' | 'rejected' | 'hidden';

/**
 * 评论请求
 */
export interface CommentRequest {
  agentId: string;
  content: string;
  parentId?: string;
}

/**
 * 点赞请求
 */
export interface LikeRequest {
  commentId: string;
  userId: string;
}

/**
 * 评论
 */
export interface AgentComment {
  id: string;
  agentId: string;
  userId: string;
  parentId?: string;
  content: string;
  likes: number;
  createdAt: string;
  updatedAt: string;
  status?: CommentStatus;
  moderatedBy?: string;
  moderationReason?: string;
}

/**
 * 评论列表响应
 */
export interface CommentListResponse {
  comments: AgentComment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 评论树节�? */
export interface CommentTree {
  id: string;
  agentId: string;
  userId: string;
  content: string;
  likes: number;
  createdAt: string;
  updatedAt: string;
  replies?: CommentTree[];
}

/**
 * 评论统计
 */
export interface CommentStats {
  agentId: string;
  totalComments: number;
  totalLikes: number;
  averageLength: number;
}

/**
 * 发表评论
 */
export async function createComment(data: CommentRequest & { userId: string }): Promise<AgentComment> {
  const response = await api.post('/api/agent-market/comments', data);
  return response.data;
}

/**
 * 获取评论列表
 */
export async function getComments(
  agentId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<CommentListResponse> {
  const response = await api.get(`/api/agent-market/comments/${agentId}`, {
    params: { page, pageSize },
  });
  return response.data;
}

/**
 * 获取单个评论
 */
export async function getComment(commentId: string): Promise<AgentComment> {
  const response = await api.get(`/api/agent-market/comments/${commentId}`);
  return response.data;
}

/**
 * 点赞评论
 */
export async function likeComment(data: LikeRequest): Promise<void> {
  await api.post(`/api/agent-market/comments/like`, data);
}

/**
 * 删除评论
 */
export async function deleteComment(commentId: string): Promise<void> {
  await api.delete(`/api/agent-market/comments/${commentId}`);
}

/**
 * 获取评论�? */
export async function getCommentTree(agentId: string): Promise<CommentTree[]> {
  const response = await api.get(`/api/agent-market/comments/${agentId}/tree`);
  return response.data;
}

/**
 * 获取评论统计
 */
export async function getCommentStats(agentId: string): Promise<CommentStats> {
  const response = await api.get(`/api/agent-market/comments/${agentId}/stats`);
  return response.data;
}

/**
 * 获取所有评论（管理员）
 */
export async function getAllComments(): Promise<AgentComment[]> {
  const response = await api.get('/api/agent-market/comments/admin');
  return response.data;
}

/**
 * 获取用户评论
 */
export async function getUserComments(userId: string): Promise<AgentComment[]> {
  const response = await api.get(`/api/agent-market/comments/user/${userId}`);
  return response.data;
}

/**
 * 审核评论（管理员�? */
export async function moderateComment(
  commentId: string,
  action: 'approve' | 'reject' | 'hide',
  reason?: string
): Promise<AgentComment> {
  const response = await api.post(`/api/agent-market/comments/${commentId}/moderate`, {
    action,
    reason,
  });
  return response.data;
}

/**
 * 获取待审核评论（管理员）
 */
export async function getPendingComments(): Promise<AgentComment[]> {
  const response = await api.get('/api/agent-market/comments/pending');
  return response.data;
}

/**
 * 获取已隐藏评论（管理员）
 */
export async function getHiddenComments(): Promise<AgentComment[]> {
  const response = await api.get('/api/agent-market/comments/hidden');
  return response.data;
}

/**
 * 批量审核评论（管理员�? */
export async function batchModerateComments(
  commentIds: string[],
  action: 'approve' | 'reject' | 'hide',
  reason?: string
): Promise<{ success: number; failed: number }> {
  const response = await api.post('/api/agent-market/comments/batch-moderate', {
    commentIds,
    action,
    reason,
  });
  return response.data;
}
