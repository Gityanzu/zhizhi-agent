/**
 * 直接测试数据库登录查询
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'zhizhi_agent',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres'
});

async function testLoginQuery() {
  console.log('🔍 测试数据库登录查询\n');
  
  try {
    // 获取最新用户
    console.log('1️⃣ 获取最新用户:');
    const usersResult = await pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 1');
    
    if (usersResult.rows.length === 0) {
      console.log('   ❌ 没有找到用户');
      return;
    }
    
    const user = usersResult.rows[0];
    console.log('   ✅ 找到用户:');
    console.log('      ID:', user.id);
    console.log('      username:', user.username);
    console.log('      email:', user.email);
    console.log('      password_hash 长度:', user.password_hash?.length || 0);
    console.log('      status:', user.status);
    
    // 尝试使用 username 查询
    console.log('\n2️⃣ 使用 username 字段查询:');
    const queryResult = await pool.query(
      'SELECT id, username, email, password_hash, nickname, avatar, role, status, created_at FROM users WHERE username = $1',
      [user.username]
    );
    
    console.log('   查询结果行数:', queryResult.rows.length);
    if (queryResult.rows.length > 0) {
      console.log('   ✅ 查询成功!');
      console.log('   返回字段:', Object.keys(queryResult.rows[0]).join(', '));
    } else {
      console.log('   ❌ 没有返回结果');
    }
    
    // 检查列名
    console.log('\n3️⃣ 检查 users 表的实际列名:');
    const columnsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('   列列表:');
    columnsResult.rows.forEach(col => {
      console.log(`   - ${col.column_name}`);
    });
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testLoginQuery().catch(console.error);
