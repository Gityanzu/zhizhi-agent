import { Router, Request, Response } from 'express';
import {
  searchAgents,
  getSearchSuggestions,
  getPopularSearches,
  getSearchStats,
  addSearchHistory,
  getUserSearchHistory,
  clearSearchHistory,
} from '../services/search';
import type { SearchParams, SearchSuggestion, PopularSearch, SearchStats, SearchHistory } from '../types/search';

const router = Router();

/**
 * 搜索 Agent
 * GET /api/agent-market/search
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      query = '',
      category,
      model,
      sortBy = 'relevance',
      sortOrder = 'desc',
      page = 1,
      pageSize = 10,
    } = req.query;

    // 构建搜索参数
    const searchParams: SearchParams = {
      query: query as string,
      category: category as string,
      model: model as string,
      sortBy: sortBy as SearchParams['sortBy'],
      sortOrder: sortOrder as SearchParams['sortOrder'],
      page: parseInt(page as string),
      pageSize: parseInt(pageSize as string),
    };

    // 执行搜索
    const result = await searchAgents(searchParams);

    // 如果有查询词，添加搜索历史（需要用户登录）
    if (searchParams.query && req.userId) {
      await addSearchHistory(req.userId, searchParams.query, result.agents.length);
    }

    res.json({
      code: 200,
      message: '搜索成功',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '搜索失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取搜索建议
 * GET /api/agent-market/search/suggestions?q=关键词
 */
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        code: 400,
        message: '查询参数不能为空',
      });
    }

    const suggestions = await getSearchSuggestions(q);

    res.json({
      code: 200,
      message: '获取成功',
      data: suggestions,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取搜索建议失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取热门搜索
 * GET /api/agent-market/search/popular
 */
router.get('/popular', async (req: Request, res: Response) => {
  try {
    const popularSearches = await getPopularSearches();

    res.json({
      code: 200,
      message: '获取成功',
      data: popularSearches,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取热门搜索失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取搜索统计
 * GET /api/agent-market/search/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getSearchStats();

    res.json({
      code: 200,
      message: '获取成功',
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取搜索统计失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取用户搜索历史
 * GET /api/agent-market/search/history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const history = await getUserSearchHistory(req.userId);

    res.json({
      code: 200,
      message: '获取成功',
      data: history,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取搜索历史失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 清除搜索历史
 * DELETE /api/agent-market/search/history
 */
router.delete('/history', async (req: Request, res: Response) => {
  try {
    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    await clearSearchHistory(req.userId);

    res.json({
      code: 200,
      message: '清除成功',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '清除搜索历史失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 高级搜索
 * POST /api/agent-market/search/advanced
 */
router.post('/advanced', async (req: Request, res: Response) => {
  try {
    const searchParams: SearchParams = req.body;

    // 验证必填参数
    if (!searchParams.query && !searchParams.category) {
      return res.status(400).json({
        code: 400,
        message: '查询条件不能为空',
      });
    }

    const result = await searchAgents(searchParams);

    // 添加搜索历史
    if (searchParams.query && req.userId) {
      await addSearchHistory(req.userId, searchParams.query, result.agents.length);
    }

    res.json({
      code: 200,
      message: '搜索成功',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '高级搜索失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;