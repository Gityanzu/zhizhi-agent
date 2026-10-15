import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { assertSafeUrl } from '../utils/ssrfGuard';
import {
  listServers, getServer, addServer, updateServer, removeServer, probeServer,
  type McpServerConfig,
} from '../services/mcpStore';
import { listToolsForServer } from '../services/mcpBridge';

/** http 连接器 URL 的 SSRF 校验：拒绝内网/回环/元数据地址，防服务端请求伪造 */
async function guardUrl(url: unknown): Promise<string | null> {
  const check = await assertSafeUrl(String(url ?? ''));
  return check.ok ? null : check.reason || 'URL 不安全';
}

const router = Router();
router.use(requireAuth);

function sanitize(s: McpServerConfig) {
  const { env, headers, ...rest } = s;
  return { ...rest, hasEnv: !!env && Object.keys(env).length > 0, hasHeaders: !!headers && Object.keys(headers).length > 0 };
}

router.get('/servers', (_req: Request, res: Response) => {
  res.json({ servers: listServers().map(sanitize) });
});

router.post('/servers', async (req: Request, res: Response) => {
  const { name, transport, command, args, env, url, headers, enabled } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '缺少 name' });
  if (transport !== 'stdio' && transport !== 'http') return res.status(400).json({ error: 'transport 必须为 stdio 或 http' });
  if (transport === 'http' && !url) return res.status(400).json({ error: 'http 连接器必须配置 url' });
  if (transport === 'http') {
    const urlErr = await guardUrl(url);
    if (urlErr) return res.status(400).json({ error: urlErr });
  }
  if (transport === 'stdio' && !command) return res.status(400).json({ error: 'stdio 连接器必须配置 command' });
  const server = addServer({
    name: String(name).trim(),
    transport,
    command: command ? String(command) : undefined,
    args: Array.isArray(args) ? args.map(String) : undefined,
    env: env && typeof env === 'object' ? env : undefined,
    url: url ? String(url) : undefined,
    headers: headers && typeof headers === 'object' ? headers : undefined,
    enabled: enabled !== false,
  });
  res.json({ server: sanitize(server) });
});

router.put('/servers/:id', async (req: Request, res: Response) => {
  const patch: Partial<McpServerConfig> = {};
  const b = req.body || {};
  for (const key of ['name', 'transport', 'command', 'args', 'env', 'url', 'headers', 'enabled'] as const) {
    if (key in b) (patch as any)[key] = b[key];
  }
  if (patch.url) {
    const urlErr = await guardUrl(patch.url);
    if (urlErr) return res.status(400).json({ error: urlErr });
  }
  const server = updateServer(req.params.id, patch);
  if (!server) return res.status(404).json({ error: '连接器不存在' });
  res.json({ server: sanitize(server) });
});

router.delete('/servers/:id', (req: Request, res: Response) => {
  const ok = removeServer(req.params.id);
  if (!ok) return res.status(404).json({ error: '连接器不存在' });
  res.json({ success: true });
});

router.post('/servers/:id/test', async (req: Request, res: Response) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: '连接器不存在' });
  const result = await probeServer(server);
  res.json(result);
});

// 查看连接器暴露的 MCP 工具（tools/list，60s 缓存）
router.get('/servers/:id/tools', async (req: Request, res: Response) => {
  try {
    const tools = await listToolsForServer(req.params.id);
    res.json({
      tools: tools.map((t) => ({
        remoteName: t.remoteName,
        bridgeName: t.toolName,
        description: t.description,
      })),
    });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
