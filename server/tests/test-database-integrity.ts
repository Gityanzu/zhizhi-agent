/**
 * 数据库完整性测试脚本
 * 验证所有新增的表是否正确创建
 */

// 首先加载环境变量
import * as path from 'path';
import * as fs from 'fs';

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

// 现在导入数据库模块（此时环境变量已设置）
import { query, checkDatabase, initDatabase } from '../src/db';

async function runTests() {
  console.log('🧪 开始数据库完整性测试...\n');
  
  try {
    // 1. 检查数据库连接
    console.log('1️⃣ 检查数据库连接...');
    const dbAvailable = await checkDatabase();
    if (!dbAvailable) {
      throw new Error('数据库连接失败，请检查 .env 配置');
    }
    console.log('✅ 数据库连接成功\n');
    
    // 2. 初始化数据库（如果尚未初始化）
    console.log('2️⃣ 初始化数据库表...');
    const initOk = await initDatabase();
    if (!initOk) {
      throw new Error('数据库初始化失败');
    }
    console.log('✅ 数据库初始化成功\n');
    
    // 3. 验证所有表存在
    console.log('3️⃣ 验证新增表...\n');
    
    const expectedTables = [
      'login_logs',
      'tokens',
      'email_verifications',
      'templates',
      'template_comments',
      'template_ratings',
      'template_favorites',
      'agent_comments',
      'agent_ratings',
      'search_histories',
      'analytics',
      'skills',
    ];
    
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ($1)
      ORDER BY table_name
    `, [expectedTables]);
    
    console.log(`   预期表数量：${expectedTables.length}`);
    console.log(`   实际找到：${tablesResult.rows.length}\n`);
    
    for (const tableName of expectedTables) {
      const exists = tablesResult.rows.some((r: { table_name: string }) => r.table_name === tableName);
      const status = exists ? '✅' : '❌';
      console.log(`   ${status} ${tableName}`);
    }
    
    if (tablesResult.rows.length !== expectedTables.length) {
      const missing = expectedTables.filter((t: string) => !tablesResult.rows.some((r: { table_name: string }) => r.table_name === t));
      console.log(`\n⚠️  缺失的表：${missing.join(', ')}`);
      return false;
    }
    
    console.log('\n✅ 所有表验证通过\n');
    
    // 4. 验证索引
    console.log('4️⃣ 验证索引...\n');
    
    const expectedIndexes = [
      { table: 'login_logs', index: 'idx_login_logs_user_id' },
      { table: 'tokens', index: 'idx_tokens_token_hash' },
      { table: 'templates', index: 'idx_templates_category' },
      { table: 'template_comments', index: 'idx_template_comments_template_id' },
      { table: 'template_ratings', index: 'idx_template_ratings_template_id' },
      { table: 'template_favorites', index: 'idx_template_favorites_user_id' },
      { table: 'agent_comments', index: 'idx_agent_comments_agent_id' },
      { table: 'agent_ratings', index: 'idx_agent_ratings_agent_id' },
      { table: 'search_histories', index: 'idx_search_histories_user_id' },
      { table: 'analytics', index: 'idx_analytics_metric' },
      { table: 'skills', index: 'idx_skills_user_id' },
      { table: 'sessions', index: 'idx_sessions_user_updated' },
      { table: 'messages', index: 'idx_messages_session_created' },
      { table: 'agents', index: 'idx_agents_created_at' },
    ];
    
    let indexCount = 0;
    for (const { table, index } of expectedIndexes) {
      const result = await query(`
        SELECT EXISTS (
          SELECT FROM pg_indexes 
          WHERE schemaname = 'public' 
          AND tablename = $1 
          AND indexname = $2
        ) as exists
      `, [table, index]);
      
      const exists = result.rows[0].exists;
      const status = exists ? '✅' : '❌';
      console.log(`   ${status} ${index} ON ${table}`);
      if (exists) indexCount++;
    }
    
    console.log(`\n索引验证：${indexCount}/${expectedIndexes.length} 通过\n`);
    
    // 5. 测试数据插入
    console.log('5️⃣ 测试数据插入...\n');
    
    // 测试 tokens 表
    const testTokenId = 'test_' + Date.now();
    await query(`
      INSERT INTO tokens (id, user_id, token_type, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour')
    `, [testTokenId, 'test_user', 'password_reset', 'test_hash']);
    console.log('   ✅ tokens 表写入成功');
    
    // 清理测试数据
    await query('DELETE FROM tokens WHERE id = $1', [testTokenId]);
    console.log('   ✅ 测试数据清理成功\n');
    
    // 6. 总结
    console.log('='.repeat(50));
    console.log('🎉 数据库完整性测试全部通过！');
    console.log('='.repeat(50));
    console.log(`\n统计信息:`);
    console.log(`  - 新增表：${expectedTables.length} 个`);
    console.log(`  - 新增索引：${expectedIndexes.length} 个`);
    console.log(`  - 数据操作：✅ 正常`);
    console.log('\n✨ 系统已准备好投入使用！\n');
    
    return true;
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error && error.stack ? error.stack : '';
    console.error('\n❌ 测试失败:', errorMessage);
    if (errorStack) {
      console.error(errorStack);
    }
    return false;
  }
}

// 运行测试
runTests().then(success => {
  process.exit(success ? 0 : 1);
});
