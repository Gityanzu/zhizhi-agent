/**
 * permissionMode.ts — Agent 运行权限模式（请求级上下文 + 服务端能力判定）
 *
 * 两种模式，对齐主流本地代理（Claude Code / Cursor / WorkBuddy）的 permission mode：
 *   sandbox  默认。文件读写受输出根目录约束，越界读写与命令执行都要用户确认；
 *   full     完全访问。不再弹确认，Agent 可直接读写本机任意路径、执行本地命令。
 *
 * 为什么用 AsyncLocalStorage 而不是模块级变量：这是"本次请求的授权"，并发请求
 * （多会话、多用户）必须各用各的。模块级变量会让 A 打开的授权波及到 B。
 *
 * 安全边界：full 只在"后端确实跑在用户自己机器上"时有效 —— 判定见
 * isFullAccessSupported()。Web 托管后端上即使有人绕过界面直接调 API 打开 full，
 * 也会在 runWithPermissionMode 里被降级回 sandbox。
 *
 * 这一层刻意不依赖数据库：filePermission / toolPolicy 每次判定都要读它，
 * 保持轻量才能让这些模块继续可单测、可独立复用。
 */
import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config';

export type PermissionMode = 'sandbox' | 'full';

const modeStore = new AsyncLocalStorage<PermissionMode>();

/**
 * full 模式是否可用。
 * 以 ZHI_USER_DATA 判定桌面托管后端（与 config.isDesktop 同源，由 Electron 注入）；
 * 开发态可用 ZHI_ALLOW_FULL_PERMISSION=1 显式放开，方便没有 Electron 时验证。
 */
export function isFullAccessSupported(): boolean {
  return config.isDesktop || process.env.ZHI_ALLOW_FULL_PERMISSION === '1';
}

/** 把本次调用链标记为指定权限模式；在不受支持的环境下自动降级为 sandbox */
export function runWithPermissionMode<T>(mode: PermissionMode | undefined, fn: () => T): T {
  const effective: PermissionMode = mode === 'full' && isFullAccessSupported() ? 'full' : 'sandbox';
  return modeStore.run(effective, fn);
}

/** 当前调用链生效的模式；没有上下文时一律按最严格的 sandbox */
export function getPermissionMode(): PermissionMode {
  return modeStore.getStore() ?? 'sandbox';
}

/** 是否处于完全访问模式（文件沙箱与工具审批同时放开） */
export function isFullAccess(): boolean {
  return getPermissionMode() === 'full';
}

/** 规范化外部传入的模式值，未知值一律按 sandbox 处理 */
export function normalizePermissionMode(value: unknown): PermissionMode {
  return value === 'full' ? 'full' : 'sandbox';
}

/**
 * 用户在界面上主动选择模式时的校验。
 *
 * 与 runWithPermissionMode 的"静默降级"刻意不同：那里是运行时的最后一道保险，
 * 而这里面对的是用户的明确选择 —— 在不支持的环境里选 full 必须报错，
 * 否则用户以为"完全访问已打开"，实际每次仍被拦下，是最难排查的那种不一致。
 */
export function assertSelectablePermissionMode(value: unknown): PermissionMode {
  if (value !== 'sandbox' && value !== 'full') {
    throw new Error('权限模式只能是 sandbox（本机默认）或 full（允许全部）');
  }
  if (value === 'full' && !isFullAccessSupported()) {
    throw new Error('当前运行环境不支持完全访问（仅桌面端可用）');
  }
  return value;
}
