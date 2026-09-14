import { Router, Request, Response } from 'express';
import {
  getAllTemplates,
  getActiveTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  activateTemplate,
} from '../services/prompt';

const router = Router();

// 获取所有模板
router.get('/', async (req: Request, res: Response) => {
  try {
    const templates = await getAllTemplates();
    res.json({ templates });
  } catch (error) {
    console.error('获取模板失败:', error);
    res.status(500).json({ error: '获取模板失败' });
  }
});

// 获取当前激活的模板
router.get('/active', async (req: Request, res: Response) => {
  try {
    const template = await getActiveTemplate();
    res.json({ template });
  } catch (error) {
    console.error('获取激活模板失败:', error);
    res.status(500).json({ error: '获取激活模板失败' });
  }
});

// 创建模板
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, content } = req.body;
    if (!name || !content) {
      return res.status(400).json({ error: '名称和内容不能为空' });
    }
    const template = await createTemplate(name, description || '', content);
    res.json({ template });
  } catch (error) {
    console.error('创建模板失败:', error);
    res.status(500).json({ error: '创建模板失败' });
  }
});

// 更新模板
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, content } = req.body;
    const success = await updateTemplate(id, name, description || '', content);
    res.json({ success });
  } catch (error) {
    console.error('更新模板失败:', error);
    res.status(500).json({ error: '更新模板失败' });
  }
});

// 删除模板
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await deleteTemplate(id);
    res.json({ success });
  } catch (error) {
    console.error('删除模板失败:', error);
    res.status(500).json({ error: '删除模板失败' });
  }
});

// 激活模板
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await activateTemplate(id);
    res.json({ success });
  } catch (error) {
    console.error('激活模板失败:', error);
    res.status(500).json({ error: '激活模板失败' });
  }
});

export default router;
