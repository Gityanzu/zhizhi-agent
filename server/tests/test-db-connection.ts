/**
 * 简单的数据库连接测试
 */

import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

// 手动加载.env 文件
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^(\w+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

console.log('已加载环境变量:');
console.log('PG_PASSWORD:', process.env.PG_PASSWORD);
console.log('PG_PASSWORD length:', process.env.PG_PASSWORD?.length);
console.log('PG_PASSWORD charCodes:', process.env.PG_PASSWORD?.split('').map(c => c.charCodeAt(0)));

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'zhizhi_agent',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
});

async function testConnection() {
  console.log('🧪 测试 PostgreSQL 连接...\n');
  console.log(`主机：${process.env.PG_HOST}`);
  console.log(`端口：${process.env.PG_PORT}`);
  console.log(`数据库：${process.env.PG_DATABASE}`);
  console.log(`用户：${process.env.PG_USER}`);
  console.log(`密码长度：${process.env.PG_PASSWORD?.length || 0}\n`);
  
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now');
    client.release();
    
    console.log('✅ PostgreSQL 连接成功!');
    console.log(`当前时间：${result.rows[0].now}`);
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ PostgreSQL 连接失败!');
    console.error('错误:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testConnection();
