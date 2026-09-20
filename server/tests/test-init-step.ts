/**
 * 详细调试数据库初始化
 */

import * as path from 'path';
import * as fs from 'fs';

// 加载.env
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const match = line.match(/^([\w]+)=(.*)$/);
    if (match) {
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  });
}

import { query } from '../src/db';

async function debugInit() {
  console.log('🔍 逐步初始化数据库...\n');
  
  try {
    // 检查现有表
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📋 现有表列表:');
    tables.rows.forEach(r => console.log(`  ✓ ${r.table_name}`));
    
    // 尝试创建 tokens 表（新加的表之一）
    console.log('\n🔨 尝试创建 tokens 表...');
    await query(`
      CREATE TABLE IF NOT EXISTS tokens (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        token_type VARCHAR(50) NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP
      )
    `);
    console.log('✅ tokens 表创建成功');
    
    // 检查 tokens 表的列
    const columns = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'tokens'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📝 tokens 表的列:');
    columns.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));
    
    // 测试插入
    console.log('\n💾 测试插入数据...');
    await query(`
      INSERT INTO tokens (id, user_id, token_type, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour')
    `, ['test-1', 'user-1', 'access', 'hash-1']);
    console.log('✅ 插入成功');
    
    // 查询验证
    const result = await query('SELECT * FROM tokens WHERE id = $1', ['test-1']);
    console.log(`📊 查询结果：${result.rows.length} 行`);
    
    // 清理
    await query('DELETE FROM tokens WHERE id = $1', ['test-1']);
    console.log('🧹 清理测试数据完成');
    
    console.log('\n✨ 所有步骤成功！');
    process.exit(0);
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('\n❌ 错误:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

debugInit();
