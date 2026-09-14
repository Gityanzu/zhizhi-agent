import { Router } from 'express';
import { getSettings, updateProfile, updatePreferences, addLLMKey, deleteLLMKey, exportAllData, importAllData } from '../services/userSettings';

const router = Router();

// 获取用户设置
router.get('/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: '获取设置失败' });
  }
});

// 更新用户资料
router.put('/settings/profile', async (req, res) => {
  try {
    const { nickname, role, avatar } = req.body;
    const profile = await updateProfile({ nickname, role, avatar });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: '更新资料失败' });
  }
});

// 更新偏好设置
router.put('/settings/preferences', async (req, res) => {
  try {
    const preferences = await updatePreferences(req.body);
    res.json(preferences);
  } catch (error) {
    res.status(500).json({ error: '更新偏好失败' });
  }
});

// 获取API Key列表
router.get('/settings/api-keys', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings.llmKeys);
  } catch (error) {
    res.status(500).json({ error: '获取API Key失败' });
  }
});

// 添加API Key
router.post('/settings/api-keys', async (req, res) => {
  try {
    const { provider, name, key } = req.body;
    if (!provider || !name || !key) {
      return res.status(400).json({ error: 'provider, name, key 为必填项' });
    }
    const result = await addLLMKey(provider, name, key);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '添加API Key失败' });
  }
});

// 删除API Key
router.delete('/settings/api-keys/:id', async (req, res) => {
  try {
    await deleteLLMKey(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '删除API Key失败' });
  }
});

// 导出所有数据
router.get('/export', async (req, res) => {
  try {
    const data = await exportAllData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=zhizhi-backup-${new Date().toISOString().split('T')[0]}.json`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: '导出失败' });
  }
});

// 导入数据
router.post('/import', async (req, res) => {
  try {
    const result = await importAllData(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '导入失败' });
  }
});

export default router;
