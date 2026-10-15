/**
 * mcpBridge.ts — MCP 工具桥接
 *
 * 把已启用 MCP 连接器暴露的 tools 桥接进 Agent 工具循环：
 *   listMcpTools() → 生成 ToolDefinition（工具名 mcp_<server>_<tool>）
 *   executeMcpTool(name, args) → 转发 tools/call 到对应连接器
 *
 * 协议实现（零依赖）：
 *   - stdio：本机子进程，换行分隔 JSON-RPC（MCP stdio 传输规范）
 *   - http：Streamable HTTP（POST JSON-RPC，mcp-session-id 会话头；响应兼容 JSON 与 SSE）
 */
import { spawn } from 'child_process';
import { getServer, listServers, type McpServerConfig } from './mcpStore';
import { assertSafeUrl } from '../utils/ssrfGuard';

const PROTOCOL_VERSION = '2024-11-05';
const CLIENT_INFO = { name: 'zhizhi-agent', version: '1.0.0' };
const RPC_TIMEOUT_MS = 15000;
const TOOLS_CACHE_TTL_MS = 60_000;

type JsonRpcResponse = { jsonrpc: '2.0'; id?: number | string; result?: any; error?: { code: number; message: string } };

/* ==================== 通用 JSON-RPC 辅助 ==================== */

function rpcRequest(method: string, params?: any) {
  return { jsonrpc: '2.0' as const, id: Math.floor(Math.random() * 1e9), method, params: params ?? {} };
}

/** 从响应体解析 JSON-RPC（兼容纯 JSON 与 SSE：逐行找 data: 载荷） */
function parseRpcPayload(text: string): JsonRpcResponse | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
    } catch { /* fallthrough */ }
  }
  const dataLines = trimmed.split('\n').filter((l) => l.startsWith('data:'));
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(dataLines[i].slice(5).trim());
      if (parsed && (parsed.result || parsed.error)) return parsed;
    } catch { /* 下一行 */ }
  }
  return null;
}

/* ==================== stdio 客户端 ==================== */

function rpcOverStdio(server: McpServerConfig, messages: any[]): Promise<JsonRpcResponse[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(server.command!, server.args || [], {
      env: { ...process.env, ...(server.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const pending = new Map<number, (r: JsonRpcResponse) => void>();
    const responsesById = new Map<number, JsonRpcResponse>();
    const requestIds = messages.filter((m) => m.id !== undefined).map((m) => m.id as number);
    let buffer = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`stdio 连接超时（${RPC_TIMEOUT_MS}ms）：${stderr.slice(0, 200)}`));
    }, RPC_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) {
            const cb = pending.get(msg.id)!;
            pending.delete(msg.id);
            cb(msg);
          }
        } catch { /* 忽略非 JSON 行（日志等） */ }
      }
    });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });

    child.stdin.on('error', () => { /* 进程提前退出时 EPIPE，交给 timeout/exit 处理 */ });

    let chain: Promise<void> = Promise.resolve();
    for (const m of messages) {
      chain = chain.then(() => new Promise<void>((res) => {
        if (m.id !== undefined) {
          pending.set(m.id, (r) => { responsesById.set(m.id as number, r); res(); });
        }
        child.stdin.write(JSON.stringify(m) + '\n', () => {
          if (m.id === undefined) setTimeout(res, 50); // 通知给对端一点处理时间
        });
      }));
    }

    chain.then(() => {
      child.kill();
      clearTimeout(timer);
      // 按请求顺序归位响应：JSON-RPC 允许乱序返回，不能依赖 push 顺序
      resolve(requestIds.map((id) => responsesById.get(id)).filter((r): r is JsonRpcResponse => !!r));
    }).catch((e) => { clearTimeout(timer); child.kill(); reject(e); });

    // 全部请求完成后保底退出（有的服务器不自动退出）
    setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, RPC_TIMEOUT_MS + 1000);
  });
}

/* ==================== http 客户端 ==================== */

async function rpcOverHttp(server: McpServerConfig, messages: any[]): Promise<JsonRpcResponse[]> {
  const url = (server.url || '').trim();
  // 运行时 SSRF 校验（纵深防御）：Agent 工具调用链路同样不得访问内网/元数据地址
  const check = await assertSafeUrl(url);
  if (!check.ok) throw new Error(`URL 不安全，已拒绝：${check.reason || ''}`);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    ...(server.headers || {}),
  };
  const out: JsonRpcResponse[] = [];
  let sessionId = '';

  for (const m of messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: sessionId ? { ...headers, 'mcp-session-id': sessionId } : headers,
        body: JSON.stringify(m),
        signal: controller.signal,
      });
      const sid = res.headers.get('mcp-session-id');
      if (sid) sessionId = sid;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseRpcPayload(text);
      // 202/空体（纯通知）不算错误
      if (parsed) out.push(parsed);
      if (parsed?.error) throw new Error(`MCP 错误 ${parsed.error.code}: ${parsed.error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

/* ==================== 会话握手 + 调用 ==================== */

async function withSession<T>(
  server: McpServerConfig,
  afterInit: (send: (msg: any) => Promise<JsonRpcResponse | undefined>) => Promise<T>
): Promise<T> {
  const send = async (msgs: any[]): Promise<JsonRpcResponse[]> => {
    return server.transport === 'http' ? rpcOverHttp(server, msgs) : rpcOverStdio(server, msgs);
  };

  const initRes = await send([rpcRequest('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  })]);
  const init = initRes[0];
  if (init?.error) throw new Error(`MCP initialize 失败: ${init.error.message}`);

  await send([{ jsonrpc: '2.0' as const, method: 'notifications/initialized' }]);

  return afterInit(async (msg) => {
    const res = await send([msg]);
    return res[0];
  });
}

/* ==================== 工具枚举与桥接 ==================== */

export interface BridgedTool {
  /** Agent 工具循环中使用的名字（mcp_ 前缀 + 规范化，≤64 字符） */
  toolName: string;
  serverId: string;
  serverName: string;
  /** MCP 服务器侧的原始工具名 */
  remoteName: string;
  description: string;
  inputSchema: any;
}

function sanitizeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
}

const toolsCache = new Map<string, { at: number; tools: BridgedTool[] }>();
/** toolName → 桥接信息索引（executeMcpTool 用） */
const toolIndex = new Map<string, BridgedTool>();

async function listToolsOfServer(server: McpServerConfig): Promise<BridgedTool[]> {
  const cached = toolsCache.get(server.id);
  if (cached && Date.now() - cached.at < TOOLS_CACHE_TTL_MS) return cached.tools;

  const tools = await withSession(server, async (send) => {
    const res = await send(rpcRequest('tools/list', {}));
    if (res?.error) throw new Error(`tools/list 失败: ${res.error.message}`);
    const raw = res?.result?.tools || [];
    const prefix = sanitizeName(server.name);
    return (raw as any[]).map((t) => ({
      toolName: `mcp_${prefix}_${sanitizeName(t.name)}`.slice(0, 64),
      serverId: server.id,
      serverName: server.name,
      remoteName: t.name,
      description: `[MCP·${server.name}] ${t.description || t.name}`,
      inputSchema: t.inputSchema && t.inputSchema.type === 'object'
        ? t.inputSchema
        : { type: 'object', properties: {}, required: [] },
    }));
  });

  toolsCache.set(server.id, { at: Date.now(), tools });
  return tools;
}

/** 枚举全部可用连接器的工具（仅 enabled 且当前部署可用的），同时刷新 toolIndex */
export async function listMcpTools(): Promise<BridgedTool[]> {
  const servers = listServers().filter((s) => s.enabled && (s.transport === 'http' ? s.url : !!s.command));
  const all: BridgedTool[] = [];
  for (const s of servers) {
    try {
      all.push(...(await listToolsOfServer(s)));
    } catch (e: any) {
      console.warn(`[mcpBridge] 枚举连接器 ${s.name} 工具失败:`, e?.message || e);
    }
  }
  toolIndex.clear();
  for (const t of all) toolIndex.set(t.toolName, t);
  return all;
}

/** 查看单个连接器暴露的工具（管理页"查看工具"用） */
export async function listToolsForServer(serverId: string): Promise<BridgedTool[]> {
  const server = getServer(serverId);
  if (!server) throw new Error('连接器不存在');
  return listToolsOfServer(server);
}

export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp_') && toolIndex.has(toolName);
}

/** 转发 tools/call；result.content（text 块）拼接为字符串返回给模型 */
export async function executeMcpTool(toolName: string, args: Record<string, any>): Promise<string> {
  let entry = toolIndex.get(toolName);
  if (!entry) {
    await listMcpTools();
    entry = toolIndex.get(toolName);
  }
  if (!entry) return `未找到 MCP 工具: ${toolName}（连接器可能已停用或不可用）`;

  const server = getServer(entry.serverId);
  if (!server) return `MCP 连接器不存在: ${entry.serverName}`;

  try {
    const res = await withSession(server, async (send) =>
      send(rpcRequest('tools/call', { name: entry!.remoteName, arguments: args ?? {} }))
    );
    if (res?.error) return `MCP 工具调用失败: ${res.error.message}`;
    const content = res?.result?.content;
    if (Array.isArray(content) && content.length) {
      return content
        .map((c: any) => (c.type === 'text' ? c.text : `[${c.type} 内容已省略]`))
        .join('\n');
    }
    if (res?.result?.isError) return 'MCP 工具执行出错（服务器返回 isError）';
    return '（MCP 工具执行完成，无文本输出）';
  } catch (e: any) {
    return `MCP 工具调用异常：${e?.message || e}`;
  }
}
