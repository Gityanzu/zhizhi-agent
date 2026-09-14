import { Router, Request, Response } from 'express';
import { executeCode } from '../services/codeExecutor';

const router = Router();

// 直接执行代码接口（供前端代码块"运行"按钮使用）
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { code, language } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: '代码内容不能为空' });
    }
    const lang = (language === 'javascript' || language === 'js') ? 'javascript' : 'python';
    const result = await executeCode(code, lang);
    res.json(result);
  } catch (error) {
    console.error('代码执行失败:', error);
    res.status(500).json({
      error: '代码执行失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
