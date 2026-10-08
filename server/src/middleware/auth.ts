import { Request, Response, NextFunction } from 'express';
import { verifyToken, getUserById, User } from '../services/auth';

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
  user?: User;
}

// 从请求头解析并校验 Token，返回 payload（无/非法则 null）
function parseToken(req: AuthRequest): { userId: string; username: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.substring(7));
}

// 加载用户并挂载到 req.user（用于 RBAC/归属校验）
async function attachUser(req: AuthRequest, payload: { userId: string; username: string }): Promise<{ ok: boolean; code?: number; error?: string }> {
  try {
    const user = await getUserById(payload.userId);
    // 账号被禁用：校验在注入身份之前，避免 optionalAuth 忽略返回值时仍获得身份
    if (user && user.status && user.status !== 'active') {
      return { ok: false, code: 403, error: '账号已被禁用' };
    }
    req.userId = payload.userId;
    req.username = payload.username || user?.username;
    if (user) req.user = user;
  } catch {
    // userId 非法 UUID 或查询失败时：保持旧行为，仅注入 userId（不注入 req.user）
    req.userId = payload.userId;
    req.username = payload.username;
  }
  return { ok: true };
}

// 认证中间件 - 必须登录
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const payload = parseToken(req);
  if (!payload) {
    const hasHeader = !!(req.headers.authorization && req.headers.authorization.startsWith('Bearer '));
    return res.status(401).json({ error: hasHeader ? '登录已过期，请重新登录' : '未登录，请先登录' });
  }
  try {
    const result = await attachUser(req, payload);
    if (!result.ok) return res.status(result.code || 403).json({ error: result.error || '无权访问' });
  } catch (err) {
    // 极端情况下不阻断请求，但记录告警便于排查（避免静默失败）
    console.warn('[auth] requireAuth 加载用户失败:', err instanceof Error ? err.message : err);
  }
  next();
}

// 可选认证中间件 - 不强制登录，但如果有 token 会解析并注入 req.user
export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const payload = parseToken(req);
  if (payload) {
    try {
      await attachUser(req, payload);
    } catch {
      // 忽略
    }
  }
  next();
}

// 管理员中间件 - 需在 requireAuth 之后使用
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '无权限执行此操作' });
  }
  next();
}
