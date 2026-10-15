/**
 * agentOutput.ts — Agent 文件工具输出根目录的运行时解析
 *
 * 解析优先级：
 *   1. 请求级目录（runWithAgentOutputDir，按用户/按会话隔离，跟随本次异步调用链）
 *   2. 全局覆盖（启动时从持久化设置恢复，作为未登录/无上下文的兜底默认）
 *   3. config.agent.outputDir（ZHI_AGENT_OUTPUT_DIR / ZHI_USER_DATA/outputs / 仓库内 agent_output）
 * 这样既支持 Electron 托管后端把产物落到用户本机目录，也让 Web 端维持仓库内沙箱默认值。
 */
import * as fs from 'fs';
import * as path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config';
import { getSessionInfo } from './session';

// 请求级输出目录必须跟随「本次异步调用链」：请求与后台任务是并发执行的，
// 只用一个模块级变量会被别人覆盖（A 设了目录，B 的产物也落到 A 那里）。
// 安全性质：上下文缺失时只会「读不到」→ 回退全局默认，绝不会读到别人的目录。
const outputDirStore = new AsyncLocalStorage<string | undefined>();

let runtimeOverride: string | null = null;

function normalize(dir?: string | null): string | undefined {
  return dir && dir.trim() ? path.resolve(dir.trim()) : undefined;
}

/** 在本次调用链内指定输出目录；入口处包一层，链内部（含后台任务）即可拿到隔离的值 */
export function runWithAgentOutputDir<T>(dir: string | undefined, fn: () => T): T {
  return outputDirStore.run(normalize(dir), fn);
}

/** 设置/清除运行时输出目录覆盖（dir 为空表示回退到 config 默认） */
export function setAgentOutputDir(dir?: string | null): void {
  const resolved = normalize(dir) ?? null;
  if (resolved && !fs.existsSync(resolved)) {
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch (e) {
      console.warn('[agentOutput] 创建覆盖目录失败:', e);
    }
  }
  runtimeOverride = resolved;
}

/** 当前生效的 Agent 输出总目录（用户配置/请求级/全局覆盖） */
export function getAgentOutputBaseDir(): string {
  return outputDirStore.getStore() || runtimeOverride || config.agent.outputDir;
}

/**
 * 当前生效的 Agent 输出目录。
 * 聊天场景下，调用方应通过 runWithAgentOutputDir(getSessionChatOutputDir(sessionId), ...) 
 * 把输出根 narrowing 到 总目录/chats/YYYY-MM-DD；否则返回总目录本身。
 */
export function getAgentOutputDir(): string {
  return getAgentOutputBaseDir();
}

function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // 并发/权限竞态：忽略，落到写文件时再补一次
    }
  }
  return dir;
}

function formatDateDir(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 按「会话创建日期」解析该会话的聊天产物目录：总目录/chats/YYYY-MM-DD。
 * 同一会话无论横跨多少天、后续何时再次打开，产物始终落在此目录，不会每天新建。
 * 目录不存在时自动创建；已存在则不重复创建。
 */
export function resolveChatOutputDir(baseDir: string, createdAt?: string | Date | null): string {
  const date = createdAt ? new Date(createdAt) : new Date();
  return ensureDir(path.join(baseDir, 'chats', formatDateDir(date)));
}

/** 会话专属聊天产物目录：总目录/chats/YYYY-MM-DD（按会话创建日期），确保已存在 */
export async function getSessionChatOutputDir(sessionId: string): Promise<string> {
  const base = getAgentOutputBaseDir();
  const info = await getSessionInfo(sessionId);
  return resolveChatOutputDir(base, info?.createdAt);
}

/** 当前是否显式设置了运行时覆盖 */
export function hasAgentOutputOverride(): boolean {
  return runtimeOverride !== null;
}
