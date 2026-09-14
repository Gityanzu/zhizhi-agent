import { Router, Request, Response } from 'express';
import { getObservabilityStats } from '../services/usage';

const router = Router();

// 获取可观测性统计数据
router.get('/observability', async (req: Request, res: Response) => {
  try {
    const stats = await getObservabilityStats();
    res.json(stats);
  } catch (error) {
    console.error('获取可观测性统计失败:', error);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

export default router;
