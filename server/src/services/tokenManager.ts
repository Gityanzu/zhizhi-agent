/**
 * Token 管理服务
 * 处理 Token 刷新和撤销
 */

import { query } from '../db';
import crypto from 'crypto';
import { resolveSecret } from '../utils/devSecret';

// 与 services/auth.ts 共用同一密钥来源（环境变量或本机持久化密钥）
const JWT_SECRET = resolveSecret('JWT_SECRET', 'jwt');
const ACCESS_TOKEN_EXPIRES_IN = 15 * 60 * 1000; // 15 分钟
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 天
const PASSWORD_RESET_TOKEN_EXPIRES_IN = 60 * 60 * 1000; // 1 小时

// Token 黑名单（内存缓存 + 数据库持久化）
const tokenBlacklistCache = new Map<string, number>();

/**
 * 生成访问Token
 * @param userId - 用户ID
 * @param username - 用户名
 * @returns Token字符串
 */
export function generateAccessToken(userId: string, username: string): string {
  return generateToken(userId, username, 'access');
}

/**
 * 生成刷新Token
 * @param userId - 用户ID
 * @param username - 用户名
 * @returns Token字符串
 */
export function generateRefreshToken(userId: string, username: string): string {
  return generateToken(userId, username, 'refresh');
}

/**
 * 生成JWT Token
 * @param userId - 用户ID
 * @param username - 用户名
 * @param type - Token类型
 * @returns Token字符串
 */
function generateToken(userId: string, username: string, type: 'access' | 'refresh'): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    userId,
    username,
    type,
    iat: Date.now(),
    exp: Date.now() + (type === 'access' ? ACCESS_TOKEN_EXPIRES_IN : REFRESH_TOKEN_EXPIRES_IN)
  }));
  const signature = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.${signature}`;
}

/**
 * 验证Token
 * @param token - Token字符串
 * @returns Token信息或null
 */
export function verifyToken(token: string): { userId: string; username: string; type: 'access' | 'refresh' } | null {
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

    if (!data.userId || !data.username || !data.type) {
      return null;
    }

    return {
      userId: data.userId,
      username: data.username,
      type: data.type
    };
  } catch {
    return null;
  }
}

/**
 * 将 Token 加入黑名单
 * @param token - Token 字符串
 * @param expiresInMs - 过期时间（毫秒）
 */
export async function addToTokenBlacklist(token: string, expiresInMs: number): Promise<void> {
  const expiresAt = Date.now() + expiresInMs;
  tokenBlacklistCache.set(token, expiresAt);
  
  // 同时存入数据库持久化
  try {
    const tokenHash = hashToken(token);
    await query(
      `INSERT INTO tokens (id, token_type, token_hash, expires_at, revoked_at)
       VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL $3 milliseconds, NOW())
       ON CONFLICT (token_hash) DO UPDATE SET revoked_at = NOW()`,
      ['blacklisted', tokenHash, expiresInMs.toString()]
    );
  } catch (error) {
    console.error('Token 加入黑名单失败:', error);
  }
  
  console.log(`Token 已加入黑名单：${token.substring(0, 20)}...`);
}

/**
 * 检查 Token 是否在黑名单中
 * @param token - Token 字符串
 * @returns 是否在黑名单中
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const expiresAt = tokenBlacklistCache.get(token);
  if (!expiresAt) {
    // 检查数据库
    try {
      const tokenHash = hashToken(token);
      const result = await query(
        'SELECT id FROM tokens WHERE token_hash = $1 AND revoked_at IS NOT NULL AND expires_at > NOW()',
        [tokenHash]
      );
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  if (Date.now() > expiresAt) {
    tokenBlacklistCache.delete(token);
    return false;
  }

  return true;
}

/**
 * 刷新 Token
 * @param refreshToken - 刷新 Token
 * @returns 新的访问 Token
 */
export async function refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    // 检查是否在黑名单
    const isBlacklisted = await isTokenBlacklisted(refreshToken);
    if (isBlacklisted) {
      return null;
    }

    // 验证刷新 Token
    const decoded = verifyToken(refreshToken);
    if (!decoded || decoded.type !== 'refresh') {
      return null;
    }

    // 检查用户是否存在且状态正常
    const { query } = await import('../db');
    const userResult = await query(
      'SELECT id, username, status FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    const user = userResult.rows[0];
    if (user.status !== 'active') {
      return null;
    }

    // 生成新的访问 Token
    const newAccessToken = generateAccessToken(user.id, user.username);

    // 记录审计日志
    const { logAuditEvent } = await import('./auth');
    await logAuditEvent({
      userId: user.id,
      username: user.username,
      action: 'token_refresh',
      details: { refreshToken: '***' }
    });

    return {
      accessToken: newAccessToken,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN / 1000 // 转换为秒
    };
  } catch (error) {
    console.error('Token 刷新失败:', error);
    return null;
  }
}

/**
 * 登出
 * @param token - 访问 Token
 * @returns 是否成功
 */
export async function logout(token: string): Promise<boolean> {
  try {
    // 将访问 Token 加入黑名单
    const decoded = verifyToken(token);
    if (decoded && decoded.type === 'access') {
      const tokenParts = token.split('.');
      const payload = JSON.parse(base64UrlDecode(tokenParts[1]));
      const expiresAt = payload.exp * 1000; // 转换为毫秒
      await addToTokenBlacklist(token, expiresAt - Date.now());
    }

    // 记录登出日志
    const { logLoginEvent } = await import('./loginLogger');
    await logLoginEvent({
      status: 'failed',
      username: decoded?.username || 'unknown',
      ipAddress: 'unknown',
      userAgent: 'unknown'
    });

    return true;
  } catch (error) {
    console.error('登出失败:', error);
    return false;
  }
}

/**
 * 保存刷新令牌到数据库
 */
export async function saveRefreshToken(userId: string, token: string, expiresInMs: number): Promise<void> {
  try {
    const tokenHash = hashToken(token);
    await query(
      `INSERT INTO tokens (id, user_id, token_type, token_hash, expires_at)
       VALUES ($1, $2, 'refresh', $3, NOW() + INTERVAL $4 milliseconds)
       ON CONFLICT (token_hash) DO UPDATE SET expires_at = NOW() + INTERVAL $4 milliseconds`,
      [userId, tokenHash, expiresInMs.toString()]
    );
  } catch (error) {
    console.error('保存刷新令牌失败:', error);
  }
}

/**
 * 验证刷新令牌
 */
export async function validateRefreshToken(token: string): Promise<{ userId: string } | null> {
  try {
    const tokenHash = hashToken(token);
    const result = await query(
      `SELECT user_id FROM tokens 
       WHERE token_hash = $1 
       AND token_type = 'refresh' 
       AND expires_at > NOW() 
       AND revoked_at IS NULL`,
      [tokenHash]
    );
    
    if (result.rows.length > 0) {
      return { userId: result.rows[0].user_id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 撤销刷新令牌
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const tokenHash = hashToken(token);
    await query(
      `UPDATE tokens SET revoked_at = NOW() WHERE token_hash = $1 AND token_type = 'refresh'`,
      [tokenHash]
    );
  } catch (error) {
    console.error('撤销刷新令牌失败:', error);
  }
}

/**
 * 生成密码重置令牌
 */
export async function generatePasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  
  try {
    await query(
      `INSERT INTO tokens (id, user_id, token_type, token_hash, expires_at)
       VALUES (gen_random_uuid(), $1, 'password_reset', $2, NOW() + INTERVAL '1 hour')
       ON CONFLICT (token_hash) DO UPDATE SET expires_at = NOW() + INTERVAL '1 hour'`,
      [userId, tokenHash]
    );
  } catch (error) {
    console.error('生成密码重置令牌失败:', error);
    throw new Error('生成重置令牌失败');
  }
  
  return token;
}

/**
 * 验证密码重置令牌
 */
export async function validatePasswordResetToken(token: string): Promise<{ userId: string } | null> {
  try {
    const tokenHash = hashToken(token);
    const result = await query(
      `SELECT user_id FROM tokens 
       WHERE token_hash = $1 
       AND token_type = 'password_reset' 
       AND expires_at > NOW() 
       AND revoked_at IS NULL`,
      [tokenHash]
    );
    
    if (result.rows.length > 0) {
      return { userId: result.rows[0].user_id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 使用并删除密码重置令牌
 */
export async function consumePasswordResetToken(token: string): Promise<void> {
  try {
    const tokenHash = hashToken(token);
    await query(
      `DELETE FROM tokens WHERE token_hash = $1 AND token_type = 'password_reset'`,
      [tokenHash]
    );
  } catch (error) {
    console.error('消耗重置令牌失败:', error);
  }
}

/**
 * Token 哈希（安全存储）
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 清理过期的令牌（定期任务）
 */
export async function cleanupExpiredTokensFromDB(): Promise<void> {
  try {
    const result = await query(
      `DELETE FROM tokens WHERE expires_at < NOW() OR (revoked_at IS NOT NULL AND expires_at < NOW() + INTERVAL '1 day')`
    );
    console.log(`数据库清理了 ${result.rowCount} 个过期的令牌`);
    
    // 同时清理内存缓存
    const now = Date.now();
    for (const [token, expiresAt] of tokenBlacklistCache.entries()) {
      if (now > expiresAt) {
        tokenBlacklistCache.delete(token);
      }
    }
  } catch (error) {
    console.error('清理过期令牌失败:', error);
  }
}

// 工具函数
function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}
