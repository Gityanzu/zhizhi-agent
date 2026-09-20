/**
 * 详细追踪数据库初始化每一步
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

async function traceInit() {
  console.log('🔍 逐步追踪 initDatabase...\n');
  
  try {
    const client = await (await import('../src/db')).query('SELECT 1');
    console.log('✅ 基本查询成功\n');
    
    // 检查所有表及其列
    const tablesResult = await query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    
    console.log('📋 所有表及其列:');
    let currentTable = '';
    tablesResult.rows.forEach(row => {
      if (row.table_name !== currentTable) {
        currentTable = row.table_name;
        console.log(`\n  ${currentTable}:`);
      }
      console.log(`    - ${row.column_name} (${row.data_type})`);
    });
    
    // 尝试执行可能导致错误的操作
    console.log('\n\n🧪 测试可能出错的 ALTER TABLE...');
    
    // 检查 sessions 表是否有 user_id
    const sessionsCols = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sessions'
    `);
    console.log('\nsessions 表的列:', sessionsCols.rows.map(r => r.column_name).join(', '));
    
    // 检查 messages 表是否有 user_id
    const messagesCols = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'messages'
    `);
    console.log('messages 表的列:', messagesCols.rows.map(r => r.column_name).join(', '));
    
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

traceInit();
