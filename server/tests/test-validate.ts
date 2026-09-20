/**
 * 数据库完整性验证脚本（简化版）
 * 只检查现有结构，不尝试重新初始化
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

async function validateDatabase() {
  console.log('🧪 数据库完整性验证\n');
  
  try {
    // 1. 检查连接
    console.log('1️⃣ 检查数据库连接...');
    await query('SELECT 1');
    console.log('   ✅ 连接成功\n');
    
    // 2. 验证新增表
    console.log('2️⃣ 验证新增表...\n');
    const expectedTables = [
      'login_logs', 'tokens', 'email_verifications',
      'templates', 'template_comments', 'template_ratings', 'template_favorites',
      'agent_comments', 'agent_ratings', 'search_histories',
      'analytics', 'skills'
    ];
    
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ANY($1)
      ORDER BY table_name
    `, [expectedTables]);
    
    console.log(`   预期：${expectedTables.length} 个表`);
    console.log(`   实际：${tablesResult.rows.length} 个表\n`);
    
    let allTablesExist = true;
    for (const tableName of expectedTables) {
      const exists = tablesResult.rows.some((r: { table_name: string }) => r.table_name === tableName);
      console.log(`   ${exists ? '✅' : '❌'} ${tableName}`);
      if (!exists) allTablesExist = false;
    }
    
    if (!allTablesExist) {
      console.log('\n❌ 部分表缺失');
      return false;
    }
    
    // 3. 验证索引（部分索引可能不存在于旧数据库）
    console.log('\n3️⃣ 验证索引...\n');
    const expectedIndexes = [
      'idx_login_logs_user_id', 'idx_tokens_token_hash', 'idx_templates_category',
      'idx_template_comments_template_id', 'idx_template_ratings_template_id',
      'idx_template_favorites_user_id', 'idx_agent_comments_agent_id',
      'idx_agent_ratings_agent_id', 'idx_search_histories_user_id',
      'idx_analytics_metric', 'idx_skills_user_id'
    ];
    
    const optionalIndexes = [
      'idx_sessions_user_updated', 'idx_messages_session_created'
    ];
    
    const indexesResult = await query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname = ANY($1)
      ORDER BY indexname
    `, [expectedIndexes]);
    
    console.log(`   预期：${expectedIndexes.length} 个索引`);
    console.log(`   实际：${indexesResult.rows.length} 个索引\n`);
    
    let allIndexesExist = true;
    for (const indexName of expectedIndexes) {
      const exists = indexesResult.rows.some((r: { indexname: string }) => r.indexname === indexName);
      console.log(`   ${exists ? '✅' : '❌'} ${indexName}`);
      if (!exists) allIndexesExist = false;
    }
    
    // 检查可选索引
    console.log('\n   可选索引 (非必需):');
    const optionalResult = await query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname = ANY($1)
      ORDER BY indexname
    `, [optionalIndexes]);
    
    for (const indexName of optionalIndexes) {
      const exists = optionalResult.rows.some((r: { indexname: string }) => r.indexname === indexName);
      console.log(`   ${exists ? '✅' : '⚠️ '} ${indexName} (可选)`);
    }
    
    if (!allIndexesExist) {
      console.log('\n❌ 部分索引缺失');
      return false;
    }
    
    // 4. 总结
    console.log('\n' + '='.repeat(50));
    console.log('🎉 数据库完整性验证通过！');
    console.log('='.repeat(50));
    console.log(`\n统计:`);
    console.log(`  - 新增表：${expectedTables.length} 个 ✅`);
    console.log(`  - 核心索引：${expectedIndexes.length} 个 ✅`);
    console.log(`  - 可选索引：${optionalIndexes.filter(i => optionalResult.rows.some(r => r.indexname === i)).length}/${optionalIndexes.length} ⚠️`);
    console.log(`\n✨ 系统已准备好投入使用！\n`);
    
    return true;
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('\n❌ 验证失败:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

validateDatabase().then(success => {
  process.exit(success ? 0 : 1);
});
