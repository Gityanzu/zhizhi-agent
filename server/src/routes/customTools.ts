import { Router, Request, Response } from 'express';
import {
  createCustomTool,
  getCustomTool,
  getAllCustomTools,
  updateCustomTool,
  deleteCustomTool,
  executeCustomTool,
} from '../services/customTool';

const router = Router();

// 获取所有自定义工具
router.get('/', async (req: Request, res: Response) => {
  try {
    const tools = await getAllCustomTools();
    res.json({ tools });
  } catch (error) {
    res.status(500).json({ error: '获取工具列表失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 创建自定义工具
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, method, url, headers, paramsSchema, bodyTemplate } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: '工具名称和URL不能为空' });
    }
    const tool = await createCustomTool({ name, description, method, url, headers, paramsSchema, bodyTemplate });
    res.json(tool);
  } catch (error) {
    res.status(500).json({ error: '创建工具失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 获取单个工具详情
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tool = await getCustomTool(req.params.id);
    if (!tool) {
      return res.status(404).json({ error: '工具不存在' });
    }
    res.json(tool);
  } catch (error) {
    res.status(500).json({ error: '获取工具详情失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 更新工具
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, method, url, headers, paramsSchema, bodyTemplate } = req.body;
    const tool = await updateCustomTool(req.params.id, { name, description, method, url, headers, paramsSchema, bodyTemplate });
    if (!tool) {
      return res.status(404).json({ error: '工具不存在' });
    }
    res.json(tool);
  } catch (error) {
    res.status(500).json({ error: '更新工具失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 删除工具
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ok = await deleteCustomTool(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: '工具不存在' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '删除工具失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 测试执行工具
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const { args } = req.body;
    const tool = await getCustomTool(req.params.id);
    if (!tool) {
      return res.status(404).json({ error: '工具不存在' });
    }
    const result = await executeCustomTool(tool.name, args || {});
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: '测试执行失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
