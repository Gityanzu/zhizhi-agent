/**
 * mcpStore.ts — MCP（Model Context Protocol）连接器配置存储
 *
 * 职责：连接器配置的持久化与 CRUD（JSON 文件存储）。
 * 说明：本模块只管「连接器登记与探活」；把 MCP 工具桥接进 Agent 工具循环
 * 需要 MCP SDK / 子进程长连接，属于后续迭代（见 routes/mcp.ts 的 test 探活实现）。
 */
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { assertSafeUrl } from '../utils/ssrfGuard';

export interface McpServerConfig {
  id: string;
  name: string;
  /** stdio：本地子进程（桌面端可用）；http：远程 HTTP/SSE 端点 */
  transport: 'stdio' | 'http';
  /** stdio */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http */
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function storeFile(): string {
  const dir = process.env.ZHI_USER_DATA
    ? path.join(process.env.ZHI_USER_DATA, 'mcp')
    : path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  }
  return path.join(dir, 'mcp_servers.json');
}

let cache: McpServerConfig[] | null = null;

function load(): McpServerConfig[] {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(storeFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function save(list: McpServerConfig[]): void {
  cache = list;
  try {
    // 原子替换：先写临时文件再 rename，避免写一半被杀导致 JSON 损坏、配置全丢
    const file = storeFile();
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('[mcpStore] 写入失败:', e);
  }
}

export function listServers(): McpServerConfig[] {
  return load().slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export function getServer(id: string): McpServerConfig | undefined {
  return load().find((s) => s.id === id);
}

export function addServer(data: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>): McpServerConfig {
  const now = new Date().toISOString();
  const server: McpServerConfig = { ...data, id: uuidv4(), createdAt: now, updatedAt: now };
  const list = load();
  list.push(server);
  save(list);
  return server;
}

export function updateServer(id: string, patch: Partial<McpServerConfig>): McpServerConfig | undefined {
  const list = load();
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return undefined;
  const updated: McpServerConfig = { ...list[idx], ...patch, id, updatedAt: new Date().toISOString() };
  list[idx] = updated;
  save(list);
  return updated;
}

export function removeServer(id: string): boolean {
  const list = load();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  save(next);
  return true;
}

/**
 * 探活：
 *  - http：向端点发 MCP initialize（JSON-RPC）握手，5s 超时；2xx 且返回体含 serverInfo 视为在线。
 *  - stdio：校验命令是否在本机 PATH 中（仅桌面端有意义），Web 托管环境提示不可探活。
 */
export async function probeServer(server: McpServerConfig): Promise<{ ok: boolean; message: string }> {
  if (server.transport === 'http') {
    const url = (server.url || '').trim();
    if (!url) return { ok: false, message: '未配置 URL' };
    // 运行时 SSRF 校验（纵深防御）：配置可能在保存后因 DNS 变更指向内网
    const check = await assertSafeUrl(url);
    if (!check.ok) return { ok: false, message: `URL 不安全，已拒绝：${check.reason || ''}` };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', ...(server.headers || {}) },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'zhizhi-agent', version: '1.0.0' } } }),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      const text = await res.text();
      const ok = text.includes('serverInfo') || text.includes('result');
      return ok
        ? { ok: true, message: '连接成功（MCP initialize 握手通过）' }
        : { ok: false, message: '端点可达，但未返回 MCP initialize 结果' };
    } catch (e: any) {
      const reason = e?.name === 'AbortError' ? '连接超时（5s）' : e?.message || String(e);
      return { ok: false, message: `连接失败：${reason}` };
    } finally {
      clearTimeout(timer);
    }
  }

  // stdio
  const cmd = (server.command || '').trim();
  if (!cmd) return { ok: false, message: '未配置启动命令' };
  if (!config.isDesktop) {
    return { ok: false, message: 'stdio 连接器仅桌面端可用（本机子进程），Web 端无法探活' };
  }
  try {
    const { execFile } = await import('child_process');
    const which = process.platform === 'win32' ? 'where' : 'which';
    const found = await new Promise<boolean>((resolve) => {
      execFile(which, [cmd.split(/[\\/]/).pop() || cmd], (err) => resolve(!err));
    });
    return found
      ? { ok: true, message: `命令 ${cmd} 存在，桌面端启动时可通过 stdio 连接` }
      : { ok: false, message: `命令 ${cmd} 不在本机 PATH 中` };
  } catch (e: any) {
    return { ok: false, message: `探活失败：${e?.message || e}` };
  }
}

/** 当前部署形态下该连接器是否真正可用（用于 "+" 菜单里置灰） */
export function serverUsableHere(server: McpServerConfig): boolean {
  if (!server.enabled) return false;
  return server.transport === 'http' ? !!server.url : config.isDesktop;
}

export function usableServerCount(): number {
  return load().filter(serverUsableHere).length;
}
