/**
 * 邮件服务单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import { generateVerificationCode, initEmailService } from '../../src/services/email';

describe('Email Service', () => {
  describe('generateVerificationCode', () => {
    it('应该生成指定长度的数字验证码', () => {
      const code = generateVerificationCode(6);
      
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d+$/);
    });

    it('应该生成不同长度的验证码', () => {
      const code4 = generateVerificationCode(4);
      const code8 = generateVerificationCode(8);
      
      expect(code4).toHaveLength(4);
      expect(code8).toHaveLength(8);
    });

    it('生成的验证码应该是唯一的', () => {
      const codes = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        codes.add(generateVerificationCode(6));
      }
      
      expect(codes.size).toBe(100);
    });
  });

  describe('initEmailService', () => {
    it('在没有配置 SMTP 时应该返回 false', () => {
      // 保存原始值
      const originalHost = process.env.SMTP_HOST;
      const originalUser = process.env.SMTP_USER;
      const originalPass = process.env.SMTP_PASS;
      
      // 清除配置
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      
      try {
        const result = initEmailService();
        expect(result).toBe(false);
      } finally {
        // 恢复原始值
        if (originalHost) process.env.SMTP_HOST = originalHost;
        if (originalUser) process.env.SMTP_USER = originalUser;
        if (originalPass) process.env.SMTP_PASS = originalPass;
      }
    });

    it.skip('在配置了 SMTP 时应该返回 true（如果连接成功）', () => {
      // 这个测试需要真实的 SMTP 配置，暂时跳过
    });
  });
});
