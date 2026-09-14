import { Router, Request, Response } from 'express';
import {
  createWorkflow,
  getWorkflow,
  getAllWorkflows,
  updateWorkflow,
  deleteWorkflow,
  executeWorkflow,
} from '../services/workflow';

const router = Router();

// 获取所有工作流
router.get('/', async (req: Request, res: Response) => {
  try {
    const workflows = await getAllWorkflows();
    res.json({ workflows });
  } catch (error) {
    res.status(500).json({ error: '获取工作流列表失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 创建工作流
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, nodes, edges } = req.body;
    if (!name) {
      return res.status(400).json({ error: '工作流名称不能为空' });
    }
    const wf = await createWorkflow({ name, description, nodes, edges });
    res.json(wf);
  } catch (error) {
    res.status(500).json({ error: '创建工作流失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 获取单个工作流
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const wf = await getWorkflow(req.params.id);
    if (!wf) return res.status(404).json({ error: '工作流不存在' });
    res.json(wf);
  } catch (error) {
    res.status(500).json({ error: '获取工作流详情失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 更新工作流
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, nodes, edges } = req.body;
    const wf = await updateWorkflow(req.params.id, { name, description, nodes, edges });
    if (!wf) return res.status(404).json({ error: '工作流不存在' });
    res.json(wf);
  } catch (error) {
    res.status(500).json({ error: '更新工作流失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 删除工作流
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ok = await deleteWorkflow(req.params.id);
    if (!ok) return res.status(404).json({ error: '工作流不存在' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '删除工作流失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 执行工作流
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const { inputVariables } = req.body;
    const result = await executeWorkflow(req.params.id, inputVariables || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '执行工作流失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
