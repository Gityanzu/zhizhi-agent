import { Router, Response } from 'express';
import { createApiKey, listApiKeys, deleteApiKey } from '../services/apiKey';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// 列出 API Key（仅本人 + 存量无主）
router.get('/', async (req: AuthRequest, res: Response) => {
  const keys = await listApiKeys(req.userId);
  res.json({ keys });
});

// 创建 API Key（归属当前用户）
router.post('/', async (req: AuthRequest, res: Response) => {
  const name = (req.body && req.body.name) || '未命名';
  const { record, fullKey } = await createApiKey(String(name).slice(0, 100), req.userId);
  // fullKey 仅本次返回
  res.json({ ...record, key: fullKey });
});

// 删除 API Key（仅本人的，或存量无主的）
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existed = await deleteApiKey(req.params.id, req.userId);
  if (!existed) return res.status(404).json({ error: 'API Key 不存在' });
  res.json({ message: '已删除' });
});

export default router;
