import { Router, Request, Response } from 'express';
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  reviewTemplate,
  deleteTemplate,
  getTemplateCategories,
  getTemplateVersionHistory,
  getTemplateStats,
  downloadTemplate,
  favoriteTemplate,
  unfavoriteTemplate,
  getUserFavorites,
  getTemplateReports,
  reportTemplate,
  resolveTemplateReport,
} from '../services/templateMarket';
import type {
  CreateTemplateRequest,
  UpdateTemplateRequest,
  ReviewTemplateRequest,
  TemplateListParams,
  TemplateStats,
  DownloadRecord,
  TemplateFavorite,
  TemplateReport,
} from '../types/template';

const router = Router();

/**
 * 获取模板列表
 * GET /api/agent-market/templates
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const params: TemplateListParams = {
      query: req.query.query as string,
      category: req.query.category as string,
      type: req.query.type as any,
      status: req.query.status as any,
      authorId: req.query.authorId as string,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 10,
    };

    const result = await getTemplates(params);

    res.json({
      code: 200,
      message: '获取成功',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取模板列表失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取模板详情
 * GET /api/agent-market/templates/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const template = await getTemplate(id);

    if (!template) {
      return res.status(404).json({
        code: 404,
        message: '模板不存在',
      });
    }

    res.json({
      code: 200,
      message: '获取成功',
      data: template,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取模板详情失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 创建模板
 * POST /api/agent-market/templates
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const data: CreateTemplateRequest = req.body;

    // 验证数据
    if (!data.name || !data.title || !data.description || !data.systemPrompt) {
      return res.status(400).json({
        code: 400,
        message: '必填字段不能为空',
      });
    }

    const template = await createTemplate(
      data,
      req.userId,
      req.user?.name || '匿名用户'
    );

    res.status(201).json({
      code: 201,
      message: '创建成功',
      data: template,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '创建模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 更新模板
 * PUT /api/agent-market/templates/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: UpdateTemplateRequest = req.body;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const template = await updateTemplate(id, data, req.userId);

    res.json({
      code: 200,
      message: '更新成功',
      data: template,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '更新模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 删除模板
 * DELETE /api/agent-market/templates/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const result = await deleteTemplate(id, req.userId);

    if (!result) {
      return res.status(404).json({
        code: 404,
        message: '模板不存在',
      });
    }

    res.json({
      code: 200,
      message: '删除成功',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '删除模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 审核模板
 * POST /api/agent-market/templates/:id/review
 */
router.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: ReviewTemplateRequest = req.body;

    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限执行此操作',
      });
    }

    const template = await reviewTemplate(id, data, req.userId);

    res.json({
      code: 200,
      message: '审核成功',
      data: template,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '审核模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取模板分类列表
 * GET /api/agent-market/templates/categories
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await getTemplateCategories();

    res.json({
      code: 200,
      message: '获取成功',
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取分类列表失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取模板版本历史
 * GET /api/agent-market/templates/:id/versions
 */
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const versionHistory = await getTemplateVersionHistory(id);

    if (!versionHistory) {
      return res.status(404).json({
        code: 404,
        message: '模板不存在',
      });
    }

    res.json({
      code: 200,
      message: '获取成功',
      data: versionHistory,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取版本历史失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取模板统计信息
 * GET /api/agent-market/templates/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats: TemplateStats = await getTemplateStats();

    res.json({
      code: 200,
      message: '获取成功',
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取统计信息失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 下载模板
 * POST /api/agent-market/templates/:id/download
 */
router.post('/:id/download', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const result = await downloadTemplate(id, req.userId, version);

    // 返回下载信息
    res.json({
      code: 200,
      message: '生成下载链接成功',
      data: {
        downloadUrl: result.downloadUrl,
        record: result.record,
      },
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '下载模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 收藏模板
 * POST /api/agent-market/templates/:id/favorite
 */
router.post('/:id/favorite', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const favorite = await favoriteTemplate(id, req.userId);

    res.json({
      code: 200,
      message: '收藏成功',
      data: favorite,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '收藏模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 取消收藏模板
 * DELETE /api/agent-market/templates/:id/favorite
 */
router.delete('/:id/favorite', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    await unfavoriteTemplate(id, req.userId);

    res.json({
      code: 200,
      message: '取消收藏成功',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '取消收藏失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取用户收藏的模板
 * GET /api/agent-market/templates/favorites
 */
router.get('/favorites', async (req: Request, res: Response) => {
  try {
    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const favorites = await getUserFavorites(req.userId);

    res.json({
      code: 200,
      message: '获取成功',
      data: favorites,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取收藏模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 提交模板报告
 * POST /api/agent-market/templates/:id/report
 */
router.post('/:id/report', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, description } = req.body;

    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    if (!reason || !description) {
      return res.status(400).json({
        code: 400,
        message: '举报理由和描述不能为空',
      });
    }

    const report = await reportTemplate(
      id,
      req.userId,
      reason,
      description
    );

    res.status(201).json({
      code: 201,
      message: '举报成功',
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '举报模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取模板报告列表
 * GET /api/agent-market/templates/reports
 */
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as TemplateReport['status'];

    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限访问',
      });
    }

    const reports = await getTemplateReports(status);

    res.json({
      code: 200,
      message: '获取成功',
      data: reports,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取报告列表失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 处理模板报告
 * POST /api/agent-market/templates/reports/:id/resolve
 */
router.post('/reports/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution, status } = req.body;

    // 需要管理员权限
    if (!req.userId || req.user?.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限执行此操作',
      });
    }

    if (!resolution || !status) {
      return res.status(400).json({
        code: 400,
        message: '处理结果和状态不能为空',
      });
    }

    const report = await resolveTemplateReport(
      id,
      req.userId,
      resolution,
      status
    );

    res.json({
      code: 200,
      message: '处理成功',
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '处理报告失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 导出模板为文件
 * GET /api/agent-market/templates/:id/export
 */
router.get('/:id/export', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    const template = await getTemplate(id);

    if (!template) {
      return res.status(404).json({
        code: 404,
        message: '模板不存在',
      });
    }

    // 准备导出数据
    const exportData = {
      id: template.id,
      name: template.name,
      title: template.title,
      description: template.description,
      systemPrompt: template.systemPrompt,
      model: template.model,
      tools: template.tools,
      temperature: template.temperature,
      category: template.category,
      tags: template.tags,
      type: template.type,
      version: template.version,
      features: template.features,
      screenshots: template.screenshots,
      demoUrl: template.demoUrl,
      documentation: template.documentation,
      license: template.license,
      author: template.author,
      exportedAt: new Date().toISOString(),
    };

    // 设置响应头
    const filename = `${template.name}-${template.version}.${format}`;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(exportData);
    } else {
      // 可以支持其他格式，如 YAML、XML 等
      res.status(400).json({
        code: 400,
        message: '不支持的导出格式',
      });
    }
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '导出模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 导入模板
 * POST /api/agent-market/templates/import
 */
router.post('/import', async (req: Request, res: Response) => {
  try {
    // 需要登录
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '请先登录',
      });
    }

    const importData = req.body;

    // 基本验证
    if (!importData.name || !importData.systemPrompt) {
      return res.status(400).json({
        code: 400,
        message: '导入数据缺少必要字段',
      });
    }

    // 创建模板
    const template = await createTemplate(
      {
        name: importData.name,
        title: importData.title || importData.name,
        description: importData.description || '',
        systemPrompt: importData.systemPrompt,
        model: importData.model || 'gpt-4',
        tools: importData.tools || [],
        temperature: importData.temperature || 0.7,
        category: importData.category || '其他',
        tags: importData.tags || [],
        type: 'private',
        features: importData.features || [],
        screenshots: importData.screenshots || [],
        demoUrl: importData.demoUrl,
        documentation: importData.documentation,
        license: importData.license || 'MIT',
      },
      req.userId,
      req.user?.name || '匿名用户'
    );

    res.status(201).json({
      code: 201,
      message: '导入成功',
      data: template,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '导入模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;