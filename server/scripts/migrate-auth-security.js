/**
 * 认证系统安全增强 - 数据库迁移脚本
 * 执行日期: 2026年9月17日
 * 目标: 添加密码找回、密码修改、Token刷新、邮箱验证等功能
 */

import { query, setUsePostgres } from '../src/db.js';
import crypto from 'crypto';

// 设置使用PostgreSQL
setUsePostgres(true);

console.log('🔄 开始认证系统安全增强数据库迁移...\n');

try {
  // 1. 更新users表结构
  console.log('📝 更新users表结构...');

  // 检查并添加email_verify_token字段
  try {
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token VARCHAR(100)
    `);
    console.log('  ✅ 添加email_verify_token字段');
  } catch (error) {
    console.log('  ⚠️  email_verify_token字段可能已存在');
  }

  // 检查并添加email_verify_expires字段
  try {
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMP
    `);
    console.log('  ✅ 添加email_verify_expires字段');
  } catch (error) {
    console.log('  ⚠️  email_verify_expires字段可能已存在');
  }

  // 检查并添加password_changed_at字段
  try {
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP
    `);
    console.log('  ✅ 添加password_changed_at字段');
  } catch (error) {
    console.log('  ⚠️  password_changed_at字段可能已存在');
  }

  // 检查并添加failed_login_attempts字段
  try {
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0
    `);
    console.log('  ✅ 添加failed_login_attempts字段');
  } catch (error) {
    console.log('  ⚠️  failed_login_attempts字段可能已存在');
  }

  // 检查并添加locked_until字段
  try {
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP
    `);
    console.log('  ✅ 添加locked_until字段');
  } catch (error) {
    console.log('  ⚠️  locked_until字段可能已存在');
  }

  console.log('');

  // 2. 创建password_resets表（密码重置）
  console.log('📝 创建password_resets表...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(100) NOT NULL,
        token VARCHAR(100) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  ✅ 创建password_resets表');

    // 创建索引
    await query(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at)`);
    console.log('  ✅ 创建索引');
  } catch (error) {
    console.error('  ❌ 创建password_resets表失败:', error.message);
  }

  console.log('');

  // 3. 创建login_logs表（登录日志）
  console.log('📝 创建login_logs表...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS login_logs (
        id SERIAL PRIMARY KEY,
        user_id UUID,
        username VARCHAR(50),
        ip_address VARCHAR(45),
        user_agent TEXT,
        location VARCHAR(200),
        status VARCHAR(20) DEFAULT 'success',
        error_message TEXT,
        device_id VARCHAR(100),
        device_name VARCHAR(100),
        device_type VARCHAR(20),
        platform VARCHAR(50),
        browser VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  ✅ 创建login_logs表');

    // 存量旧表兼容：CREATE TABLE IF NOT EXISTS 不会给已存在的表补列，
    // 旧库的 login_logs 缺 error_message 等字段会导致登录日志写入报 42703，
    // 这里用幂等 ALTER 把代码（loginLogger.ts INSERT）依赖的列补齐。
    const loginLogColumns = [
      "user_id UUID",
      "username VARCHAR(50)",
      "ip_address VARCHAR(45)",
      "user_agent TEXT",
      "location VARCHAR(200)",
      "status VARCHAR(20) DEFAULT 'success'",
      "error_message TEXT",
      "device_id VARCHAR(100)",
      "device_name VARCHAR(100)",
      "device_type VARCHAR(20)",
      "platform VARCHAR(50)",
      "browser VARCHAR(50)",
      "created_at TIMESTAMP DEFAULT NOW()",
    ];
    for (const col of loginLogColumns) {
      await query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS ${col}`);
    }
    console.log('  ✅ login_logs 字段补齐（幂等 ALTER）');

    // 创建索引
    await query(`CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_login_logs_ip_address ON login_logs(ip_address)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_login_logs_status ON login_logs(status)`);
    console.log('  ✅ 创建索引');
  } catch (error) {
    console.error('  ❌ 创建login_logs表失败:', error.message);
  }

  console.log('');

  // 4. 创建user_devices表（用户设备管理）
  console.log('📝 创建user_devices表...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS user_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id VARCHAR(100) NOT NULL,
        device_name VARCHAR(200),
        ip_address VARCHAR(45),
        user_agent TEXT,
        platform VARCHAR(50),
        browser VARCHAR(50),
        os VARCHAR(50),
        last_login_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        is_current BOOLEAN DEFAULT FALSE,
        UNIQUE(user_id, device_id)
      )
    `);
    console.log('  ✅ 创建user_devices表');

    // 创建索引
    await query(`CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_user_devices_device_id ON user_devices(device_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_user_devices_created_at ON user_devices(created_at)`);
    console.log('  ✅ 创建索引');
  } catch (error) {
    console.error('  ❌ 创建user_devices表失败:', error.message);
  }

  console.log('');

  // 5. 创建api_key_usage_log表（API Key使用日志）
  console.log('📝 创建api_key_usage_log表...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS api_key_usage_log (
        id SERIAL PRIMARY KEY,
        api_key_id UUID NOT NULL,
        user_id UUID,
        ip_address VARCHAR(45),
        path VARCHAR(500),
        method VARCHAR(10),
        status INTEGER,
        response_time INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  ✅ 创建api_key_usage_log表');

    // 创建索引
    await query(`CREATE INDEX IF NOT EXISTS idx_api_key_usage_api_key_id ON api_key_usage_log(api_key_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_api_key_usage_user_id ON api_key_usage_log(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_api_key_usage_created_at ON api_key_usage_log(created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_api_key_usage_ip_address ON api_key_usage_log(ip_address)`);
    console.log('  ✅ 创建索引');
  } catch (error) {
    console.error('  ❌ 创建api_key_usage_log表失败:', error.message);
  }

  console.log('');

  // 6. 创建user_invites表（用户邀请）
  console.log('📝 创建user_invites表...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS user_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inviter_id UUID,
        email VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        token VARCHAR(100) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        used_by UUID,
        used_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  ✅ 创建user_invites表');

    // 创建索引
    await query(`CREATE INDEX IF NOT EXISTS idx_user_invites_token ON user_invites(token)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_user_invites_email ON user_invites(email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_user_invites_status ON user_invites(status)`);
    console.log('  ✅ 创建索引');
  } catch (error) {
    console.error('  ❌ 创建user_invites表失败:', error.message);
  }

  console.log('');

  // 7. 检查audit_logs表（建表已统一收归 src/db.ts initDatabase，此处不再重复建表，避免双定义 schema 冲突）
  console.log('📝 检查audit_logs表...');
  try {
    const r = await query(`SELECT to_regclass('public.audit_logs') AS t`);
    if (r.rows[0]?.t) {
      console.log('  ✅ audit_logs 表已存在（由 db.ts 统一创建）');
    } else {
      console.warn('  ⚠️ audit_logs 表不存在，请启动一次服务端由 db.ts initDatabase 自动创建');
    }
  } catch (error) {
    console.error('  ❌ 检查audit_logs表失败:', error.message);
  }

  console.log('');

  // 8. 创建ip_blacklist表（IP黑名单）
  console.log('📝 创建ip_blacklist表...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ip_blacklist (
        id SERIAL PRIMARY KEY,
        ip_address VARCHAR(45) NOT NULL,
        reason TEXT,
        added_by UUID,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  ✅ 创建ip_blacklist表');

    // 创建索引
    await query(`CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip_address ON ip_blacklist(ip_address)`);
    console.log('  ✅ 创建索引');
  } catch (error) {
    console.error('  ❌ 创建ip_blacklist表失败:', error.message);
  }

  console.log('');
  console.log('✅ 数据库迁移完成！\n');

  // 显示表列表
  console.log('📋 迁移的表:');
  console.log('  1. users - 添加了email_verify_token, email_verify_expires, password_changed_at, failed_login_attempts, locked_until字段');
  console.log('  2. password_resets - 密码重置令牌表');
  console.log('  3. login_logs - 登录日志表');
  console.log('  4. user_devices - 用户设备管理表');
  console.log('  5. api_key_usage_log - API Key使用日志表');
  console.log('  6. user_invites - 用户邀请表');
  console.log('  7. audit_logs - 审计日志表');
  console.log('  8. ip_blacklist - IP黑名单表');

  console.log('\n🎉 迁移成功完成！');

} catch (error) {
  console.error('❌ 迁移失败:', error);
  process.exit(1);
}
