/**
 * patch-login-logs.cjs — 一次性补齐 login_logs 缺失列
 *
 * 背景：scripts/migrate-auth-security.js 在 Node 24 下因 ESM 自动探测无法用
 * ts-node 直跑；而旧库 login_logs 缺 error_message 等列会让登录日志写入报 42703。
 * 这里用纯 CJS + pg 直连执行与迁移脚本一致的幂等 ALTER，跑完即可验证登录。
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

const COLUMNS = [
  'user_id UUID',
  'username VARCHAR(50)',
  'ip_address VARCHAR(45)',
  'user_agent TEXT',
  'location VARCHAR(200)',
  "status VARCHAR(20) DEFAULT 'success'",
  'error_message TEXT',
  'device_id VARCHAR(100)',
  'device_name VARCHAR(100)',
  'device_type VARCHAR(20)',
  'platform VARCHAR(50)',
  'browser VARCHAR(50)',
  'created_at TIMESTAMP DEFAULT NOW()',
];

async function main() {
  const client = new Client({
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'zhizhi_agent',
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS login_logs (id SERIAL PRIMARY KEY)`);
  for (const col of COLUMNS) {
    await client.query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS ${col}`);
  }
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'login_logs' ORDER BY ordinal_position`
  );
  console.log('LOGIN_LOGS_COLUMNS=' + r.rows.map((x) => x.column_name).join(','));
  await client.end();
}

main().catch((err) => {
  console.error('PATCH_FAIL:', err.message);
  process.exit(1);
});
