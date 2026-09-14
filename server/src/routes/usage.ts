import { Router, Request, Response } from 'express';
import { getSessionUsage, getGlobalUsage } from '../services/usage';

const router = Router();

// 获取全局用量统计
router.get('/', async (req: Request, res: Response) => {
  try {
    const usage = await getGlobalUsage();
    res.json(usage);
  } catch (error) {
    console.error('获取全局用量统计失败:', error);
    res.status(500).json({ error: '获取用量统计失败' });
  }
});

// 获取指定会话的用量统计
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const usage = await getSessionUsage(sessionId);
    res.json(usage);
  } catch (error) {
    console.error('获取会话用量统计失败:', error);
    res.status(500).json({ error: '获取会话用量统计失败' });
  }
});

export default router;
