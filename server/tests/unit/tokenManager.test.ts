/**
 * Token Manager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyToken,
  saveRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  generatePasswordResetToken,
  validatePasswordResetToken,
  consumePasswordResetToken,
  cleanupExpiredTokensFromDB
} from '../../src/services/tokenManager';
import { query } from '../../src/db';

// Mock query 函数
vi.mock('../../src/db', () => ({
  query: vi.fn(),
  usePostgres: true,
}));

describe('TokenManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateAccessToken', () => {
    it('应该生成有效的访问令牌', () => {
      const token = generateAccessToken('user-123', 'testuser');
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('生成的令牌应包含正确的用户信息', () => {
      const token = generateAccessToken('user-456', 'john_doe');
      const decoded = verifyToken(token);
      
      expect(decoded?.userId).toBe('user-456');
      expect(decoded?.username).toBe('john_doe');
      expect(decoded?.type).toBe('access');
    });
  });

  describe('generateRefreshToken', () => {
    it('应该生成有效的刷新令牌', () => {
      const token = generateRefreshToken('user-123', 'testuser');
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      const decoded = verifyToken(token);
      expect(decoded?.type).toBe('refresh');
    });
  });

  describe('verifyToken', () => {
    it('应该验证有效的令牌', () => {
      const token = generateAccessToken('user-789', 'validuser');
      const result = verifyToken(token);
      
      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-789');
    });

    it('应该拒绝无效的令牌', () => {
      const invalidToken = 'invalid.token.here';
      const result = verifyToken(invalidToken);
      
      expect(result).toBeNull();
    });

    it('应该拒绝过期的令牌', () => {
      // 创建一个已过期的令牌（手动构造）
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTExMSIsInVzZXJuYW1lIjoib3JpZ2luYWwiLCJ0eXBlIjoiYWNjZXNzIiwiZXhwIjoxMDAwMDAwMDAwfQ.invalidSignature';
      const result = verifyToken(expiredToken);
      
      expect(result).toBeNull();
    });
  });

  describe('saveRefreshToken', () => {
    it('应该将刷新令牌保存到数据库', async () => {
      vi.mocked(query).mockResolvedValue({ rowCount: 1 } as any);
      
      await saveRefreshToken('user-123', 'refresh-token-xyz', 604800000);
      
      expect(query).toHaveBeenCalled();
    });
  });

  describe('validateRefreshToken', () => {
    it('应该验证有效的刷新令牌', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ user_id: 'user-123' }]
      } as any);
      
      const result = await validateRefreshToken('valid-refresh-token');
      
      expect(result).toEqual({ userId: 'user-123' });
    });

    it('应该拒绝无效的刷新令牌', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] } as any);
      
      const result = await validateRefreshToken('invalid-token');
      
      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('应该撤销刷新令牌', async () => {
      vi.mocked(query).mockResolvedValue({ rowCount: 1 } as any);
      
      await revokeRefreshToken('token-to-revoke');
      
      expect(query).toHaveBeenCalled();
    });
  });

  describe('generatePasswordResetToken', () => {
    it('应该生成密码重置令牌并保存到数据库', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ id: 'test-id' }]
      } as any);
      
      const token = await generatePasswordResetToken('user-123');
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tokens'),
        expect.any(Array)
      );
    });
  });

  describe('validatePasswordResetToken', () => {
    it('应该验证有效的密码重置令牌', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ user_id: 'user-456' }]
      } as any);
      
      const result = await validatePasswordResetToken('valid-reset-token');
      
      expect(result).toEqual({ userId: 'user-456' });
    });

    it('应该拒绝已使用的令牌', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] } as any);
      
      const result = await validatePasswordResetToken('used-token');
      
      expect(result).toBeNull();
    });
  });

  describe('consumePasswordResetToken', () => {
    it('应该删除已使用的密码重置令牌', async () => {
      vi.mocked(query).mockResolvedValue({ rowCount: 1 } as any);
      
      await consumePasswordResetToken('token-to-consume');
      
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tokens'),
        expect.any(Array)
      );
    });
  });

  describe('cleanupExpiredTokensFromDB', () => {
    it('应该清理过期的令牌', async () => {
      vi.mocked(query).mockResolvedValue({ rowCount: 5 } as any);
      
      await cleanupExpiredTokensFromDB();
      
      expect(query).toHaveBeenCalled();
      const callArgs = vi.mocked(query).mock.calls[0][0];
      expect(callArgs).toContain('DELETE FROM tokens');
      expect(callArgs).toContain('expires_at < NOW()');
    });
  });
});
