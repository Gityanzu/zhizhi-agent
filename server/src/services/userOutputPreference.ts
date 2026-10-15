import { query } from '../db';

/**
 * 用户级 Agent 文件输出目录。
 *
 * 为什么单独建表：user_settings 是单例表（id 恒为 1），多用户共用一份；
 * 而"我的文件生成到哪"必须按用户隔离 —— 否则 A 改了生成目录，B 的产物也会
 * 跟着落到 A 的目录里。存储形态与 user_model_preferences 保持一致（user_id 主键）。
 *
 * 生效方式：入口处用 runWithUserOutputDir 把目录包进本次异步调用链，
 * 于是并发请求/后台任务各用各的，不依赖进程级全局变量。
 */

export async function getUserOutputDir(userId: string): Promise<string | null> {
  const r = await query('SELECT output_dir FROM user_output_preferences WHERE user_id = $1', [userId]);
  if (r.rows.length === 0) return null;
  const dir = r.rows[0].output_dir;
  return typeof dir === 'string' && dir.trim() ? dir.trim() : null;
}

/** 设置该用户的输出目录；传空则清除（回退到全局默认） */
export async function setUserOutputDir(userId: string, dir: string | null): Promise<void> {
  const value = dir && dir.trim() ? dir.trim() : null;
  if (!value) {
    await query('DELETE FROM user_output_preferences WHERE user_id = $1', [userId]);
    return;
  }
  await query(
    `INSERT INTO user_output_preferences (user_id, output_dir, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET output_dir = EXCLUDED.output_dir, updated_at = NOW()`,
    [userId, value]
  );
}

/**
 * 解析该用户配置的输出目录，供入口处建立请求级上下文：
 *
 *   const dir = await resolveUserOutputDir(userId);
 *   runWithAgentOutputDir(dir, () => { ...整条调用链... });
 *
 * 读库失败或未配置时返回 undefined（调用方回退全局默认），不阻断请求。
 */
export async function resolveUserOutputDir(userId?: string | null): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    return (await getUserOutputDir(userId)) ?? undefined;
  } catch (e) {
    console.warn('[AgentOutput] 读取用户输出目录失败，回退默认:', e instanceof Error ? e.message : String(e));
    return undefined;
  }
}
