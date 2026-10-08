/**
 * rbac.ts 角色权限单元测试（补充既有 rbac.test.ts）
 * 重点：权限清单正确性与角色层级一致性（admin 应为 user 的超集）
 */
import { describe, it, expect } from 'vitest';
import { getRolePermissions, getRoles, safeRoleFromString, DEFAULT_ROLE } from '../../src/middleware/rbac';

describe('角色权限清单', () => {
  it('guest 仅有 template:view', () => {
    expect(getRolePermissions('guest')).toEqual(['template:view']);
  });

  it('user 含核心权限且不含系统级权限', () => {
    const p = getRolePermissions('user');
    expect(p).toContain('template:view');
    expect(p).toContain('agent:create');
    expect(p).not.toContain('system:config');
    expect(p).not.toContain('template:approve');
  });

  it('admin 含系统级与审批权限', () => {
    const p = getRolePermissions('admin');
    expect(p).toContain('system:config');
    expect(p).toContain('template:approve');
    expect(p).toContain('user:delete');
  });

  // 回归：admin 权限应为 user 的超集（此前 admin 缺 api:key:view/template:download/template:favorite）
  it('admin 的权限应是 user 的超集', () => {
    const admin = new Set(getRolePermissions('admin'));
    const missing = getRolePermissions('user').filter((p) => !admin.has(p));
    expect(missing).toEqual([]);
  });
});

describe('角色基本约束', () => {
  it('getRoles 返回三种角色', () => {
    expect(getRoles().sort()).toEqual(['admin', 'guest', 'user']);
  });

  it('safeRoleFromString 非法值回退默认角色', () => {
    expect(safeRoleFromString('admin')).toBe('admin');
    expect(safeRoleFromString('')).toBe(DEFAULT_ROLE);
    expect(safeRoleFromString('superadmin')).toBe(DEFAULT_ROLE);
    expect(safeRoleFromString('ADMIN')).toBe(DEFAULT_ROLE); // 大小写敏感
  });
});
