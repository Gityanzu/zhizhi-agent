import { Router, Request, Response } from 'express';
import {
  createUserRating,
  updateUserRating,
  deleteUserRating,
  getUserRating,
  getRatings,
  getRatingStats,
  getAllAgentsRatingStats,
  disableRating,
  restoreRating,
  adminDeleteRating,
} from '../services/rating';
import type {
  CreateRatingRequest,
  UpdateRatingRequest,
  RatingQueryParams,
  RatingStats,
} from '../types/rating';

const router = Router();

/**
 * 创建评分
 * POST /api/agent-market/ratings/:agentId
 */
router.post('/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const data: CreateRatingRequest = req.body;

    // 验证数据
    if (typeof data.rating !== 'number' || data.rating < 1 || data.rating > 5) {
      return res.status(400).json({
        code: 400,
        message: '评分必须是 1-5 之间的数字',
      });
    }

    const rating = await createUserRating(agentId, req.userId, data);

    res.status(201).json({
      code: 201,
      message: '评分成功',
      data: rating,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '创建评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 更新评分
 * PUT /api/agent-market/ratings/:ratingId
 */
router.put('/:ratingId', async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const data: UpdateRatingRequest = req.body;

    const rating = await updateUserRating(ratingId, req.userId, data);

    res.json({
      code: 200,
      message: '更新评分成功',
      data: rating,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '更新评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 删除评分
 * DELETE /api/agent-market/ratings/:ratingId
 */
router.delete('/:ratingId', async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const result = await deleteUserRating(ratingId, req.userId);

    if (!result) {
      return res.status(404).json({
        code: 404,
        message: '评分不存在',
      });
    }

    res.json({
      code: 200,
      message: '删除评分成功',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '删除评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取用户评分
 * GET /api/agent-market/ratings/:agentId/user
 */
router.get('/:agentId/user', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const rating = await getUserRating(agentId, req.userId);

    if (!rating) {
      return res.status(404).json({
        code: 404,
        message: '您尚未评分',
      });
    }

    res.json({
      code: 200,
      message: '获取评分成功',
      data: rating,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取评分列表
 * GET /api/agent-market/ratings
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const params: RatingQueryParams = {
      agentId: req.query.agentId as string,
      userId: req.query.userId as string,
      status: req.query.status as any,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 10,
    };

    const result = await getRatings(params);

    res.json({
      code: 200,
      message: '获取评分列表成功',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评分列表失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取评分统计
 * GET /api/agent-market/ratings/:agentId/stats
 */
router.get('/:agentId/stats', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    const stats: RatingStats = await getRatingStats(agentId);

    res.json({
      code: 200,
      message: '获取评分统计成功',
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评分统计失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取所有 Agent 的评分统计
 * GET /api/agent-market/ratings/stats/all
 */
router.get('/stats/all', async (req: Request, res: Response) => {
  try {
    const stats = await getAllAgentsRatingStats();

    res.json({
      code: 200,
      message: '获取所有 Agent 评分统计成功',
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评分统计失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 禁用评分（管理员功能）
 * POST /api/agent-market/ratings/:ratingId/disable
 */
router.post('/:ratingId/disable', async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;

    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限执行此操作',
      });
    }

    const rating = await disableRating(ratingId, req.userId);

    res.json({
      code: 200,
      message: '禁用评分成功',
      data: rating,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '禁用评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 恢复评分（管理员功能）
 * POST /api/agent-market/ratings/:ratingId/restore
 */
router.post('/:ratingId/restore', async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;

    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限执行此操作',
      });
    }

    const rating = await restoreRating(ratingId, req.userId);

    res.json({
      code: 200,
      message: '恢复评分成功',
      data: rating,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '恢复评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 删除评分（管理员功能）
 * DELETE /api/agent-market/ratings/:ratingId/admin
 */
router.delete('/:ratingId/admin', async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;

    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限执行此操作',
      });
    }

    const result = await adminDeleteRating(ratingId, req.userId);

    if (!result) {
      return res.status(404).json({
        code: 404,
        message: '评分不存在',
      });
    }

    res.json({
      code: 200,
      message: '删除评分成功',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '删除评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;