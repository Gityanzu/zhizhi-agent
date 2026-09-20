import db, { getPool } from '../db';
import crypto from 'crypto';

// JWT 简单实现（不依赖外部库）
const JWT_SECRET = process.env.JWT_SECRET || 'zhizhi-agent-jwt-secret-2026';
const JWT_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7天

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

export function generateToken(userId: string, username: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    userId,
    username,
    iat: Date.now(),
    exp: Date.now() + JWT_EXPIRES_IN
  }));
  const signature = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): { userId: string; username: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (signature !== expectedSignature) return null;
    const data = JSON.parse(base64UrlDecode(payload));
    if (data.exp && Date.now() > data.exp) return null;
    return { userId: data.userId, username: data.username };
  } catch {
    return null;
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

export interface User {
  id: string;
  username: string;
  email: string | null;
  nickname: string | null;
  avatar: string | null;
  role: string;
  status: string;
  created_at: string;
}

export async function register(username: string, password: string, email?: string): Promise<{ user: User; token: string }> {
  const pool = getPool();
  
  // 检查用户名是否已存在
  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    throw new Error('用户名已存在');
  }

  // 检查邮箱是否已存在
  if (email) {
    const emailExisting = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailExisting.rows.length > 0) {
      throw new Error('邮箱已被注册');
    }
  }

  const passwordHash = hashPassword(password);
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, nickname) 
     VALUES ($1, $2, $3, $4) 
     RETURNING id, username, email, nickname, avatar, role, status, created_at`,
    [username, email || null, passwordHash, username]
  );

  const user = result.rows[0] as User;
  const token = generateToken(user.id, user.username);
  return { user, token };
}

export async function login(username: string, password: string): Promise<{ user: User; token: string }> {
  const pool = getPool();
  
  console.log('🔍 [DEBUG] login function called with username:', username);
  
  const result = await pool.query(
    'SELECT id, username, email, password_hash, nickname, avatar, role, status, created_at FROM users WHERE username = $1',
    [username]
  );

  if (result.rows.length === 0) {
    throw new Error('用户名或密码错误');
  }

  const user = result.rows[0];
  
  // 确保 username 字段存在
  if (!user.username) {
    throw new Error('用户名或密码错误');
  }
  
  if (user.status !== 'active') {
    throw new Error('账号已被禁用');
  }

  if (!verifyPassword(password, user.password_hash)) {
    throw new Error('用户名或密码错误');
  }

  const token = generateToken(user.id, user.username);
  const { password_hash, ...userWithoutPassword } = user;
  return { user: userWithoutPassword as User, token };
}

export async function getUserById(userId: string): Promise<User | null> {
  const pool = getPool();
  
  const result = await pool.query(
    'SELECT id, username, email, nickname, avatar, role, status, created_at FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] as User || null;
}

export async function updateProfile(userId: string, data: { nickname?: string; avatar?: string; email?: string }): Promise<User> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.nickname !== undefined) {
    updates.push(`nickname = $${paramIndex++}`);
    values.push(data.nickname);
  }
  if (data.avatar !== undefined) {
    updates.push(`avatar = $${paramIndex++}`);
    values.push(data.avatar);
  }
  if (data.email !== undefined) {
    updates.push(`email = $${paramIndex++}`);
    values.push(data.email);
  }
  updates.push(`updated_at = NOW()`);

  values.push(userId);
  const pool = getPool();
  const result = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
     RETURNING id, username, email, nickname, avatar, role, status, created_at`,
    values
  );
  return result.rows[0] as User;
}

/**
 * 修改密码
 * @param userId - 用户ID
 * @param oldPassword - 旧密码
 * @param newPassword - 新密码
 * @returns 是否成功
 */
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const pool = getPool();
    
    // 获取用户信息
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        success: false,
        message: '用户不存在',
        error: 'User not found'
      };
    }

    const user = userResult.rows[0];

    // 验证旧密码
    if (!verifyPassword(oldPassword, user.password_hash)) {
      return {
        success: false,
        message: '旧密码错误',
        error: 'Old password incorrect'
      };
    }

    // 验证密码强度
    const { validatePasswordStrength } = await import('./passwordStrength');
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return {
        success: false,
        message: '新密码不符合强度要求',
        error: 'Password strength insufficient',
        suggestions: validation.suggestions
      };
    }

    // 检查新密码是否与旧密码相同
    if (oldPassword === newPassword) {
      return {
        success: false,
        message: '新密码不能与旧密码相同',
        error: 'New password cannot be the same as old password'
      };
    }

    // 哈希新密码
    const newPasswordHash = hashPassword(newPassword);

    // 更新密码和修改时间
    await pool.query(
      `UPDATE users
       SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [newPasswordHash, userId]
    );

    // 记录审计日志
    await logAuditEvent({
      userId,
      action: 'password_change',
      resourceType: 'user',
      resourceId: userId,
      details: { reason: 'User changed password' }
    });

    return {
      success: true,
      message: '密码修改成功'
    };
  } catch (error: any) {
    return {
      success: false,
      message: '密码修改失败',
      error: error.message
    };
  }
}

/**
 * 获取用户登录次数统计
 * @param userId - 用户ID
 * @returns 登录统计
 */
export async function getUserLoginStats(userId: string): Promise<any> {
  const pool = getPool();
  
  const result = await pool.query(
    `SELECT
       COUNT(*) as total_logins,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_logins,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_logins,
       MAX(created_at) as last_login_at
     FROM login_logs
     WHERE user_id = $1`,
    [userId]
  );

  const stats = result.rows[0];
  return {
    totalLogins: parseInt(stats.total_logins),
    successLogins: parseInt(stats.success_logins),
    failedLogins: parseInt(stats.failed_logins),
    lastLoginAt: stats.last_login_at || null
  };
}

/**
 * 记录审计日志
 * @param logData - 审计日志数据
 */
export async function logAuditEvent(logData: {
  userId?: string;
  username?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: any;
}): Promise<void> {
  try {
    const pool = getPool();
    
    const result = await pool.query(
      `INSERT INTO audit_logs
       (user_id, username, action, resource_type, resource_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        logData.userId || null,
        logData.username || null,
        logData.action,
        logData.resourceType || null,
        logData.resourceId || null,
        logData.ipAddress || null,
        logData.details || null
      ]
    );
  } catch (error) {
    console.error('记录审计日志失败:', error);
  }
}

