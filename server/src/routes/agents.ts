import { Router, Request, Response } from 'express';
import {
  createAgent,
  getAgent,
  getAllAgents,
  updateAgent,
  deleteAgent,
} from '../services/customAgent';

const router = Router();

// 获取所有自定义Agent
router.get('/', async (req: Request, res: Response) => {
  try {
    const agents = await getAllAgents();
    res.json({ agents });
  } catch (error) {
    res.status(500).json({ error: '获取Agent列表失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 创建自定义Agent
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, avatar, description, systemPrompt, model, tools, temperature } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Agent名称不能为空' });
    }
    const agent = await createAgent({ name, avatar, description, systemPrompt, model, tools, temperature });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: '创建Agent失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 获取单个Agent详情
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const agent = await getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent不存在' });
    }
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: '获取Agent详情失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 更新Agent
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, avatar, description, systemPrompt, model, tools, temperature } = req.body;
    const agent = await updateAgent(req.params.id, { name, avatar, description, systemPrompt, model, tools, temperature });
    if (!agent) {
      return res.status(404).json({ error: 'Agent不存在' });
    }
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: '更新Agent失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 删除Agent
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ok = await deleteAgent(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Agent不存在' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '删除Agent失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
