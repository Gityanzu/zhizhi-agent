import { Router, Request, Response } from 'express';
import { getAllMemories, deleteMemory, clearAllMemories, extractMemories } from '../services/memory';

const router = Router();

// 获取所有记忆
router.get('/', async (req: Request, res: Response) => {
  try {
    const memories = await getAllMemories();
    res.json({ memories });
  } catch (error) {
    console.error('获取记忆失败:', error);
    res.status(500).json({ error: '获取记忆失败' });
  }
});

// 删除记忆
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await deleteMemory(id);
    res.json({ success });
  } catch (error) {
    console.error('删除记忆失败:', error);
    res.status(500).json({ error: '删除记忆失败' });
  }
});

// 清空所有记忆
router.post('/clear', async (req: Request, res: Response) => {
  try {
    const success = await clearAllMemories();
    res.json({ success });
  } catch (error) {
    console.error('清空记忆失败:', error);
    res.status(500).json({ error: '清空记忆失败' });
  }
});

// 手动触发记忆提取（测试用）
router.post('/extract', async (req: Request, res: Response) => {
  try {
    const { messages, sessionId } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages 参数必须是数组' });
    }
    const memories = await extractMemories(messages, sessionId);
    res.json({ memories, count: memories.length });
  } catch (error) {
    console.error('提取记忆失败:', error);
    res.status(500).json({ error: '提取记忆失败' });
  }
});

export default router;
