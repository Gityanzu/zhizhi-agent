/**
 * 测试数据库初始化 SQL
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'zhizhi_agent',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres'
});

async function testInitSQL() {
  console.log('🔍 测试数据库初始化 SQL\n');
  
  const client = await pool.connect();
  
  try {
    // 尝试创建 users 表
    console.log('1️⃣ 创建 users 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(50),
        avatar VARCHAR(500),
        role VARCHAR(20) DEFAULT 'user',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('   ✅ users 表创建成功');
    
    // 尝试创建 login_logs 表
    console.log('\n2️⃣ 创建 login_logs 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        ip_address VARCHAR(45),
        user_agent TEXT,
        location VARCHAR(200),
        login_method VARCHAR(20) DEFAULT 'password',
        status VARCHAR(20) DEFAULT 'success',
        failure_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('   ✅ login_logs 表创建成功');
    
    // 添加注释
    console.log('\n3️⃣ 添加注释...');
    await client.query(`COMMENT ON COLUMN login_logs.user_id IS '用户 ID (UUID)'`);
    console.log('   ✅ 注释添加成功');
    
    console.log('\n🎉 所有初始化 SQL 执行成功!');
    
  } catch (error: any) {
    console.error('\n❌ 错误:', error.message);
    console.error('   堆栈:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testInitSQL().catch(console.error);
