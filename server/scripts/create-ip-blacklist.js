/**
 * 创建 ip_blacklist 表
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'zhizhi_agent',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres'
});

async function createIpBlacklistTable() {
  console.log('🔍 创建 ip_blacklist 表\n');
  
  try {
    const client = await pool.connect();
    
    // 创建 IP 黑名单表
    console.log('1️⃣ 创建 ip_blacklist 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ip_blacklist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ip_address VARCHAR(45) NOT NULL,
        reason TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(ip_address)
      )
    `);
    console.log('   ✅ ip_blacklist 表创建成功');
    
    // 创建索引
    console.log('\n2️⃣ 创建索引...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip ON ip_blacklist(ip_address)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ip_blacklist_expires ON ip_blacklist(expires_at)`);
    console.log('   ✅ 索引创建成功');
    
    // 添加注释
    console.log('\n3️⃣ 添加注释...');
    await client.query(`COMMENT ON TABLE ip_blacklist IS 'IP 黑名单表：记录被禁止访问的 IP 地址'`);
    await client.query(`COMMENT ON COLUMN ip_blacklist.id IS '黑名单 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN ip_blacklist.ip_address IS 'IP 地址（支持 IPv4 和 IPv6）'`);
    await client.query(`COMMENT ON COLUMN ip_blacklist.reason IS '封禁原因'`);
    await client.query(`COMMENT ON COLUMN ip_blacklist.expires_at IS '过期时间（NULL 表示永久封禁）'`);
    await client.query(`COMMENT ON COLUMN ip_blacklist.created_at IS '创建时间'`);
    console.log('   ✅ 注释添加成功');
    
    client.release();
    
    console.log('\n🎉 所有操作完成!');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

createIpBlacklistTable().catch(console.error);
