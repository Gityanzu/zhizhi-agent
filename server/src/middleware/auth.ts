import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth';

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

// 认证中间件 - 必须登录
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  req.userId = payload.userId;
  req.username = payload.username;
  next();
}

// 可选认证中间件 - 不强制登录，但如果有token会解析
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) {
      req.userId = payload.userId;
      req.username = payload.username;
    }
  }
  next();
}
