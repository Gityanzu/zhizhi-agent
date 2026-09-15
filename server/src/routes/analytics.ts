import { Router, Request, Response } from 'express';
import {
  getAgentViewStats,
  getAllAgentViewStats,
  incrementViewCount,
  getTemplateUsageStats,
  getAllTemplateUsageStats,
  getRatingTrendStats,
  getAllRatingTrendStats,
  getPopularAgentsStats,
  getAnalyticsSummary,
  wrapStatsResponse,
} from '../services/analytics';
import type { StatsResponse } from '../types/analytics';

const router = Router();

// ==================== 访问统计 ====================

/**
 * 获取单个 Agent 的访问统计
 * GET /api/agent-market/analytics/views/:agentId
 */
router.get('/views/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    const stats = await getAgentViewStats(agentId);

    if (!stats) {
      return res.status(404).json({
        code: 404,
        message: 'Agent 不存在',
      });
    }

    const response = wrapStatsResponse(stats, '最近30天');

    res.json({
      code: 200,
      message: '获取成功',
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取访问统计失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取所有 Agent 的访问统计
 * GET /api/agent-market/analytics/views
 */
router.get('/views', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const stats = await getAllAgentViewStats();

    const response = wrapStatsResponse(stats.slice(0, limit), '最近30天');

    res.json({
      code: 200,
      message: '获取成功',
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取访问统计失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 增加访问计数
 * POST /api/agent-market/analytics/views/:agentId
 */
router.post('/views/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    await incrementViewCount(agentId);

    res.json({
      code: 200,
      message: '访问计数已更新',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '更新访问计数失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 模板使用统计 ====================

/**
 * 获取单个模板的使用统计
 * GET /api/agent-market/analytics/usage/:templateId
 */
router.get('/usage/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    const stats = await getTemplateUsageStats(templateId);

    if (!stats) {
      return res.status(404).json({
        code: 404,
        message: '模板不存在或暂无使用数据',
      });
    }

    const response = wrapStatsResponse(stats, '最近30天');

    res.json({
      code: 200,
      message: '获取成功',
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取使用统计失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取所有模板的使用统计
 * GET /api/agent-market/analytics/usage
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const stats = await getAllTemplateUsageStats();

    const response = wrapStatsResponse(stats.slice(0, limit), '最近30天');

    res.json({
      code: 200,
      message: '获取成功',
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取使用统计失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 评分趋势统计 ====================

/**
 * 获取单个 Agent 的评分趋势统计
 * GET /api/agent-market/analytics/ratings/:agentId
 */
router.get('/ratings/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    const stats = await getRatingTrendStats(agentId);

    if (!stats) {
      return res.status(404).json({
        code: 404,
        message: 'Agent 不存在或暂无评分数据',
      });
    }

    const response = wrapStatsResponse(stats, '最近30天');

    res.json({
      code: 200,
      message: '获取成功',
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评分趋势失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取所有 Agent 的评分趋势统计
 * GET /api/agent-market/analytics/ratings
 */
router.get('/ratings', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const stats = await getAllRatingTrendStats();

    const response = wrapStatsResponse(stats.slice(0, limit), '最近30天');

    res.json({
      code: 200,
      message: '获取成功',
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取评分趋势失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 热门 Agent ====================

/**
 * 获取热门 Agent 列表
 * GET /api/agent-market/analytics/popular
 */
router.get('/popular', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const popularAgents = await getPopularAgentsStats(limit);

    const response = wrapStatsResponse(popularAgents, '基于综合指标');

    res.json({
      code: 200,
      message: '获取成功',
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取热门 Agent 失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 统计汇总 ====================

/**
 * 获取统计汇总
 * GET /api/agent-market/analytics/summary
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const summary = await getAnalyticsSummary();

    res.json({
      code: 200,
      message: '获取成功',
      data: summary,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取统计汇总失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
