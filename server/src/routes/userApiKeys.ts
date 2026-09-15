import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  listUserApiKeys,
  addUserApiKey,
  deleteUserApiKey,
  setDefaultApiKey
} from '../services/userApiKey';

const router = Router();

// 获取用户的所有API Key
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const keys = await listUserApiKeys(req.userId!);
    res.json({ keys });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '获取API Key列表失败' });
  }
});

// 添加API Key
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { provider, name, apiKey, baseUrl, isDefault } = req.body;

    if (!provider || !name || !apiKey) {
      return res.status(400).json({ error: '提供商、名称和API Key不能为空' });
    }

    const key = await addUserApiKey(req.userId!, provider, name, apiKey, baseUrl, isDefault);
    res.json({ key, message: 'API Key添加成功' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || '添加API Key失败' });
  }
});

// 删除API Key
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const success = await deleteUserApiKey(req.userId!, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'API Key不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '删除失败' });
  }
});

// 设为默认
router.put('/:id/default', requireAuth, async (req: AuthRequest, res) => {
  try {
    const success = await setDefaultApiKey(req.userId!, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'API Key不存在' });
    }
    res.json({ message: '已设为默认' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '操作失败' });
  }
});

export default router;
