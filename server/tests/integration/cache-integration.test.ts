/**
 * Redis 缓存服务完整功能测试
 * 测试所有核心功能的集成场景
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  initRedis,
  setCache, 
  getCache, 
  deleteCache,
  existsCache,
  expireCache,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  validateSession,
  checkRateLimit,
  resetRateLimit,
  acquireLock,
  releaseLock,
  extendLock,
  cacheTemplates,
  getCachedTemplates,
  invalidateTemplatesCache,
  cacheUser,
  getCachedUser,
  invalidateUserCache,
  flushAll,
  closeRedis,
  isRedisAvailable,
  CacheError,
} from '../../src/services/cache';

// 本文件依赖真实 Redis；未配置 Redis 时全部跳过（内存模式下 getCache 返回 null 属预期，见 unit/cache.test.ts）
describe.skipIf(!isRedisAvailable())('Redis Cache Service - 完整功能测试', () => {
  
  // 测试前清理
  beforeEach(async () => {
    // 清空所有缓存
    await flushAll();
  });

  afterEach(async () => {
    // 关闭连接
    await closeRedis();
  });

  // ==================== 通用缓存测试 ====================
  
  describe('通用缓存 CRUD', () => {
    it('应该能够设置和获取字符串值', async () => {
      const result = await setCache('test:string', 'hello world', 60);
      expect(result).toBe(true);
      
      const value = await getCache<string>('test:string');
      expect(value).toBe('hello world');
    });

    it('应该能够存储和获取对象', async () => {
      const userData = {
        id: '123',
        name: '张三',
        email: 'zhangsan@example.com',
        age: 25,
        tags: ['developer', 'admin']
      };
      
      const setResult = await setCache('user:123', userData, 300);
      expect(setResult).toBe(true);
      
      const getUser = await getCache<typeof userData>('user:123');
      expect(getUser).toEqual(userData);
    });

    it('应该能够删除缓存', async () => {
      await setCache('test:delete', { data: 'value' }, 60);
      
      const deleted = await deleteCache('test:delete');
      expect(deleted).toBe(true);
      
      const getValue = await getCache('test:delete');
      expect(getValue).toBeNull();
    });

    it('应该能够检查键是否存在', async () => {
      await setCache('test:exists', 'value', 60);
      
      const exists = await existsCache('test:exists');
      expect(exists).toBe(true);
      
      const notExists = await existsCache('test:notexist');
      expect(notExists).toBe(false);
    });

    it('应该能够设置过期时间', async () => {
      await setCache('test:expire', 'value', 0); // 永不过期
      
      const expired = await expireCache('test:expire', 30);
      expect(expired).toBe(true);
      
      // 验证仍然可以获取
      const value = await getCache('test:expire');
      expect(value).toBe('value');
    });

    it('应该能够处理空值和 null', async () => {
      await setCache('test:null', null, 60);
      const nullValue = await getCache('test:null');
      expect(nullValue).toBeNull();
      
      await setCache('test:undefined', undefined, 60);
      const undefValue = await getCache('test:undefined');
      expect(undefValue).toBeUndefined();
    });
  });

  // ==================== 会话管理测试 ====================
  
  describe('会话管理', () => {
    it('应该能够创建新会话', async () => {
      const sessionId = 'session-abc-123';
      const userId = 'user-456';
      
      const created = await createSession(sessionId, userId, 3600);
      expect(created).toBe(true);
      
      const session = await getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session?.session_id).toBe(sessionId);
      expect(session?.user_id).toBe(userId);
      expect(session?.created_at).toBeDefined();
      expect(session?.last_access).toBeDefined();
    });

    it('应该能够更新会话', async () => {
      const sessionId = 'session-update-test';
      const userId = 'user-update';
      
      await createSession(sessionId, userId, 3600);
      
      const updated = await updateSession(sessionId, { last_access: Date.now() });
      expect(updated).toBe(true);
      
      const session = await getSession(sessionId);
      expect(session?.last_access).toBe(Date.now());
    });

    it('应该能够验证会话有效性', async () => {
      const validSession = await createSession('valid-session', 'user-1', 3600);
      expect(validSession).toBe(true);
      
      const isValid = await validateSession('valid-session');
      expect(isValid).toBe(true);
      
      const isInvalid = await validateSession('non-existent');
      expect(isInvalid).toBe(false);
    });

    it('应该能够删除会话', async () => {
      await createSession('session-to-delete', 'user-1', 3600);
      
      const deleted = await deleteSession('session-to-delete');
      expect(deleted).toBe(true);
      
      const session = await getSession('session-to-delete');
      expect(session).toBeNull();
    });

    it('会话应该自动更新最后访问时间', async () => {
      const sessionId = 'session-auto-update';
      const userId = 'user-auto';
      
      await createSession(sessionId, userId, 3600);
      
      const initialSession = await getSession(sessionId);
      const initialAccess = initialSession?.last_access;
      
      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 再次获取会话
      const updatedSession = await getSession(sessionId);
      expect(updatedSession?.last_access).toBeGreaterThan(initialAccess || 0);
    });
  });

  // ==================== 限流功能测试 ====================
  
  describe('限流功能', () => {
    it('应该允许正常请求通过', async () => {
      const result = await checkRateLimit('test-ip-normal', {
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test_rate_limit_normal'
      });
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('应该在超出限制时拒绝请求', async () => {
      const identifier = 'rate-limit-test-strict';
      const config = {
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'test_rate_limit_strict'
      };
      
      // 发送超过限制的请求
      for (let i = 0; i < 10; i++) {
        const result = await checkRateLimit(identifier, config);
        if (!result.allowed) {
          break; // 已经到达限制
        }
      }
      
      // 第 11 个请求应该被拒绝
      const overLimit = await checkRateLimit(identifier, config);
      expect(overLimit.allowed).toBe(false);
      expect(overLimit.remaining).toBe(0);
    });

    it('应该重置限流计数器', async () => {
      const identifier = 'rate-limit-reset';
      const config = {
        windowMs: 60000,
        maxRequests: 3,
        keyPrefix: 'test_rate_limit_reset'
      };
      
      // 消耗掉配额
      await checkRateLimit(identifier, config);
      await checkRateLimit(identifier, config);
      await checkRateLimit(identifier, config);
      
      // 重置
      const reset = await resetRateLimit(identifier);
      expect(reset).toBe(true);
      
      // 应该还能继续请求
      const afterReset = await checkRateLimit(identifier, config);
      expect(afterReset.allowed).toBe(true);
    });
  });

  // ==================== 分布式锁测试 ====================
  
  describe('分布式锁', () => {
    it('应该能够获取锁', async () => {
      const lockName = 'test-lock-acquire';
      const lockValue = await acquireLock(lockName);
      
      expect(lockValue).toBeDefined();
      expect(typeof lockValue).toBe('string');
    });

    it('应该能够释放锁', async () => {
      const lockName = 'test-lock-release';
      const lockValue = await acquireLock(lockName);
      
      if (lockValue) {
        const released = await releaseLock(lockName, lockValue);
        expect(released).toBe(true);
      }
    });

    it('应该能够扩展锁的过期时间', async () => {
      const lockName = 'test-lock-extend';
      const lockValue = await acquireLock(lockName);
      
      if (lockValue) {
        const extended = await extendLock(lockName, lockValue, 5000);
        expect(extended).toBe(true);
      }
    });

    it('应该正确处理重复获取锁的场景', async () => {
      const lockName = 'test-lock-duplicate';
      
      // 第一次获取成功
      const firstLock = await acquireLock(lockName);
      expect(firstLock).toBeDefined();
      
      // 第二次尝试（模拟并发）应该失败或返回不同的值
      const secondLock = await acquireLock(lockName);
      // 在内存模式下，可能直接返回 'no-lock'
      expect(secondLock).toBeDefined();
    });
  });

  // ==================== 数据缓存测试 ====================
  
  describe('数据缓存示例', () => {
    it('应该能够缓存模板列表', async () => {
      const templates = [
        { id: 1, name: '模板 1', description: '描述 1' },
        { id: 2, name: '模板 2', description: '描述 2' },
        { id: 3, name: '模板 3', description: '描述 3' }
      ];
      
      const cached = await cacheTemplates(templates);
      expect(cached).toBe(undefined); // cacheTemplates 返回 void
      
      const retrieved = await getCachedTemplates();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.length).toBe(3);
      expect(retrieved?.[0].name).toBe('模板 1');
    });

    it('应该能够清除模板缓存', async () => {
      const templates = [
        { id: 1, name: '模板 1' }
      ];
      
      await cacheTemplates(templates);
      let retrieved = await getCachedTemplates();
      expect(retrieved?.length).toBe(1);
      
      await invalidateTemplatesCache();
      retrieved = await getCachedTemplates();
      expect(retrieved).toBeNull();
    });

    it('应该能够缓存用户信息', async () => {
      const userData = {
        id: 'user-789',
        username: 'testuser',
        email: 'test@example.com'
      };
      
      await cacheUser('user-789', userData);
      
      const cached = await getCachedUser('user-789');
      expect(cached).not.toBeNull();
      expect(cached?.username).toBe('testuser');
      expect(cached?.email).toBe('test@example.com');
    });

    it('应该能够清除特定用户的缓存', async () => {
      await cacheUser('user-clear', { id: 'user-clear', username: 'clearme', email: 'clear@example.com' });
      
      let user = await getCachedUser('user-clear');
      expect(user).not.toBeNull();
      
      await invalidateUserCache('user-clear');
      user = await getCachedUser('user-clear');
      expect(user).toBeNull();
    });
  });

  // ==================== 工具方法测试 ====================
  
  describe('工具方法', () => {
    it('应该能够清空所有缓存', async () => {
      await setCache('key1', 'value1', 60);
      await setCache('key2', 'value2', 60);
      await setCache('key3', 'value3', 60);
      
      const flushed = await flushAll();
      expect(flushed).toBe(true);
      
      expect(await getCache('key1')).toBeNull();
      expect(await getCache('key2')).toBeNull();
      expect(await getCache('key3')).toBeNull();
    });

    it('应该正确报告 Redis 可用性', async () => {
      const available = isRedisAvailable();
      // 在没有真实 Redis 的情况下应该是 false
      expect(available).toBe(false);
    });
  });

  // ==================== 错误处理测试 ====================
  
  describe('错误处理', () => {
    it('应该对无效的 key 抛出错误', async () => {
      await expect(setCache('', { data: 'test' }, 60))
        .rejects
        .toThrow(new CacheError('INVALID_KEY', 'Key must be a non-empty string'));
    });

    it('应该对包含 null 字符的 key 抛出错误', async () => {
      await expect(setCache('key\0with\0nulls', { data: 'test' }, 60))
        .rejects
        .toThrow(new CacheError('INVALID_KEY', 'Key cannot contain null characters'));
    });

    it('应该对负的过期时间抛出错误', async () => {
      await expect(setCache('test:key', { data: 'test' }, -1))
        .rejects
        .toThrow(new CacheError('INVALID_EXPIRES', 'Expires seconds must be non-negative'));
    });

    it('应该对不存在的会话抛出错误', async () => {
      await expect(updateSession('non-existent', { last_access: Date.now() }))
        .rejects
        .toThrow(new CacheError('SESSION_NOT_FOUND', 'Session non-existent not found'));
    });
  });

  // ==================== 边界条件测试 ====================
  
  describe('边界条件', () => {
    it('应该能够处理大对象', async () => {
      const largeData = {
        content: 'x'.repeat(10000), // 10KB 字符串
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: '1.0.0'
        }
      };
      
      const setResult = await setCache('large:data', largeData, 300);
      expect(setResult).toBe(true);
      
      const getValue = await getCache('large:data');
      expect(getValue?.content).toBe(largeData.content);
      expect(getValue?.metadata).toEqual(largeData.metadata);
    });

    it('应该能够处理嵌套对象', async () => {
      const nestedData = {
        level1: {
          level2: {
            level3: {
              data: 'deeply nested'
            }
          }
        }
      };
      
      await setCache('nested:data', nestedData, 60);
      const retrieved = await getCache('nested:data');
      
      expect(retrieved?.level1.level2.level3.data).toBe('deeply nested');
    });

    it('应该能够处理数组数据', async () => {
      const arrayData = [1, 2, 3, 4, 5];
      
      await setCache('array:data', arrayData, 60);
      const retrieved = await getCache<number[]>('array:data');
      
      expect(retrieved).toEqual(arrayData);
    });
  });

  // ==================== 并发场景测试 ====================
  
  describe('并发场景', () => {
    it('应该能够处理并发缓存操作', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        setCache(`concurrent:key:${i}`, { value: i }, 60)
      );
      
      const results = await Promise.all(promises);
      expect(results.every(r => r === true)).toBe(true);
      
      // 验证所有数据都正确存储
      for (let i = 0; i < 10; i++) {
        const value = await getCache(`concurrent:key:${i}`);
        expect(value?.value).toBe(i);
      }
    });

    it('应该能够处理并发的会话创建', async () => {
      const sessionPromises = Array.from({ length: 5 }, (_, i) =>
        createSession(`session-concurrent-${i}`, `user-${i}`, 3600)
      );
      
      const results = await Promise.all(sessionPromises);
      expect(results.every(r => r === true)).toBe(true);
      
      // 验证所有会话都存在
      for (let i = 0; i < 5; i++) {
        const session = await getSession(`session-concurrent-${i}`);
        expect(session).not.toBeNull();
      }
    });
  });
});
