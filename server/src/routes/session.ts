import { Router, Response } from 'express';
import {
  createSession,
  getAllSessions,
  getSessionMessages,
  getSessionInfo,
  deleteSession,
  clearSession,
  getMessageBranches,
  getMessageBranch,
  switchBranch,
  editMessage,
  getMessageSessionId,
  assertSessionOwner,
  createFolder,
  getAllFolders,
  updateFolder,
  deleteFolder,
  assertFolderOwner,
  updateSessionFolder,
  toggleSessionPin,
  updateSessionTags,
  updateSessionCollections,
  updateSessionModelMode,
} from '../services/session';
import { optionalAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// 会话与文件夹按用户隔离：整段挂可选鉴权，登录态从 token 推导 req.userId。
// 未登录（userId 为空）仅能访问 user_id IS NULL 的匿名桶，与登录用户互不可见。
router.use(optionalAuth);

// 归属校验失败统一返回 404（不泄露资源是否存在）
function notFound(res: Response) {
  return res.status(404).json({ error: '会话不存在' });
}

// ===== 文件夹路由（必须定义在 /:id 之前，避免被当作 id 匹配） =====

// 获取所有文件夹
router.get('/folders', async (req: AuthRequest, res: Response) => {
  const folders = await getAllFolders(req.userId ?? null);
  res.json({ folders });
});

// 新建文件夹
router.post('/folders', async (req: AuthRequest, res: Response) => {
  const { name, icon } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '文件夹名称不能为空' });
  }
  const folder = await createFolder(name.trim(), icon, req.userId ?? null);
  res.json(folder);
});

// 更新文件夹
router.put('/folders/:folderId', async (req: AuthRequest, res: Response) => {
  const { folderId } = req.params;
  if (!(await assertFolderOwner(folderId, req.userId ?? null))) {
    return res.status(404).json({ error: '文件夹不存在' });
  }
  const { name, icon } = req.body;
  await updateFolder(folderId, name, icon);
  res.json({ message: '文件夹已更新' });
});

// 删除文件夹（其内会话移至未归类）
router.delete('/folders/:folderId', async (req: AuthRequest, res: Response) => {
  const { folderId } = req.params;
  if (!(await assertFolderOwner(folderId, req.userId ?? null))) {
    return res.status(404).json({ error: '文件夹不存在' });
  }
  await deleteFolder(folderId);
  res.json({ message: '文件夹已删除' });
});

// ===== 创建会话 =====
router.post('/', async (req: AuthRequest, res: Response) => {
  const { title, mode, model } = req.body;
  const session = await createSession(title, mode, model, req.userId ?? null);
  res.json(session);
});

// ===== 获取所有会话（按用户隔离，支持按文件夹/标签筛选） =====
router.get('/', async (req: AuthRequest, res: Response) => {
  const { folderId, tag } = req.query;
  let folderFilter: string | null | undefined = undefined;
  if (folderId === 'none' || folderId === null) folderFilter = null;
  else if (typeof folderId === 'string') folderFilter = folderId;
  const sessions = await getAllSessions({
    userId: req.userId ?? null,
    folderId: folderFilter,
    tag: typeof tag === 'string' ? tag : undefined,
  });
  res.json({ sessions });
});

// ===== 分支相关 =====

// 获取会话所有分支
router.get('/:id/branches', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  const branches = await getMessageBranches(id);
  res.json({ branches });
});

// 切换分支
router.post('/:id/switch-branch', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  const { branchId } = req.body;
  if (!branchId) {
    return res.status(400).json({ error: 'branchId 不能为空' });
  }
  await switchBranch(id, branchId);
  const messages = await getMessageBranch(id, branchId);
  res.json({ message: '已切换分支', branchId, messages });
});

// ===== 会话归类 / 置顶 / 标签 =====

// 移动会话到文件夹
router.put('/:id/folder', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  const { folderId } = req.body;
  // 若归入某文件夹，需确保该文件夹也属于当前用户
  if (folderId && !(await assertFolderOwner(folderId, req.userId ?? null))) {
    return res.status(404).json({ error: '文件夹不存在' });
  }
  await updateSessionFolder(id, folderId || null);
  res.json({ message: '已移动到文件夹' });
});

// 切换置顶
router.post('/:id/pin', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  await toggleSessionPin(id);
  res.json({ message: '置顶状态已切换' });
});

// 更新会话标签
router.put('/:id/tags', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  const { tags } = req.body;
  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: 'tags 必须是数组' });
  }
  await updateSessionTags(id, tags);
  res.json({ message: '标签已更新' });
});

// 会话关联知识库（多选）
router.put('/:id/collections', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  const { collectionIds } = req.body;
  if (!Array.isArray(collectionIds)) {
    return res.status(400).json({ error: 'collectionIds 必须是数组' });
  }
  await updateSessionCollections(id, collectionIds);
  res.json({ message: '关联知识库已更新', collectionIds });
});

// 更新会话的模型和模式
router.put('/:id/model-mode', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  const { mode, model } = req.body;
  if (mode === undefined && model === undefined) {
    return res.status(400).json({ error: 'mode 或 model 至少提供一个' });
  }
  const success = await updateSessionModelMode(id, mode, model);
  if (success) {
    res.json({ message: '会话模型和模式已更新', mode, model });
  } else {
    res.status(404).json({ error: '会话不存在' });
  }
});

// ===== 消息编辑 =====
// PUT /sessions/messages/:id —— 编辑消息内容（先按消息反查会话做归属校验）
router.put('/messages/:messageId', async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const { content } = req.body;
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: '内容不能为空' });
  }
  const ownerSid = await getMessageSessionId(messageId);
  if (!ownerSid || !(await assertSessionOwner(ownerSid, req.userId ?? null))) {
    return res.status(404).json({ error: '消息不存在' });
  }
  const success = await editMessage(messageId, content);
  if (success) {
    res.json({ message: '消息已更新', id: messageId, content });
  } else {
    res.status(404).json({ error: '消息不存在' });
  }
});

// ===== 会话详情（放在具体子路由之后、/messages 之后） =====
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  const { branchId } = req.query;
  const info = await getSessionInfo(id);
  if (!info) {
    return res.status(404).json({ error: '会话不存在' });
  }
  const messages = await getSessionMessages(id, typeof branchId === 'string' ? branchId : undefined);
  const branches = await getMessageBranches(id);
  res.json({ info, messages, branches });
});

// 删除会话
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  const success = await deleteSession(id);

  if (success) {
    res.json({ message: '会话删除成功' });
  } else {
    res.status(404).json({ error: '会话不存在' });
  }
});

// 清空会话消息
router.post('/:id/clear', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await assertSessionOwner(id, req.userId ?? null))) return notFound(res);
  const success = await clearSession(id);

  if (success) {
    res.json({ message: '会话已清空' });
  } else {
    res.status(404).json({ error: '会话不存在' });
  }
});

export default router;
