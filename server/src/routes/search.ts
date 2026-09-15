import { Router, Request, Response } from 'express';
import {
  searchAgents,
  getCategoryList,
  getTagRecommendations,
  getPopularTags,
} from '../services/search';
import type {
  SearchRequest,
  TagRecommendationRequest,
  CategoryListResponse,
} from '../types/search';

const router = Router();

// ==================== 全文搜索 ====================

/**
 * 搜索 Agents
 * GET /api/agent-market/search?query=xxx&category=xxx&sort=latest&page=1&pageSize=20
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;
    const category = req.query.category as string;
    const tags = req.query.tags as string;
    const sort = req.query.sort as 'latest' | 'popular' | 'highest-rated';
    const sortOrder = req.query.sortOrder as 'asc' | 'desc';
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const filters: any = {
      sortBy: sort || 'latest',
      sortOrder: sortOrder || 'desc',
      page,
      pageSize,
    };

    // 处理分类筛选
    if (category && category.trim()) {
      filters.category = category;
    }

    // 处理标签筛选
    if (tags && tags.trim()) {
      filters.tags = tags.split(',').map(t => t.trim()).filter(t => t);
    }

    const result = await searchAgents(query, filters);

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

// ==================== 分类管理 ====================

/**
 * 获取分类列表
 * GET /api/agent-market/search/categories
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const result = await getCategoryList();

    res.json({
      code: 200,
      message: '获取成功',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取分类列表失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 标签推荐 ====================

/**
 * 获取标签推荐
 * GET /api/agent-market/search/tags?category=xxx&limit=10
 */
router.get('/tags', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string;
    const limit = parseInt(req.query.limit as string) || 10;

    const options: any = { limit };

    if (category && category.trim()) {
      options.category = category;
    }

    const result = await getTagRecommendations(options);

    res.json({
      code: 200,
      message: '获取成功',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取标签推荐失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 热门标签 ====================

/**
 * 获取热门标签（所有 Agents 的热门标签）
 * GET /api/agent-market/search/popular-tags
 */
router.get('/popular-tags', async (req: Request, res: Response) => {
  try {
    const agents = await searchAgents('', {
      page: 1,
      pageSize: 1000, // 获取足够多的数据
    });

    const popularTags = getPopularTags(agents.results, 10);

    res.json({
      code: 200,
      message: '获取成功',
      data: {
        tags: popularTags,
      },
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取热门标签失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
