/**
 * 精确定位数据库初始化错误
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

async function locateError() {
  console.log('🔍 逐步执行 initDatabase...\n');
  
  const steps = [
    { name: '创建 tokens 表', sql: `CREATE TABLE IF NOT EXISTS tokens (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, token_type VARCHAR(50) NOT NULL, token_hash VARCHAR(255) NOT NULL, expires_at TIMESTAMP NOT NULL, revoked_at TIMESTAMP)` },
    { name: '创建 login_logs 表', sql: `CREATE TABLE IF NOT EXISTS login_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL, ip_address VARCHAR(45), user_agent TEXT, location VARCHAR(255), login_method VARCHAR(50), status VARCHAR(20), failure_reason TEXT, created_at TIMESTAMP DEFAULT NOW())` },
    { name: '创建 email_verifications 表', sql: `CREATE TABLE IF NOT EXISTS email_verifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE CASCADE, email VARCHAR(255) NOT NULL, verification_code VARCHAR(10) NOT NULL, purpose VARCHAR(50) NOT NULL, expires_at TIMESTAMP NOT NULL, used_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW())` },
    { name: '创建 templates 表', sql: `CREATE TABLE IF NOT EXISTS templates (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(200) NOT NULL, title VARCHAR(500), description TEXT, system_prompt TEXT, model JSONB, tools JSONB, temperature DECIMAL(3,2), category VARCHAR(50), tags JSONB DEFAULT '[]', type VARCHAR(50), status VARCHAR(20) DEFAULT 'draft', version VARCHAR(20), view_count INTEGER DEFAULT 0, download_count INTEGER DEFAULT 0, like_count INTEGER DEFAULT 0, rating DECIMAL(3,2), review_count INTEGER DEFAULT 0, author_id UUID REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), published_at TIMESTAMP)` },
  ];
  
  for (const step of steps) {
    try {
      console.log(`▶️  ${step.name}`);
      await query(step.sql);
      console.log(`   ✅ 成功\n`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`   ❌ 失败:`);
      console.error(`   错误：${errorMessage}\n`);
      
      // 尝试获取更详细的错误信息
      if (error instanceof Error && error.stack) {
        console.error(`   堆栈:\n${error.stack}\n`);
      }
      
      // 继续执行后续步骤，找出所有错误
    }
  }
  
  console.log('🏁 步骤测试完成');
  process.exit(0);
}

locateError();
