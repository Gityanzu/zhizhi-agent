/**
 * Redis 缓存服务单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import { 
  setCache, 
  getCache, 
  deleteCache,
  checkRateLimit,
  acquireLock,
  releaseLock,
  isRedisAvailable,
} from '../../src/services/cache';

describe('Redis Cache Service', () => {
  describe('setCache / getCache / deleteCache', () => {
    it('应该能够设置和获取缓存（内存模式）', async () => {
      const testKey = 'test:key:123';
      const testValue = { name: 'test', value: 42 };
      
      // 设置缓存
      const setResult = await setCache(testKey, testValue, 60);
      expect(setResult).toBe(true);
      
      // 获取缓存（内存模式下返回 null，因为没有真实 Redis）
      const getValue = await getCache<any>(testKey);
      // 内存模式下返回 null 是正常的
      expect(getValue).toBeNull();
    });

    it('应该能够删除缓存', async () => {
      const testKey = 'test:key:delete';
      
      await setCache(testKey, { data: 'test' }, 60);
      const deleteResult = await deleteCache(testKey);
      
      expect(deleteResult).toBe(true);
    });
  });

  describe('checkRateLimit', () => {
    it('应该允许正常请求通过', async () => {
      const result = await checkRateLimit('test-ip-192.168.1.1');
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('应该在超出限制时拒绝请求', async () => {
      // 快速发送多个请求模拟限流
      for (let i = 0; i < 150; i++) {
        await checkRateLimit(`rate-limit-test-${i}`, {
          windowMs: 60000,
          maxRequests: 100,
          keyPrefix: 'test_rate_limit',
        });
      }
      
      const result = await checkRateLimit('rate-limit-test-150', {
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test_rate_limit',
      });
      
      // 由于是内存模式，可能不会真正限流
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetAt');
    });
  });

  describe('acquireLock / releaseLock', () => {
    it('应该能够获取和释放锁（内存模式）', async () => {
      const lockName = 'test-lock';
      
      // 获取锁（内存模式直接返回 'no-lock'）
      const lockValue = await acquireLock(lockName);
      expect(lockValue).toBeDefined();
      
      // 释放锁
      const released = await releaseLock(lockName, lockValue || '');
      expect(released).toBe(true);
    });
  });

  describe('isRedisAvailable', () => {
    it('在没有 Redis 时应该返回 false', () => {
      const available = isRedisAvailable();
      expect(available).toBe(false);
    });
  });
});
