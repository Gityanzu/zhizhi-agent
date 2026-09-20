/**
 * 测试数据库查询
 */

import db from './src/db';

async function testQuery() {
  console.log('🔍 测试数据库查询\n');
  
  if (!db) {
    console.error('❌ 数据库未初始化');
    return;
  }
  
  try {
    // 检查 users 表的列
    console.log('1️⃣ 检查 users 表的列:');
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('   列列表:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });
    
    // 尝试查询用户
    console.log('\n2️⃣ 尝试查询最新用户:');
    const users = await db.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 1');
    console.log('   查询结果:', JSON.stringify(users.rows[0], null, 2));
    
    // 尝试使用 username 字段
    console.log('\n3️⃣ 尝试使用 username 字段查询:');
    const userByUsername = await db.query('SELECT id, username, email FROM users WHERE username = $1', ['debug_user_1789734001936']);
    console.log('   结果:', JSON.stringify(userByUsername.rows, null, 2));
    
  } catch (error: any) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
  }
}

testQuery().catch(console.error);
