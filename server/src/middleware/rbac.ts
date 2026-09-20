/**
 * RBAC 权限管理系统
 * Role-Based Access Control - 基于角色的访问控制
 */

import { query } from '../db';

// 角色定义
export type Role = 'admin' | 'user' | 'guest';

// 权限定义
export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

// 角色权限映射
const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: [
    'user:create', 'user:update', 'user:delete', 'user:view',
    'agent:create', 'agent:update', 'agent:delete', 'agent:view',
    'template:create', 'template:update', 'template:delete', 'template:view',
    'template:approve', 'template:reject',
    'system:config', 'system:monitor', 'system:backup',
    'analytics:view', 'analytics:export',
    'api:key:create', 'api:key:delete',
  ],
  user: [
    'user:view', 'user:update',
    'agent:create', 'agent:view',
    'template:view', 'template:download', 'template:favorite',
    'analytics:view',
    'api:key:create', 'api:key:view', 'api:key:delete',
  ],
  guest: [
    'template:view',
  ],
};

// 默认角色
export const DEFAULT_ROLE: Role = 'user';

/**
 * 获取用户的角色
 */
export async function getUserRole(userId: string): Promise<Role> {
  try {
    const result = await query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return DEFAULT_ROLE;
    }
    
    const role = result.rows[0].role as Role;
    return (['admin', 'user', 'guest'].includes(role)) ? role : DEFAULT_ROLE;
  } catch (error) {
    console.error('获取用户角色失败:', error);
    return DEFAULT_ROLE;
  }
}

/**
 * 检查用户是否有某个权限
 */
export async function checkPermission(userId: string, permission: string): Promise<boolean> {
  const role = await getUserRole(userId);
  const permissions = ROLE_PERMISSIONS[role];
  
  return permissions.includes(permission);
}

/**
 * 检查用户是否有任意一个权限（OR 逻辑）
 */
export async function checkAnyPermission(userId: string, permissions: string[]): Promise<boolean> {
  for (const perm of permissions) {
    if (await checkPermission(userId, perm)) {
      return true;
    }
  }
  return false;
}

/**
 * 检查用户是否拥有所有权限（AND 逻辑）
 */
export async function checkAllPermissions(userId: string, permissions: string[]): Promise<boolean> {
  for (const perm of permissions) {
    if (!await checkPermission(userId, perm)) {
      return false;
    }
  }
  return true;
}

/**
 * 获取用户的所有权限
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const role = await getUserRole(userId);
  return ROLE_PERMISSIONS[role];
}

/**
 * 获取角色的所有权限
 */
export function getRolePermissions(role: Role): string[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * 获取所有角色列表
 */
export function getRoles(): Role[] {
  return ['admin', 'user', 'guest'];
}

/**
 * 将字符串角色转换为 Role 类型（安全转换）
 */
export function safeRoleFromString(role: string): Role {
  return (['admin', 'user', 'guest'].includes(role)) ? (role as Role) : DEFAULT_ROLE;
}

/**
 * 设置用户角色
 */
export async function setUserRole(userId: string, role: Role): Promise<boolean> {
  try {
    await query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [role, userId]
    );
    return true;
  } catch (error) {
    console.error('设置用户角色失败:', error);
    return false;
  }
}

/**
 * 创建自定义角色（高级功能）
 */
export async function createCustomRole(
  roleName: string,
  permissions: string[]
): Promise<boolean> {
  try {
    // 这里可以扩展为在数据库中存储自定义角色
    console.log(`创建自定义角色：${roleName}`, permissions);
    return true;
  } catch (error) {
    console.error('创建自定义角色失败:', error);
    return false;
  }
}

/**
 * 中间件：检查权限
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (req: any, res: any, next: any) => {
    if (!req.userId) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const hasPermission = await checkAnyPermission(req.userId, requiredPermissions);
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: '权限不足',
        required: requiredPermissions 
      });
    }
    
    next();
  };
}

/**
 * 中间件：检查角色
 */
export function requireRole(...allowedRoles: Role[]) {
  return async (req: any, res: any, next: any) => {
    if (!req.userId) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const userRole = await getUserRole(req.userId);
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: '权限不足',
        requiredRoles: allowedRoles,
        userRole 
      });
    }
    
    next();
  };
}

/**
 * 中间件：Admin 专用
 */
export function requireAdmin() {
  return requireRole('admin');
}

/**
 * 中间件：已登录用户
 */
export function requireAuth() {
  return async (req: any, res: any, next: any) => {
    if (!req.userId) {
      return res.status(401).json({ error: '请先登录' });
    }
    next();
  };
}

export default {
  // 导出函数
  getUserRole,
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  getUserPermissions,
  getRolePermissions,
  getRoles,
  safeRoleFromString,
  setUserRole,
  createCustomRole,
  
  // 导出中间件
  requirePermission,
  requireRole,
  requireAdmin,
  requireAuth,
  
  // 导出常量
  DEFAULT_ROLE,
  ROLE_PERMISSIONS,
};
