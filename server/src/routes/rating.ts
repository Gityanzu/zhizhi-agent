import { Router, Request, Response } from 'express';
import {
  createRating,
  getRatingStats,
  getRatingHistory,
  getRating,
  deleteRating,
  getUserRating,
  getAllRatings,
} from '../services/rating';
import type { RatingRequest, RatingResponse } from '../types/rating';

const router = Router();

// ==================== 评分操作 ====================

/**
 * 对 Agent 进行评分
 * POST /api/agent-market/ratings/:id
 */
router.post('/:id', async (req: Request, res: Response) => {
  try {
    const { id: agentId } = req.params;
    const { userId, rating, comment } = req.body;

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

    // 验证评分数据
    if (rating === undefined || rating === null) {
      return res.status(400).json({
        code: 400,
        message: '评分不能为空',
      });
    }

    // 创建评分
    const ratingData: RatingRequest = {
      agentId,
      rating,
      comment,
    };

    const result = await createRating(ratingData);

    res.json({
      code: 201,
      message: '评分成功',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 评分查询 ====================

/**
 * 获取评分统计
 * GET /api/agent-market/ratings/:id/stats
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

    const stats = await getRatingStats(agentId);

    if (!stats) {
      return res.status(404).json({
        code: 404,
        message: 'Agent 暂无评分',
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
      message: '获取评分统计失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取评分历史
 * GET /api/agent-market/ratings/:id/history?page=1&pageSize=10
 */
router.get('/:id/history', async (req: Request, res: Response) => {
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

    const history = await getRatingHistory(agentId, page, pageSize);

    res.json({
      code: 200,
      message: '获取成功',
      data: history,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评分历史失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取评分详情
 * GET /api/agent-market/ratings/:ratingId
 */
router.get('/:ratingId', async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;

    if (!ratingId) {
      return res.status(400).json({
        code: 400,
        message: '评分 ID 不能为空',
      });
    }

    const rating = await getRating(ratingId);

    if (!rating) {
      return res.status(404).json({
        code: 404,
        message: '评分不存在',
      });
    }

    res.json({
      code: 200,
      message: '获取成功',
      data: rating,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评分详情失败',
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

    if (!ratingId) {
      return res.status(400).json({
        code: 400,
        message: '评分 ID 不能为空',
      });
    }

    const result = await deleteRating(ratingId);

    if (!result) {
      return res.status(404).json({
        code: 404,
        message: '评分不存在',
      });
    }

    res.json({
      code: 200,
      message: '删除成功',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '删除评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 管理员功能 ====================

/**
 * 获取所有评分（管理员功能）
 * GET /api/agent-market/ratings
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const ratings = await getAllRatings();

    res.json({
      code: 200,
      message: '获取成功',
      data: ratings,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取所有评分失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
