/**
 * 权限模式「用户可选值」校验测试
 *
 * 与运行时的静默降级（runWithPermissionMode）是两件事：
 * 运行时那一层是保险，这里面对的是用户的明确选择 —— 不支持就必须报错。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  assertSelectablePermissionMode,
  runWithPermissionMode,
  getPermissionMode,
  normalizePermissionMode,
} from '../../src/services/permissionMode';

const original = process.env.ZHI_ALLOW_FULL_PERMISSION;

afterEach(() => {
  if (original === undefined) delete process.env.ZHI_ALLOW_FULL_PERMISSION;
  else process.env.ZHI_ALLOW_FULL_PERMISSION = original;
});

describe('assertSelectablePermissionMode', () => {
  it('sandbox 恒可选（任何环境都能逐次确认）', () => {
    delete process.env.ZHI_ALLOW_FULL_PERMISSION;
    expect(assertSelectablePermissionMode('sandbox')).toBe('sandbox');
  });

  it('不支持完全访问的环境里选 full 要报错，而不是静默降级', () => {
    delete process.env.ZHI_ALLOW_FULL_PERMISSION;
    // 测试进程默认不是桌面托管后端
    expect(() => assertSelectablePermissionMode('full')).toThrow(/不支持完全访问/);
  });

  it('显式放开的环境（桌面/开发）允许选 full', () => {
    process.env.ZHI_ALLOW_FULL_PERMISSION = '1';
    expect(assertSelectablePermissionMode('full')).toBe('full');
  });

  it('非法值直接拒绝（不能拿未知值当 sandbox 混过去）', () => {
    expect(() => assertSelectablePermissionMode('FULL')).toThrow(/只能是/);
    expect(() => assertSelectablePermissionMode('yes')).toThrow(/只能是/);
    expect(() => assertSelectablePermissionMode(undefined)).toThrow(/只能是/);
    expect(() => assertSelectablePermissionMode({ mode: 'full' })).toThrow(/只能是/);
  });

  it('对照：运行时降级仍然静默（消息工具链不该因为有人的授权设置报错）', () => {
    delete process.env.ZHI_ALLOW_FULL_PERMISSION;
    expect(runWithPermissionMode('full', () => getPermissionMode())).toBe('sandbox');
    expect(normalizePermissionMode('whatever')).toBe('sandbox');
  });
});
