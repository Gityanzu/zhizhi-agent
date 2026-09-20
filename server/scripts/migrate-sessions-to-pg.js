/**
 * migrate-sessions-to-pg.js — 一次性迁移：data/sessions.json → PostgreSQL
 *
 * 背景：修复 initDatabase 后存储后端由 JSON 切换为 PostgreSQL，
 * 存量会话（sessions.json）需要导入 sessions/messages 表，否则界面上历史对话"消失"。
 *
 * 用法：cd server && node scripts/migrate-sessions-to-pg.js
 * 幂等：ON CONFLICT DO NOTHING，可安全重复执行。
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const JSON_FILE = path.join(__dirname, '..', 'data', 'sessions.json');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 旧版 JSON 存储用过 base36 非 UUID 主键，迁移时统一换发 UUID，并维护旧→新映射 */
function buildIdMap(entries) {
  const map = new Map();
  const fix = (id) => {
    if (id && !UUID_RE.test(id) && !map.has(id)) map.set(id, crypto.randomUUID());
  };
  for (const [id, sess] of entries) {
    fix(id);
    fix(sess?.info?.id);
    for (const m of sess?.messages || []) {
      fix(m.id);
      fix(m.parentId);
    }
  }
  return map;
}

(async () => {
  if (!fs.existsSync(JSON_FILE)) {
    console.log('未找到 sessions.json，无需迁移');
    return;
  }
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
  const entries = Object.entries(data);
  console.log(`待迁移会话: ${entries.length} 个`);

  const pool = new Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const before = await client.query('SELECT COUNT(*)::int AS c FROM sessions');
    console.log(`迁移前 PG sessions: ${before.rows[0].c} 条`);

    let sCount = 0;
    let mCount = 0;
    const idMap = buildIdMap(entries);
    console.log(`非 UUID 旧主键换发: ${idMap.size} 个`);
    const mapId = (id) => idMap.get(id) || id;

    for (const [id, sess] of entries) {
      const info = sess.info || {};
      const sessionId = mapId(info.id || id);
      const r = await client.query(
        `INSERT INTO sessions (id, title, mode, model, skill_id, created_at, updated_at, message_count, folder_id, is_pinned, tags, current_branch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
        [
          sessionId,
          info.title || null,
          info.mode || 'agent',
          info.model || null,
          info.skillId || null,
          info.createdAt || new Date(),
          info.updatedAt || new Date(),
          info.messageCount ?? (sess.messages || []).length,
          info.folderId || null,
          info.isPinned ?? false,
          JSON.stringify(info.tags || []),
          info.currentBranchId || null,
        ]
      );
      sCount += r.rowCount;

      for (const m of sess.messages || []) {
        const r2 = await client.query(
          `INSERT INTO messages (id, session_id, role, content, mode, created_at, tool_calls, sources, thinking, plan, agent_trace, token_usage, parent_id, branch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
          [
            m.id ? mapId(m.id) : crypto.randomUUID(),
            sessionId,
            m.role,
            m.content ?? null,
            m.mode || null,
            m.timestamp || m.createdAt || new Date(),
            JSON.stringify(m.toolCalls || []),
            JSON.stringify(m.sources || []),
            m.thinking ?? null,
            m.plan ? JSON.stringify(m.plan) : null,
            m.agentTrace ? JSON.stringify(m.agentTrace) : null,
            m.tokenUsage ? JSON.stringify(m.tokenUsage) : null,
            m.parentId ? mapId(m.parentId) : null,
            m.branchId || null,
          ]
        );
        mCount += r2.rowCount;
      }
    }

    const after = await client.query('SELECT COUNT(*)::int AS c FROM sessions');
    const afterMsg = await client.query('SELECT COUNT(*)::int AS c FROM messages');
    console.log(`本次新插入 sessions: ${sCount} 条, messages: ${mCount} 条`);
    console.log(`迁移后 PG sessions: ${after.rows[0].c} 条, messages: ${afterMsg.rows[0].c} 条`);

    await client.query('COMMIT');
    console.log('✅ 迁移完成（JSON 文件保留未删，可核对后手动归档）');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ 迁移失败，已回滚:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
