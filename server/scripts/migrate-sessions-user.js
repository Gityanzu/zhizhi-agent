/**
 * migrate-sessions-user.js — 一次性迁移：为存量无主 sessions/folders 归属用户
 *
 * 背景：多用户隔离改造后，sessions/folders 新增 user_id 列。存量数据 user_id 为 NULL
 * （匿名桶），登录用户看不到自己的历史会话。需按策略把无主数据归属到用户。
 *
 * 策略（对齐计划 2.5）：
 *   - 系统仅 1 个用户：把全部 user_id IS NULL 的 sessions/folders 归到该用户。
 *   - 系统 0 个或多个用户：不自动归属（保持 NULL，仅未登录可见），需人工处理。
 *
 * 用法：
 *   cd server && node scripts/migrate-sessions-user.js          # 预览（dry-run，不写库）
 *   cd server && node scripts/migrate-sessions-user.js --apply  # 实际执行 UPDATE
 * 幂等：仅更新 user_id IS NULL 的行，重复执行第二次影响 0 行。
 */
require('dotenv').config();
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

(async () => {
  const pool = new Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  });
  const client = await pool.connect();

  try {
    const users = await client.query('SELECT id, username FROM users ORDER BY created_at ASC');
    const orphanSessions = await client.query('SELECT COUNT(*)::int AS c FROM sessions WHERE user_id IS NULL');
    const orphanFolders = await client.query('SELECT COUNT(*)::int AS c FROM folders WHERE user_id IS NULL');

    console.log(`系统用户数: ${users.rowCount}`);
    console.log(`无主会话 (user_id IS NULL): ${orphanSessions.rows[0].c} 条`);
    console.log(`无主文件夹 (user_id IS NULL): ${orphanFolders.rows[0].c} 条`);

    if (orphanSessions.rows[0].c === 0 && orphanFolders.rows[0].c === 0) {
      console.log('没有需要归属的存量数据，退出。');
      return;
    }

    if (users.rowCount === 0) {
      console.log('⚠ 系统尚无用户，无法归属。请先注册/创建用户后再执行。');
      return;
    }

    if (users.rowCount > 1) {
      console.log(`⚠ 系统有 ${users.rowCount} 个用户，无法判定存量数据归属，保持匿名（不改动）。`);
      console.log('  如需人工指定，可执行：UPDATE sessions SET user_id = \'<目标用户ID>\' WHERE user_id IS NULL;');
      return;
    }

    // 单用户：全部归属该用户
    const target = users.rows[0];
    console.log(`单用户模式 → 将全部无主数据归属用户: ${target.username} (${target.id})`);

    if (!APPLY) {
      console.log('（dry-run）预览完成，未写库。加 --apply 执行实际更新。');
      return;
    }

    await client.query('BEGIN');
    const sUpd = await client.query('UPDATE sessions SET user_id = $1 WHERE user_id IS NULL', [target.id]);
    const fUpd = await client.query('UPDATE folders SET user_id = $1 WHERE user_id IS NULL', [target.id]);
    await client.query('COMMIT');

    console.log(`✅ 已归属会话 ${sUpd.rowCount} 条、文件夹 ${fUpd.rowCount} 条 → 用户 ${target.username}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('迁移失败:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
