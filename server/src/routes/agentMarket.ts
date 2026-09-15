import { Router, Request, Response } from 'express';
import {
  exportAgent,
  exportAgentFile,
  importAgentFromJson,
  importAgentFromFile,
  getTemplates,
  getTemplate,
  uploadTemplate,
  downloadTemplate,
  deleteTemplate,
  getCategories,
  validateAgentImport,
  type AgentImport,
} from '../services/agentMarket';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ==================== Agent 导入导出 ====================

/**
 * 导出 Agent 为 JSON 格式
 * POST /api/agent-market/export/:id
 */
router.post('/export/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: 'Agent ID 不能为空',
      });
    }

    const exportData = await exportAgent(id);
    res.json({
      code: 200,
      message: '导出成功',
      data: exportData,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '导出失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 导出 Agent 为文件
 * POST /api/agent-market/export/:id/file
 */
router.post('/export/:id/file', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: 'Agent ID 不能为空',
      });
    }

    const { content, filename, filepath } = await exportAgentFile(id);

    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('文件下载失败:', err);
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '导出失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 从 JSON 导入 Agent
 * POST /api/agent-market/import
 */
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { name, avatar, description, systemPrompt, model, tools, temperature } =
      req.body;

    const importData: AgentImport = {
      name,
      avatar,
      description,
      systemPrompt,
      model,
      tools,
      temperature,
    };

    // 验证数据
    const validation = validateAgentImport(importData);
    if (!validation.valid) {
      return res.status(400).json({
        code: 400,
        message: '数据验证失败',
        errors: validation.errors,
      });
    }

    const agent = await importAgentFromJson(JSON.stringify(importData));
    res.json({
      code: 200,
      message: '导入成功',
      data: agent,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '导入失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 从文件导入 Agent
 * POST /api/agent-market/import/file
 */
router.post('/import/file', async (req: Request, res: Response) => {
  try {
    const { file } = req;

    if (!file) {
      return res.status(400).json({
        code: 400,
        message: '请上传文件',
      });
    }

    const agent = await importAgentFromFile(file.path);
    res.json({
      code: 200,
      message: '导入成功',
      data: agent,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '导入失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 模板管理 ====================

/**
 * 获取模板列表
 * GET /api/agent-market/templates?page=1&pageSize=10&category=xxx&search=xxx
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const category = req.query.category as string;
    const search = req.query.search as string;

    const result = await getTemplates(page, pageSize, category, search);

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
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '模板 ID 不能为空',
      });
    }

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
 * 上传模板（管理员功能）
 * POST /api/agent-market/templates
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const {
      name,
      avatar,
      description,
      systemPrompt,
      model,
      tools,
      temperature,
      category,
      tags,
    } = req.body;

    // 验证必填字段
    if (!name) {
      return res.status(400).json({
        code: 400,
        message: '模板名称不能为空',
      });
    }

    const template = await uploadTemplate({
      name,
      avatar,
      description,
      systemPrompt,
      model,
      tools,
      temperature,
      category,
      tags,
    });

    res.json({
      code: 200,
      message: '上传成功',
      data: template,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '上传模板失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 下载模板
 * GET /api/agent-market/templates/:id/download
 */
router.get('/templates/:id/download', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '模板 ID 不能为空',
      });
    }

    const downloadData = await downloadTemplate(id);

    res.json({
      code: 200,
      message: '下载成功',
      data: downloadData,
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
 * 删除模板
 * DELETE /api/agent-market/templates/:id
 */
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '模板 ID 不能为空',
      });
    }

    const result = await deleteTemplate(id);
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

// ==================== 分类相关 ====================

/**
 * 获取所有分类
 * GET /api/agent-market/categories
 */
router.get('/categories', (req: Request, res: Response) => {
  try {
    const categories = getCategories();

    res.json({
      code: 200,
      message: '获取成功',
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取分类失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
