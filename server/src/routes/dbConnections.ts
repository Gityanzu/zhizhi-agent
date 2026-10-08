import { Router, Response } from 'express';
import {
  createConnection,
  getAllConnections,
  updateConnection,
  deleteConnection,
  testConnection,
  getSchema,
  textToSQL,
  executeSQL,
} from '../services/dbQuery';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// 获取所有连接（不返回密码，仅本人 + 存量无主）
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const connections = await getAllConnections(req.userId);
    res.json({ connections });
  } catch (error) {
    res.status(500).json({ error: '获取连接列表失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 创建连接（归属当前用户）
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, host, port, database, username, password } = req.body;
    if (!name || !host || !database) {
      return res.status(400).json({ error: '名称、主机、数据库名不能为空' });
    }
    const conn = await createConnection({ name, type, host, port, database, username, password }, req.userId);
    res.json(conn);
  } catch (error) {
    res.status(500).json({ error: '创建连接失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 更新连接（仅本人 + 存量无主）
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, host, port, database, username, password } = req.body;
    const conn = await updateConnection(req.params.id, { name, type, host, port, database, username, password }, req.userId);
    if (!conn) return res.status(404).json({ error: '连接不存在' });
    res.json(conn);
  } catch (error) {
    res.status(500).json({ error: '更新连接失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 删除连接（仅本人 + 存量无主）
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const ok = await deleteConnection(req.params.id, req.userId);
    if (!ok) return res.status(404).json({ error: '连接不存在' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '删除连接失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 测试连接
router.post('/:id/test', async (req: AuthRequest, res: Response) => {
  try {
    const result = await testConnection(req.params.id, req.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '测试连接失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 获取表结构
router.get('/:id/schema', async (req: AuthRequest, res: Response) => {
  try {
    const schema = await getSchema(req.params.id, req.userId);
    res.json({ schema });
  } catch (error) {
    res.status(500).json({ error: '获取表结构失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

// 自然语言查询：生成 SQL + 执行
router.post('/:id/query', async (req: AuthRequest, res: Response) => {
  try {
    const { question, sql } = req.body;
    let finalSQL: string;
    if (sql) {
      finalSQL = sql;
    } else if (question) {
      finalSQL = await textToSQL(req.params.id, question, req.userId);
    } else {
      return res.status(400).json({ error: '必须提供 question 或 sql 参数' });
    }
    const result = await executeSQL(req.params.id, finalSQL, req.userId);
    res.json({ sql: finalSQL, ...result });
  } catch (error) {
    res.status(500).json({ error: '查询失败', detail: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
