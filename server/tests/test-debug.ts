/**
 * 调试数据库初始化错误
 */

import * as path from 'path';
import * as fs from 'fs';

// 加载.env
const envPath = path.resolve(__dirname, '..', '.env');
console.log('🔍 尝试加载 .env:', envPath);
console.log('📁 当前目录:', __dirname);
console.log('📁 父目录:', path.dirname(__dirname));

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  console.log('✅ 已读取 .env 文件');
  envContent.split('\n').forEach(line => {
    // 跳过注释和空行
    if (!line.trim() || line.trim().startsWith('#')) return;
    
    // 匹配 KEY=VALUE 格式（支持引号）
    const match = line.match(/^([\w]+)=(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2];
      
      // 去除引号
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      process.env[key] = value;
      console.log(`   ${key}=${value ? '*'.repeat(value.length) : '(empty)'}`);
    }
  });
}

import { query } from '../src/db';

async function debug() {
  console.log('🔍 调试数据库结构...\n');
  
  try {
    // 列出所有模板相关表
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'template%'
      ORDER BY table_name
    `);
    
    console.log('📋 模板相关表:');
    tables.rows.forEach(r => console.log(`  - ${r.table_name}`));
    
    // 检查 template_comments 表的列
    const columns = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'template_comments'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📝 template_comments 表的列:');
    columns.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));
    
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

debug();
