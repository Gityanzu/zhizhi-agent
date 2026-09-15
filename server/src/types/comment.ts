/**
 * Agent 评论相关类型定义
 */

/**
 * Agent 评论
 */
export interface AgentComment {
  id: string;
  agentId: string;
  userId: string;
  parentId?: string; // 回复评论的 ID
  content: string;
  likes: number;
  createdAt: string;
  updatedAt: string;
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
 * 评论统计
 */
export interface CommentStats {
  agentId: string;
  totalComments: number;
  totalLikes: number;
  averageLength: number;
}

/**
 * 评论树结构（支持回复）
 */
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
