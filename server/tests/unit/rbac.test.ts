/**
 * RBAC 权限系统单元测试
 */

import { describe, it, expect } from 'vitest';
import { 
  getRolePermissions,
  getRoles,
  safeRoleFromString,
  DEFAULT_ROLE,
} from '../../src/middleware/rbac';

describe('RBAC Permission System', () => {
  describe('getRolePermissions', () => {
    it('应该返回 admin 角色的所有权限', () => {
      const permissions = getRolePermissions('admin');
      
      expect(permissions).toContain('user:create');
      expect(permissions).toContain('system:config');
      expect(permissions.length).toBeGreaterThan(10);
    });

    it('应该返回 user 角色的权限', () => {
      const permissions = getRolePermissions('user');
      
      expect(permissions).toContain('user:view');
      expect(permissions).toContain('template:view');
      expect(permissions).not.toContain('system:config');
    });

    it('应该返回 guest 角色的最小权限', () => {
      const permissions = getRolePermissions('guest');
      
      expect(permissions).toEqual(['template:view']);
      expect(permissions.length).toBe(1);
    });
  });

  describe('getRoles', () => {
    it('应该返回所有角色', () => {
      const roles = getRoles();
      
      expect(roles).toContain('admin');
      expect(roles).toContain('user');
      expect(roles).toContain('guest');
      expect(roles.length).toBe(3);
    });
  });

  describe('safeRoleFromString', () => {
    it('应该正确转换有效角色字符串', () => {
      expect(safeRoleFromString('admin')).toBe('admin');
      expect(safeRoleFromString('user')).toBe('user');
      expect(safeRoleFromString('guest')).toBe('guest');
    });

    it('应该将无效角色转换为默认角色', () => {
      expect(safeRoleFromString('superadmin')).toBe(DEFAULT_ROLE);
      expect(safeRoleFromString('moderator')).toBe(DEFAULT_ROLE);
      expect(safeRoleFromString('invalid')).toBe(DEFAULT_ROLE);
    });

    it('空字符串应该转换为默认角色', () => {
      expect(safeRoleFromString('')).toBe(DEFAULT_ROLE);
    });
  });
});
