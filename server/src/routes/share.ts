import { Router, Request, Response } from 'express';
import {
  createShare,
  getShareByToken,
  getShareById,
  getShareSessionMessages,
  listSharesBySession,
  revokeShare,
  isExpired,
} from '../services/share';

const router = Router();

// 创建分享：POST /api/shares  body: { sessionId, password?, expiresInHours? }
router.post('/', async (req: Request, res: Response) => {
  const { sessionId, password, expiresInHours } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId 不能为空' });
  }
  const share = await createShare(
    sessionId,
    typeof password === 'string' && password.trim() ? password : undefined,
    typeof expiresInHours === 'number' ? expiresInHours : undefined
  );
  res.json({
    id: share.id,
    sessionId: share.sessionId,
    token: share.shareToken,
    url: `/share/${share.shareToken}`,
    expiresAt: share.expiresAt,
    createdAt: share.createdAt,
    hasPassword: !!share.password,
  });
});

// 查询某会话的分享列表
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  const shares = await listSharesBySession(req.params.sessionId);
  res.json({
    shares: shares.map(s => ({
      id: s.id,
      token: s.shareToken,
      url: `/share/${s.shareToken}`,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      hasPassword: !!s.password,
      expired: isExpired(s),
    })),
  });
});

// 获取分享信息（不含消息）：GET /api/shares/:token
router.get('/:token', async (req: Request, res: Response) => {
  const share = await getShareByToken(req.params.token);
  if (!share) {
    return res.status(404).json({ error: '分享不存在或已被撤销' });
  }
  if (isExpired(share)) {
    return res.status(410).json({ error: '分享已过期', expired: true });
  }
  res.json({
    token: share.shareToken,
    hasPassword: !!share.password,
    expiresAt: share.expiresAt,
    createdAt: share.createdAt,
  });
});

// 获取分享消息：POST /api/shares/:token/messages  body: { password? }
router.post('/:token/messages', async (req: Request, res: Response) => {
  const password = (req.body && req.body.password) || undefined;
  const result = await getShareSessionMessages(req.params.token, password);
  if (!result.ok) {
    if (result.reason === 'not_found') return res.status(404).json({ error: '分享不存在或已被撤销' });
    if (result.reason === 'expired') return res.status(410).json({ error: '分享已过期' });
    return res.status(403).json({ error: '密码错误', needPassword: true });
  }
  res.json({ title: result.title, messages: result.messages });
});

// 撤销分享：DELETE /api/shares/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const existed = await getShareById(req.params.id);
  if (!existed) {
    return res.status(404).json({ error: '分享不存在' });
  }
  await revokeShare(req.params.id);
  res.json({ message: '分享已撤销' });
});

export default router;
