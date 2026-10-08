/**
 * passwordStrength.ts 单元测试
 * 覆盖：长度/字符类型/常见弱口令/连续字符 等规则与边界值
 */
import { describe, it, expect } from 'vitest';
import {
  validatePasswordStrength,
  calculateStrengthScore,
  getPasswordStrengthLevel,
  generatePasswordSuggestions,
  isPasswordSecure,
} from '../../src/services/passwordStrength';

describe('validatePasswordStrength', () => {
  it('空密码：无效，且给出长度错误，强度为 weak', () => {
    const r = validatePasswordStrength('');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('密码长度至少8个字符');
    expect(r.strength).toBe('weak');
  });

  it('边界：长度 7（不足 8）应报长度错误', () => {
    const r = validatePasswordStrength('Ab1!xyz');
    expect(r.errors).toContain('密码长度至少8个字符');
  });

  it('缺大写/数字/特殊字符应分别报错', () => {
    const r = validatePasswordStrength('abcdefgh');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('密码必须包含至少一个大写字母');
    expect(r.errors).toContain('密码必须包含至少一个数字');
    expect(r.errors).toContain('密码必须包含至少一个特殊字符');
  });

  it('常见弱口令（qwerty）应被识别为过于简单', () => {
    const r = validatePasswordStrength('Qwerty!1A');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('密码过于简单，包含常见模式');
  });

  it('合法强密码应判为有效且无错误', () => {
    const r = validatePasswordStrength('Xk9$mQ2#vB7');
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.strength).toBe('strong');
  });

  // 回归：连续字符规则已改为精确序列检测，普通密码不应被误判
  it('普通强度密码 MyP@ssw0rd 应判为有效', () => {
    expect(validatePasswordStrength('MyP@ssw0rd').valid).toBe(true);
  });

  it('真正的连续序列（abc / 123）仍应被拒绝', () => {
    expect(validatePasswordStrength('Abcd1!xy').errors).toContain('避免使用连续字符');
    expect(validatePasswordStrength('Xy1!2345').errors).toContain('避免使用连续字符');
  });
});

describe('calculateStrengthScore', () => {
  it('空密码得 0 分', () => {
    expect(calculateStrengthScore('')).toBe(0);
  });

  it('分数始终落在 [0,100] 区间', () => {
    for (const pw of ['', 'a', 'abc123', 'Xk9$mQ2#vB7', 'A1!'.repeat(20)]) {
      const s = calculateStrengthScore(pw);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('越长越复杂分数越高（单调性抽样）', () => {
    expect(calculateStrengthScore('Xk9$mQ2#vB7')).toBeGreaterThan(calculateStrengthScore('Xk9$'));
  });
});

describe('getPasswordStrengthLevel 边界', () => {
  it('按分数阈值返回对应级别', () => {
    expect(getPasswordStrengthLevel(0).level).toBe('very_weak');
    expect(getPasswordStrengthLevel(29).level).toBe('very_weak');
    expect(getPasswordStrengthLevel(30).level).toBe('weak');
    expect(getPasswordStrengthLevel(49).level).toBe('weak');
    expect(getPasswordStrengthLevel(50).level).toBe('fair');
    expect(getPasswordStrengthLevel(59).level).toBe('fair');
    expect(getPasswordStrengthLevel(60).level).toBe('good');
    expect(getPasswordStrengthLevel(79).level).toBe('good');
    expect(getPasswordStrengthLevel(80).level).toBe('strong');
    expect(getPasswordStrengthLevel(94).level).toBe('strong');
    expect(getPasswordStrengthLevel(95).level).toBe('very_strong');
    expect(getPasswordStrengthLevel(100).level).toBe('very_strong');
  });

  it('回显传入的分数', () => {
    expect(getPasswordStrengthLevel(73).score).toBe(73);
  });
});

describe('generatePasswordSuggestions', () => {
  it('空密码应给出长度与各类字符建议', () => {
    const s = generatePasswordSuggestions('');
    expect(s).toContain('使用8个或更多字符');
    expect(s).toContain('添加大写字母');
    expect(s).toContain('添加小写字母');
    expect(s).toContain('添加数字');
    expect(s).toContain('添加特殊字符');
  });

  it('长度 8~11 之间提示考虑 12 位', () => {
    expect(generatePasswordSuggestions('Abcdef1!')).toContain('考虑使用12个或更多字符');
  });
});

describe('isPasswordSecure', () => {
  it('达到 minScore 判为安全', () => {
    expect(isPasswordSecure('Xk9$mQ2#vB7', 40)).toBe(true);
  });

  it('边界：分数等于 minScore 时应为 true', () => {
    const score = calculateStrengthScore('Xk9$mQ2#vB7');
    expect(isPasswordSecure('Xk9$mQ2#vB7', score)).toBe(true);
    expect(isPasswordSecure('Xk9$mQ2#vB7', score + 1)).toBe(false);
  });

  // 回归：含明确弱口令的高分密码不应判为安全
  it('包含 admin/123456 的密码不应判为安全', () => {
    expect(isPasswordSecure('Admin@123456', 40)).toBe(false);
  });
});
