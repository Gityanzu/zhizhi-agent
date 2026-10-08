/**
 * middleware/auth.ts 单元测试
 * 覆盖：requireAuth / optionalAuth / requireAdmin 的边界与禁用账号处理
 * 关键回归：被禁用账号在 optionalAuth 上不得获得身份（防绕过）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/auth', () => ({
  verifyToken: vi.fn(),
  getUserById: vi.fn(),
}));

import { requireAuth, optionalAuth, requireAdmin } from '../../src/middleware/auth';
import { verifyToken, getUserById } from '../../src/services/auth';

const verifyTokenMock = vi.mocked(verifyToken);
const getUserByIdMock = vi.mocked(getUserById);

function createRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function createReq(auth?: string) {
  const req: any = { headers: {} };
  if (auth) req.headers.authorization = auth;
  return req;
}

const activeUser = (over: Record<string, any> = {}) => ({
  id: over.id ?? 'u1', username: over.username ?? 'alice',
  email: null, nickname: null, avatar: null,
  role: over.role ?? 'user', status: over.status ?? 'active',
  created_at: new Date().toISOString(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAuth', () => {
  it('无 Authorization 头 → 401 未登录，不调用 next', async () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: '未登录，请先登录' });
    expect(next).not.toHaveBeenCalled();
  });

  it('有 Bearer 但 token 非法 → 401 登录已过期', async () => {
    verifyTokenMock.mockReturnValue(null);
    const req = createReq('Bearer bad-token');
    const res = createRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: '登录已过期，请重新登录' });
    expect(next).not.toHaveBeenCalled();
  });

  it('合法 token + 正常用户 → 注入 userId/user 并放行', async () => {
    verifyTokenMock.mockReturnValue({ userId: 'u1', username: 'alice' });
    getUserByIdMock.mockResolvedValue(activeUser() as any);
    const req = createReq('Bearer ok');
    const res = createRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe('u1');
    expect(req.user?.role).toBe('user');
  });

  it('合法 token 但账号被禁用 → 403，且不注入身份', async () => {
    verifyTokenMock.mockReturnValue({ userId: 'u2', username: 'banned' });
    getUserByIdMock.mockResolvedValue(activeUser({ id: 'u2', status: 'disabled' }) as any);
    const req = createReq('Bearer ok');
    const res = createRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
  });

  it('用户不存在（getUserById=null）→ 放行但 req.user 未设置', async () => {
    verifyTokenMock.mockReturnValue({ userId: 'ghost', username: 'x' });
    getUserByIdMock.mockResolvedValue(null);
    const req = createReq('Bearer ok');
    const res = createRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe('ghost');
    expect(req.user).toBeUndefined();
  });

  it('getUserById 抛错（如非法 UUID）→ 不阻断，保留 userId 回退', async () => {
    verifyTokenMock.mockReturnValue({ userId: 'not-a-uuid', username: 'x' });
    getUserByIdMock.mockRejectedValue(new Error('invalid input syntax for type uuid'));
    const req = createReq('Bearer ok');
    const res = createRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe('not-a-uuid');
  });
});

describe('optionalAuth', () => {
  it('无 token → 放行且不注入身份', async () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await optionalAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBeUndefined();
  });

  it('关键回归：禁用账号 → 放行但不注入任何身份（防绕过）', async () => {
    verifyTokenMock.mockReturnValue({ userId: 'u3', username: 'banned' });
    getUserByIdMock.mockResolvedValue(activeUser({ id: 'u3', status: 'disabled' }) as any);
    const req = createReq('Bearer ok');
    const res = createRes();
    const next = vi.fn();
    await optionalAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBeUndefined();
    expect(req.user).toBeUndefined();
  });

  it('正常账号 → 注入身份', async () => {
    verifyTokenMock.mockReturnValue({ userId: 'u4', username: 'bob' });
    getUserByIdMock.mockResolvedValue(activeUser({ id: 'u4', username: 'bob', role: 'admin' }) as any);
    const req = createReq('Bearer ok');
    const res = createRes();
    const next = vi.fn();
    await optionalAuth(req, res, next);
    expect(req.userId).toBe('u4');
    expect(req.user?.role).toBe('admin');
  });
});

describe('requireAdmin', () => {
  it('未登录 → 401', () => {
    const res = createRes();
    const next = vi.fn();
    requireAdmin(createReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('非 admin 角色 → 403', () => {
    const req = createReq();
    req.userId = 'u1';
    req.user = { role: 'user' } as any;
    const res = createRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('admin 角色 → 放行', () => {
    const req = createReq();
    req.userId = 'u1';
    req.user = { role: 'admin' } as any;
    const res = createRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
