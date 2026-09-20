/**
 * 测试数据库直接查询
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'zhizhi_agent',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres'
});

async function testDirectQuery() {
  console.log('🔍 测试数据库直接查询\n');
  
  try {
    // 获取最新用户
    const users = await pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 1');
    
    if (users.rows.length === 0) {
      console.log('❌ 没有找到用户');
      return;
    }
    
    const user = users.rows[0];
    console.log('✅ 找到用户:');
    console.log('   username:', user.username);
    console.log('   email:', user.email);
    
    // 尝试使用 login 函数的查询语句
    console.log('\n📝 执行 login 查询:');
    const loginQuery = `
      SELECT id, username, email, password_hash, nickname, avatar, role, status, created_at 
      FROM users 
      WHERE username = $1
    `;
    
    console.log('SQL:', loginQuery);
    console.log('参数:', [user.username]);
    
    const result = await pool.query(loginQuery, [user.username]);
    
    console.log('\n✅ 查询成功!');
    console.log('   返回行数:', result.rows.length);
    if (result.rows.length > 0) {
      console.log('   返回字段:', Object.keys(result.rows[0]).join(', '));
    }
    
  } catch (error: any) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testDirectQuery().catch(console.error);
