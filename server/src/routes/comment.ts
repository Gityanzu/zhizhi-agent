import { Router, Request, Response } from 'express';
import {
  createComment,
  getComments,
  getComment,
  deleteComment,
  likeComment,
  getCommentTree,
  getCommentStats,
  getAllComments,
  getUserComments,
} from '../services/comment';
import type { CommentRequest, LikeRequest, CommentTree, CommentStats } from '../types/comment';

const router = Router();

// ==================== 评论操作 ====================

/**
 * 发表评论
 * POST /api/agent-market/comments/:id
 */
router.post('/:id', async (req: Request, res: Response) => {
  try {
    const { id: agentId } = req.params;
    const { content, userId } = req.body;
    const { parentId } = req.query;

    // 验证 Agent ID
    if (!agentId) {
      return res.status(400).json({
        code: 400,
        message: 'Agent ID 不能为空',
      });
    }

    // 验证用户 ID
    if (!userId) {
      return res.status(400).json({
        code: 400,
        message: '用户 ID 不能为空',
      });
    }

    // 验证评论内容
    if (!content) {
      return res.status(400).json({
        code: 400,
        message: '评论内容不能为空',
      });
    }

    // 创建评论
    const commentData: CommentRequest = {
      agentId,
      content,
    };

    if (parentId) {
      commentData.parentId = parentId as string;
    }

    const result = await createComment({
      ...commentData,
      userId,
    });

    res.json({
      code: 201,
      message: '评论成功',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '评论失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 评论查询 ====================

/**
 * 获取评论列表
 * GET /api/agent-market/comments/:id?page=1&pageSize=10
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id: agentId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;

    if (!agentId) {
      return res.status(400).json({
        code: 400,
        message: 'Agent ID 不能为空',
      });
    }

    const result = await getComments(agentId, page, pageSize);

    res.json({
      code: 200,
      message: '获取成功',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评论列表失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取评论详情
 * GET /api/agent-market/comments/:id/:commentId
 */
router.get('/:id/:commentId', async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;

    if (!commentId) {
      return res.status(400).json({
        code: 400,
        message: '评论 ID 不能为空',
      });
    }

    const comment = await getComment(commentId);

    if (!comment) {
      return res.status(404).json({
        code: 404,
        message: '评论不存在',
      });
    }

    res.json({
      code: 200,
      message: '获取成功',
      data: comment,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评论详情失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取评论树结构
 * GET /api/agent-market/comments/:id/tree
 */
router.get('/:id/tree', async (req: Request, res: Response) => {
  try {
    const { id: agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({
        code: 400,
        message: 'Agent ID 不能为空',
      });
    }

    const commentTree = await getCommentTree(agentId);

    res.json({
      code: 200,
      message: '获取成功',
      data: commentTree,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评论树失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取评论统计
 * GET /api/agent-market/comments/:id/stats
 */
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id: agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({
        code: 400,
        message: 'Agent ID 不能为空',
      });
    }

    const stats = await getCommentStats(agentId);

    if (!stats) {
      return res.status(404).json({
        code: 404,
        message: 'Agent 暂无评论',
      });
    }

    res.json({
      code: 200,
      message: '获取成功',
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评论统计失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 交互操作 ====================

/**
 * 点赞评论
 * POST /api/agent-market/comments/:id/like
 */
router.post('/:id/like', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        code: 400,
        message: '用户 ID 不能为空',
      });
    }

    // 从 URL 获取评论 ID（假设是评论的详情页面）
    const commentId = req.params.commentId;
    if (!commentId) {
      return res.status(400).json({
        code: 400,
        message: '评论 ID 不能为空',
      });
    }

    const likeData: LikeRequest = {
      commentId,
      userId,
    };

    await likeComment(likeData);

    res.json({
      code: 200,
      message: '点赞成功',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '点赞失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 管理员功能 ====================

/**
 * 删除评论
 * DELETE /api/agent-market/comments/:id/:commentId
 */
router.delete('/:id/:commentId', async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;

    if (!commentId) {
      return res.status(400).json({
        code: 400,
        message: '评论 ID 不能为空',
      });
    }

    const result = await deleteComment(commentId);

    if (!result) {
      return res.status(404).json({
        code: 404,
        message: '评论不存在',
      });
    }

    res.json({
      code: 200,
      message: '删除成功',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '删除评论失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取所有评论（管理员功能）
 * GET /api/agent-market/comments/admin
 */
router.get('/admin', async (req: Request, res: Response) => {
  try {
    const comments = await getAllComments();

    res.json({
      code: 200,
      message: '获取成功',
      data: comments,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取所有评论失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取用户评论
 * GET /api/agent-market/comments/user/:userId
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        code: 400,
        message: '用户 ID 不能为空',
      });
    }

    const comments = await getUserComments(userId);

    res.json({
      code: 200,
      message: '获取成功',
      data: comments,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取用户评论失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 审核评论
 * POST /api/agent-market/comments/:commentId/moderate
 */
router.post('/:commentId/moderate', async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const { action, reason } = req.body;

    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限执行此操作',
      });
    }

    if (!action || !['approve', 'reject', 'hide'].includes(action)) {
      return res.status(400).json({
        code: 400,
        message: '无效的审核操作',
      });
    }

    const comment = await moderateComment(commentId, req.userId, action, reason);

    res.json({
      code: 200,
      message: '审核成功',
      data: comment,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '审核评论失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取待审核评论
 * GET /api/agent-market/comments/pending
 */
router.get('/pending', async (req: Request, res: Response) => {
  try {
    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限访问',
      });
    }

    const comments = await getPendingComments();

    res.json({
      code: 200,
      message: '获取成功',
      data: comments,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取待审核评论失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取已隐藏评论
 * GET /api/agent-market/comments/hidden
 */
router.get('/hidden', async (req: Request, res: Response) => {
  try {
    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限访问',
      });
    }

    const comments = await getHiddenComments();

    res.json({
      code: 200,
      message: '获取成功',
      data: comments,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取已隐藏评论失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 批量审核评论
 * POST /api/agent-market/comments/batch-moderate
 */
router.post('/batch-moderate', async (req: Request, res: Response) => {
  try {
    const { commentIds, action, reason } = req.body;

    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限执行此操作',
      });
    }

    if (!Array.isArray(commentIds) || commentIds.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '评论 ID 列表不能为空',
      });
    }

    if (!action || !['approve', 'reject', 'hide'].includes(action)) {
      return res.status(400).json({
        code: 400,
        message: '无效的审核操作',
      });
    }

    const result = await batchModerateComments(commentIds, req.userId, action, reason);

    res.json({
      code: 200,
      message: '批量审核完成',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '批量审核失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
