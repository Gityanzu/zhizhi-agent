/**
 * Redis 缓存服务
 * 提供高性能的数据缓存、会话存储和限流功能
 */

import Redis from 'ioredis';
import { query } from '../db';

// ==================== 类型定义 ====================

/**
 * Redis 配置接口
 */
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

/**
 * 缓存值类型（支持任意对象，包括数组、字符串、null、undefined）
 */
interface CacheValue {
  [key: string]: unknown;
  [key: number]: unknown;
}

// 允许基本类型作为缓存值
export type CacheValueType = string | number | boolean | null | undefined | object | Array<unknown>;

/**
 * 会话数据结构
 */
interface SessionData {
  session_id: string;
  user_id: string;
  created_at: number;
  last_access: number;
}

/**
 * 模板项接口
 */
interface TemplateItem {
  id?: string | number;
  name: string;
  description?: string;
  content?: string;
  [key: string]: unknown;
}

/**
 * 用户记录接口
 */
interface UserRecord {
  id?: string | number;
  username: string;
  email: string;
  [key: string]: unknown;
}

/**
 * 自定义错误类
 */
class CacheError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'CacheError';
  }
}

// ==================== Redis 状态管理 ====================

/**
 * Redis 实例和配置状态（使用 const + 对象封装）
 */
const redisState = {
  instance: null as Redis | null,
  config: null as RedisConfig | null
};

// 默认配置
const DEFAULT_CONFIG: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
};

// 初始化 Redis 连接
export function initRedis(): boolean {
  const config = DEFAULT_CONFIG;
  
  if (!config.host || config.host === 'localhost') {
    console.warn('⚠️  Redis 未配置，将使用内存缓存');
    return false;
  }

  // 更新状态
  redisState.config = config;
  
  redisState.instance = new Redis({
    host: config.host,
    port: config.port,
    password: config.password || undefined,
    db: config.db,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`🔄 Redis 重连尝试 ${times}，延迟 ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  // 监听事件
  redisState.instance.on('connect', () => {
    console.log('✅ Redis 连接已建立');
  });

  redisState.instance.on('error', (error: Error) => {
    console.error('❌ Redis 错误:', error.message);
  });

  redisState.instance.on('reconnecting', () => {
    console.log('🔄 Redis 正在重连...');
  });

  redisState.instance.on('close', () => {
    console.log('🔴 Redis 连接已关闭');
  });

  // 测试连接
  redisState.instance.ping().then((response) => {
    if (!response) {
      console.warn('⚠️  Redis 连接失败，将使用内存缓存降级');
      redisState.instance = null;
      return;
    }
    
    if (response === 'PONG') {
      console.log('✅ Redis 服务正常响应');
    }
  });

  return true;
}

/**
 * 获取 Redis 实例（懒加载）
 * @returns Redis 实例或 null
 */
function getRedis(): Redis | null {
  if (!redisState.instance && redisState.config) {
    try {
      initRedis();
    } catch (error) {
      console.error('初始化 Redis 失败:', error);
      return null;
    }
  }
  return redisState.instance;
}

// ==================== 通用缓存方法 ====================

/**
 * 设置缓存
 * @param key 缓存键（必须是非空字符串，不能包含 null 字符）
 * @param value 缓存值（会被 JSON.stringify）
 * @param expiresSeconds 过期时间（秒），0 表示永不过期
 * @throws {CacheError} 当参数无效时抛出错误
 */
export async function setCache(
  key: string, 
  value: CacheValueType, 
  expiresSeconds: number = 3600
): Promise<boolean> {
  // 输入验证
  if (!key || typeof key !== 'string') {
    throw new CacheError('INVALID_KEY', 'Key must be a non-empty string');
  }
  
  if (key.includes('\0')) {
    throw new CacheError('INVALID_KEY', 'Key cannot contain null characters');
  }
  
  if (expiresSeconds < 0) {
    throw new CacheError('INVALID_EXPIRES', 'Expires seconds must be non-negative');
  }

  const r = getRedis();
  if (!r) {
    console.debug(`[Memory Cache] Set: ${key}`);
    return true;
  }

  try {
    const serialized = JSON.stringify(value);
    
    if (expiresSeconds > 0) {
      await r.setex(key, expiresSeconds, serialized);
    } else {
      await r.set(key, serialized);
    }
    
    return true;
  } catch (error) {
    const cacheError = new CacheError(
      'CACHE_SET_FAILED',
      `Failed to set cache for key: ${key}`,
      { originalError: error }
    );
    console.error(cacheError);
    throw cacheError;
  }
}

/**
 * 获取缓存
 * @param key 缓存键
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) {
    console.debug(`[Memory Cache] Get: ${key}`);
    return null;
  }

  try {
    const value = await r.get(key);
    if (!value) return null;
    
    return JSON.parse(value) as T;
  } catch (error) {
    console.error('获取缓存失败:', error);
    return null;
  }
}

/**
 * 删除缓存
 * @param key 缓存键
 */
export async function deleteCache(key: string): Promise<boolean> {
  const r = getRedis();
  if (!r) {
    console.debug(`[Memory Cache] Delete: ${key}`);
    return true;
  }

  try {
    await r.del(key);
    return true;
  } catch (error) {
    console.error('删除缓存失败:', error);
    return false;
  }
}

/**
 * 检查键是否存在
 * @param key 缓存键
 */
export async function existsCache(key: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;

  try {
    const result = await r.exists(key);
    return result > 0;
  } catch (error) {
    console.error('检查键存在失败:', error);
    return false;
  }
}

/**
 * 设置缓存过期时间
 * @param key 缓存键
 * @param expiresSeconds 过期时间（秒）
 */
export async function expireCache(key: string, expiresSeconds: number): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;

  try {
    await r.expire(key, expiresSeconds);
    return true;
  } catch (error) {
    console.error('设置过期时间失败:', error);
    return false;
  }
}

// ==================== 会话缓存 ====================

/**
 * 创建会话
 * @param sessionId 会话 ID
 * @param userId 用户 ID
 * @param expiresSeconds 过期时间（秒）
 */
export async function createSession(
  sessionId: string, 
  userId: string,
  expiresSeconds: number = 86400 // 24 小时
): Promise<boolean> {
  const data = {
    session_id: sessionId,
    user_id: userId,
    created_at: Date.now(),
    last_access: Date.now(),
  };

  return await setCache(`session:${sessionId}`, data, expiresSeconds);
}

/**
 * 获取会话信息
 * @param sessionId 会话 ID
 * @returns 会话数据或 null
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
  const session = await getCache<SessionData>(`session:${sessionId}`);
  
  if (session) {
    // 更新最后访问时间
    session.last_access = Date.now();
    await setCache(`session:${sessionId}`, session, 86400);
  }
  
  return session;
}

/**
 * 更新会话
 * @param sessionId 会话 ID
 * @param updates 更新字段
 * @throws {CacheError} 当会话不存在时抛出错误
 */
export async function updateSession(
  sessionId: string, 
  updates: Partial<SessionData>
): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) throw new CacheError('SESSION_NOT_FOUND', `Session ${sessionId} not found`);

  const updated = { ...session, ...updates, last_access: Date.now() } as SessionData;
  return await setCache(`session:${sessionId}`, updated, 86400);
}

/**
 * 删除会话
 * @param sessionId 会话 ID
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  return await deleteCache(`session:${sessionId}`);
}

/**
 * 验证会话是否有效
 * @param sessionId 会话 ID
 */
export async function validateSession(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  return session !== null;
}

// ==================== 限流功能 ====================

interface RateLimitConfig {
  windowMs: number;        // 时间窗口（毫秒）
  maxRequests: number;     // 最大请求数
  keyPrefix: string;       // 键前缀
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60000,         // 1 分钟
  maxRequests: 100,        // 100 次请求
  keyPrefix: 'rate_limit',
};

/**
 * 检查限流
 * @param identifier 标识符（IP、用户 ID 等）
 * @param config 配置选项
 */
export async function checkRateLimit(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const { windowMs = DEFAULT_RATE_LIMIT.windowMs, maxRequests = DEFAULT_RATE_LIMIT.maxRequests, keyPrefix = DEFAULT_RATE_LIMIT.keyPrefix } = config;
  
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const r = getRedis();
  
  if (!r) {
    // 降级模式：允许所有请求
    return { allowed: true, remaining: maxRequests, resetAt: now + windowMs };
  }

  try {
    // 移除窗口外的旧请求记录：
    // - sorted set 按分数（时间戳）自动排序
    // - zremrangebyscore 删除 windowMs 之前的所有记录
    // - 保留当前时间窗口内的所有请求
    await r.zremrangebyscore(key, 0, windowStart);
    
    const currentCount = await r.zcard(key);
    
    if (currentCount >= maxRequests) {
      // 超出限制
      const oldest = await r.zscore(key, currentCount.toString());
      const resetAt = oldest ? Number(oldest) + windowMs : now + windowMs;
      
      return {
        allowed: false,
        remaining: 0,
        resetAt
      };
    }

    // 添加当前请求时间戳
    await r.zadd(key, now, `${now}:${Math.random()}`);
    await r.expire(key, Math.ceil(windowMs / 1000) + 1);
    
    const remaining = maxRequests - currentCount - 1;
    const resetAt = now + windowMs;

    return {
      allowed: true,
      remaining,
      resetAt
    };
  } catch (error) {
    console.error('限流检查失败:', error);
    // 出错时允许访问（安全优先）
    return { allowed: true, remaining: maxRequests, resetAt: now + windowMs };
  }
}

/**
 * 重置限流计数器
 * @param identifier 标识符
 */
export async function resetRateLimit(identifier: string): Promise<boolean> {
  return await deleteCache(`${DEFAULT_RATE_LIMIT.keyPrefix}:${identifier}`);
}

// ==================== 分布式锁 ====================

interface LockConfig {
  timeoutMs: number;      // 锁超时时间（毫秒）
  retryTimes: number;     // 重试次数
  retryInterval: number;  // 重试间隔（毫秒）
}

const DEFAULT_LOCK_CONFIG: LockConfig = {
  timeoutMs: 5000,        // 5 秒超时
  retryTimes: 3,
  retryInterval: 100,
};

/**
 * 获取分布式锁
 * @param lockName 锁名称
 * @param config 配置选项
 */
export async function acquireLock(
  lockName: string,
  config: Partial<LockConfig> = {}
): Promise<string | null> {
  const { timeoutMs = DEFAULT_LOCK_CONFIG.timeoutMs, retryTimes = DEFAULT_LOCK_CONFIG.retryTimes, retryInterval = DEFAULT_LOCK_CONFIG.retryInterval } = config;
  
  const lockKey = `lock:${lockName}`;
  const lockValue = `${Date.now()}:${Math.random().toString(36).substring(2)}`;
  const expiration = Math.floor(timeoutMs / 1000);

  const r = getRedis();
  
  if (!r) {
    // 降级：直接返回成功（无锁）
    return 'no-lock';
  }

  try {
    // 尝试设置锁（NX = 仅当不存在时设置）
    const acquired = await r.set(lockKey, lockValue, 'EX', expiration, 'NX');
    
    if (acquired) {
      return lockValue;
    }

    // 重试逻辑
    for (let i = 0; i < retryTimes; i++) {
      await new Promise(resolve => setTimeout(resolve, retryInterval));
      
      const tried = await r.set(lockKey, lockValue, 'EX', expiration, 'NX');
      if (tried) {
        return lockValue;
      }
    }

    return null; // 获取锁失败
  } catch (error) {
    console.error('获取分布式锁失败:', error);
    return null;
  }
}

/**
 * 释放分布式锁
 * @param lockName 锁名称
 * @param lockValue 锁值（必须匹配）
 */
export async function releaseLock(
  lockName: string, 
  lockValue: string
): Promise<boolean> {
  const lockKey = `lock:${lockName}`;
  const r = getRedis();
  
  if (!r) return true;

  try {
    // 使用 Lua 脚本保证原子性
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await r.eval(script, 1, lockKey, lockValue);
    return result === 1;
  } catch (error) {
    console.error('释放锁失败:', error);
    return false;
  }
}

/**
 * 扩展锁的过期时间（续期）
 * @param lockName 锁名称
 * @param lockValue 锁值
 * @param additionalMs 额外时间（毫秒）
 */
export async function extendLock(
  lockName: string,
  lockValue: string,
  additionalMs: number = 5000
): Promise<boolean> {
  const lockKey = `lock:${lockName}`;
  const r = getRedis();
  
  if (!r) return true;

  try {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    
    const result = await r.eval(script, 1, lockKey, lockValue, Math.floor(additionalMs / 1000));
    return result === 1;
  } catch (error) {
    console.error('扩展锁失败:', error);
    return false;
  }
}

// ==================== 数据缓存示例 ====================

/**
 * 缓存模板列表
 * @param templates 模板数组
 */
export async function cacheTemplates(templates: TemplateItem[]) {
  await setCache('templates:list', { items: templates }, 300); // 5 分钟
}

/**
 * 获取缓存的模板列表
 * @returns 模板数组或 null
 */
export async function getCachedTemplates(): Promise<TemplateItem[] | null> {
  const result = await getCache<{ items: TemplateItem[] }>('templates:list');
  return result?.items || null;
}

/**
 * 清除模板缓存
 */
export async function invalidateTemplatesCache() {
  await deleteCache('templates:list');
}

/**
 * 缓存用户信息
 * @param userId 用户 ID
 * @param userData 用户数据
 */
export async function cacheUser(userId: string, userData: UserRecord) {
  await setCache(`user:${userId}`, userData, 1800); // 30 分钟
}

/**
 * 获取缓存的用户信息
 * @param userId 用户 ID
 * @returns 用户记录或 null
 */
export async function getCachedUser(userId: string): Promise<UserRecord | null> {
  return await getCache<UserRecord>(`user:${userId}`);
}

/**
 * 清除用户缓存
 */
export async function invalidateUserCache(userId: string) {
  await deleteCache(`user:${userId}`);
}

// ==================== 工具方法 ====================

/**
 * 清空所有缓存（开发/调试用）
 */
export async function flushAll(): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;

  try {
    await r.flushdb();
    console.log('✅ 缓存已清空');
    return true;
  } catch (error) {
    console.error('清空缓存失败:', error);
    return false;
  }
}

/**
 * 检查 Redis 连接状态
 * @returns true 如果 Redis 可用，否则 false
 */
export function isRedisAvailable(): boolean {
  return redisState.instance !== null;
}

/**
 * 关闭 Redis 连接（带异常处理）
 */
export async function closeRedis(): Promise<void> {
  if (redisState.instance) {
    try {
      await redisState.instance.quit();
      console.log('🔴 Redis 连接已关闭');
    } catch (error) {
      console.error('关闭 Redis 连接失败:', error);
      // 即使关闭失败也要清空引用
      redisState.instance = null;
    }
  }
}

export default {
  // 初始化
  initRedis,
  isRedisAvailable,
  closeRedis,
  
  // 通用缓存
  setCache,
  getCache,
  deleteCache,
  existsCache,
  expireCache,
  
  // 会话管理
  createSession,
  getSession,
  updateSession,
  deleteSession,
  validateSession,
  
  // 限流
  checkRateLimit,
  resetRateLimit,
  
  // 分布式锁
  acquireLock,
  releaseLock,
  extendLock,
  
  // 数据缓存
  cacheTemplates,
  getCachedTemplates,
  invalidateTemplatesCache,
  cacheUser,
  getCachedUser,
  invalidateUserCache,
  
  // 工具
  flushAll,
};
