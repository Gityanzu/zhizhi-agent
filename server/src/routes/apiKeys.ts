import { Router, Request, Response } from 'express';
import { createApiKey, listApiKeys, deleteApiKey } from '../services/apiKey';

const router = Router();

// 列出 API Key
router.get('/', async (req: Request, res: Response) => {
  const keys = await listApiKeys();
  res.json({ keys });
});

// 创建 API Key
router.post('/', async (req: Request, res: Response) => {
  const name = (req.body && req.body.name) || '未命名';
  const { record, fullKey } = await createApiKey(String(name).slice(0, 100));
  // fullKey 仅本次返回
  res.json({ ...record, key: fullKey });
});

// 删除 API Key
router.delete('/:id', async (req: Request, res: Response) => {
  const existed = await deleteApiKey(req.params.id);
  if (!existed) return res.status(404).json({ error: 'API Key 不存在' });
  res.json({ message: '已删除' });
});

export default router;
