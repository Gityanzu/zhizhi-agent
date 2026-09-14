import { Router, Request, Response } from 'express';
import multer from 'multer';
import { importChatGPTConversations, importClaudeConversations } from '../services/importData';

const router = Router();

// 内存存储（JSON 导出文件通常不大，直接读入解析）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function parseJsonBuffer(buf: Buffer): any {
  return JSON.parse(buf.toString('utf-8'));
}

// POST /api/import/chatgpt  —— 上传 ChatGPT 导出 JSON
router.post('/chatgpt', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传 JSON 文件（字段名 file）' });
    }
    let jsonData: any;
    try {
      jsonData = parseJsonBuffer(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: 'JSON 解析失败：' + (e instanceof Error ? e.message : String(e)) });
    }
    const result = await importChatGPTConversations(jsonData);
    res.json({ source: 'chatgpt', ...result });
  } catch (e) {
    console.error('ChatGPT 导入失败:', e);
    res.status(500).json({ error: '导入失败：' + (e instanceof Error ? e.message : String(e)) });
  }
});

// POST /api/import/claude  —— 上传 Claude 导出 JSON
router.post('/claude', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传 JSON 文件（字段名 file）' });
    }
    let jsonData: any;
    try {
      jsonData = parseJsonBuffer(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: 'JSON 解析失败：' + (e instanceof Error ? e.message : String(e)) });
    }
    const result = await importClaudeConversations(jsonData);
    res.json({ source: 'claude', ...result });
  } catch (e) {
    console.error('Claude 导入失败:', e);
    res.status(500).json({ error: '导入失败：' + (e instanceof Error ? e.message : String(e)) });
  }
});

export default router;
