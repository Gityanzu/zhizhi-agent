/**
 * 为 login_logs 表添加 username 字段
 */

import db from '../src/db';

async function addUsernameColumn() {
  console.log('🔍 为 login_logs 表添加 username 字段\n');
  
  if (!db) {
    console.error('❌ 数据库未初始化');
    return;
  }
  
  try {
    // 添加 username 字段
    console.log('1️⃣ 添加 username 字段...');
    await db.query(`
      ALTER TABLE login_logs 
      ADD COLUMN IF NOT EXISTS username VARCHAR(100)
    `);
    console.log('   ✅ username 字段添加成功');
    
    // 添加索引
    console.log('\n2️⃣ 创建 username 索引...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_login_logs_username ON login_logs(username)
    `);
    console.log('   ✅ 索引创建成功');
    
    // 添加注释
    console.log('\n3️⃣ 添加字段注释...');
    await db.query(`
      COMMENT ON COLUMN login_logs.username IS '用户名（冗余字段，便于查询）'
    `);
    console.log('   ✅ 注释添加成功');
    
    console.log('\n🎉 所有操作完成!');
    
  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  }
}

addUsernameColumn().catch(console.error);
