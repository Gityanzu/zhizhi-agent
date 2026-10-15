import { query } from '../db';
import { normalizePermissionMode, type PermissionMode } from './permissionMode';

/**
 * 用户级 Agent 权限模式。
 *
 * 为什么单独建表：user_settings 是单例表（id 恒为 1），而"我能让 Agent 访问本机到什么程度"
 * 必须按用户隔离 —— A 打开的完全访问不应该让 B 也获得本机读写能力。
 * 存储形态与 user_model_preferences / user_output_preferences 保持一致（user_id 主键）。
 *
 * 注意这里的 mode 是"用户意愿"，运行时是否真的生效由 permissionMode.ts 的
 * runWithPermissionMode 按服务端能力再判一次（Web 托管后端永远降级为 sandbox）。
 */

export async function getUserPermissionMode(userId: string): Promise<PermissionMode> {
  const r = await query('SELECT mode FROM user_permission_preferences WHERE user_id = $1', [userId]);
  if (r.rows.length === 0) return 'sandbox';
  return normalizePermissionMode(r.rows[0].mode);
}

/**
 * 保存该用户的权限模式。
 * 刻意保留 sandbox 记录（而不是删行）：这样表里始终是该用户的当前状态与变更时间，
 * 排查"谁在什么时候开过完全访问"时不用去翻日志。
 */
export async function setUserPermissionMode(userId: string, mode: unknown): Promise<PermissionMode> {
  const value = normalizePermissionMode(mode);
  await query(
    `INSERT INTO user_permission_preferences (user_id, mode, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET mode = EXCLUDED.mode, updated_at = NOW()`,
    [userId, value]
  );
  if (value === 'full') {
    console.warn(`[权限] 用户 ${userId} 已开启「完全访问」：Agent 将不再逐次请求确认`);
  }
  return value;
}

/** 解析该用户配置的模式；未配置或读库失败一律回落到最严格的 sandbox */
export async function resolveUserPermissionMode(userId?: string | null): Promise<PermissionMode> {
  if (!userId) return 'sandbox';
  try {
    return await getUserPermissionMode(userId);
  } catch (e) {
    console.warn('[权限] 读取用户权限模式失败，回退沙箱:', e instanceof Error ? e.message : String(e));
    return 'sandbox';
  }
}
