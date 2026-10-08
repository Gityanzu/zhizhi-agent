import { Router, Response, NextFunction } from 'express';
import { taskManager } from '../services/taskManager';
import { runTaskInBackground } from '../services/taskRunner';
import { createSession, assertSessionOwner, addMessage } from '../services/session';
import { optionalAuth, AuthRequest } from '../middleware/auth';

// 安全模型：taskId 为 randomUUID（不可猜），鉴权依赖其机密性，与现有 /stream/approve 的 requestId 模型一致。
// 故详情/进度/取消/审批端点仅校验任务存在，不强制 userId 匹配——
// 因为浏览器 EventSource 无法携带 Authorization 头，强制匹配会导致登录用户订阅 403。
// 会话归属（assertSessionOwner）仍按 userId 校验（创建任务用 fetch，可带 token）。

const router = Router();

// 创建任务并后台执行（立即返回 taskId，不阻塞）
router.post('/', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const r = await handleCreateTask(req.body, req.userId ?? null);
    res.status(r.status).json(r.body);
  } catch (error) {
    console.error('[Task] 创建任务失败:', error);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      error: '创建任务失败',
      message: error instanceof Error ? error.message : String(error),
      ...(isDev && error instanceof Error ? { stack: error.stack } : {}),
    });
  }
});

export interface CreateTaskBody {
  sessionId?: string;
  message: string;
  mode?: string;
  agentId?: string;
  collectionIds?: string[];
  enableThinking?: boolean;
  parentId?: string;
  branchId?: string;
  isEdit?: boolean;
  editMessageId?: string;
  modelParams?: Record<string, number>;
}

// 创建任务的核心逻辑（抽离为纯函数便于单测；路由层仅做响应包装）。
export async function handleCreateTask(
  body: CreateTaskBody | undefined,
  userId?: string | null
): Promise<{ status: number; body: any }> {
  const { sessionId, message, mode = 'agent', agentId, collectionIds, enableThinking, parentId, branchId, isEdit, editMessageId, modelParams } = body || {};
  if (!message || typeof message !== 'string') {
    return { status: 400, body: { error: 'message 不能为空' } };
  }
  let sid = sessionId;
  if (!sid) {
    sid = (await createSession(undefined, undefined, undefined, userId ?? null)).id;
  } else if (!(await assertSessionOwner(sid, userId ?? null))) {
    return { status: 403, body: { error: '无权访问该会话' } };
  }

  // 写入用户消息（编辑模式不新增：消息已由 editMessageApi 更新）
  let userMessageId: string | undefined;
  if (!isEdit) {
    userMessageId = await addMessage(sid, 'user', message, mode, {
      parentId: typeof parentId === 'string' ? parentId : undefined,
      branchId: typeof branchId === 'string' ? branchId : undefined,
    });
  }

  const task = taskManager.create({
    sessionId: sid,
    userId: userId ?? null,
    mode,
    prompt: message,
  });

  // 后台执行（fire-and-forget）
  runTaskInBackground({
    taskId: task.id,
    sessionId: sid,
    userId: userId ?? null,
    message,
    mode,
    agentId,
    collectionIds,
    enableThinking,
    parentId: typeof parentId === 'string' ? parentId : undefined,
    branchId: typeof branchId === 'string' ? branchId : undefined,
    isEdit: isEdit === true,
    editMessageId: typeof editMessageId === 'string' ? editMessageId : undefined,
    modelParams: modelParams && typeof modelParams === 'object' ? modelParams : undefined,
    userMessageId,
  }).catch((e) => {
    console.error('[Task] 后台执行失败:', e);
    taskManager.setError(task.id, e instanceof Error ? e.message : String(e));
  });

  return { status: 200, body: { taskId: task.id, sessionId: sid } };
}

// 任务列表（默认按当前用户 userId 过滤；游客仅见自己创建的任务）
router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { sessionId, status } = req.query;
  const list = taskManager.list({
    sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    userId: req.userId ?? null,
    status: typeof status === 'string' ? status : undefined,
  });
  res.json({
    tasks: list.map((t) => ({
      id: t.id,
      sessionId: t.sessionId,
      mode: t.mode,
      status: t.status,
      prompt: t.prompt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      eventCount: t.events.length,
      approval: t.approval,
    })),
  });
});

// 任务详情
router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  const task = taskManager.get(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json({
    id: task.id,
    sessionId: task.sessionId,
    mode: task.mode,
    status: task.status,
    prompt: task.prompt,
    result: task.result,
    error: task.error,
    tokenUsage: task.tokenUsage,
    plan: task.plan,
    agentTrace: task.agentTrace,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    eventCount: task.events.length,
    approval: task.approval,
  });
});

// SSE 事件订阅（支持 ?cursor= 断线重连补齐）
router.get('/:id/events', optionalAuth, async (req: AuthRequest, res: Response) => {
  const task = taskManager.get(req.params.id);
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // 安全写入：响应已关闭/销毁时跳过，且吞掉写入异常，避免未捕获异常导致进程崩溃
  const safeWrite = (chunk: string) => {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(chunk);
    } catch {
      /* 忽略已断开连接的写入错误 */
    }
  };

  const cursor = parseInt((req.query.cursor as string) || '0', 10) || 0;

  // 补发 cursor 之后的历史事件
  for (const ev of task.events) {
    if (ev.seq > cursor) safeWrite(`data: ${JSON.stringify(ev)}\n\n`);
  }

  // 已结束的任务补发后直接告知结束
  if (['completed', 'failed', 'cancelled'].includes(task.status)) {
    safeWrite(
      `data: ${JSON.stringify({ seq: 999999, type: 'status', data: { status: task.status, final: true } })}\n\n`
    );
    res.end();
    return;
  }

  const onEvent = ({ taskId, event }: { taskId: string; event: any }) => {
    if (taskId !== task.id) return;
    safeWrite(`data: ${JSON.stringify(event)}\n\n`);
  };
  taskManager.on('event', onEvent);
  // 连接异常（如客户端断开）时移除监听，避免 socket error 冒泡成未捕获异常
  res.on('error', () => {
    taskManager.off('event', onEvent);
    clearInterval(keepAlive);
  });
  const keepAlive = setInterval(() => safeWrite(': ping\n\n'), 15000);

  req.on('close', () => {
    taskManager.off('event', onEvent);
    clearInterval(keepAlive);
  });
});

// 取消任务
router.post('/:id/cancel', optionalAuth, async (req: AuthRequest, res: Response) => {
  const task = taskManager.get(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  taskManager.requestCancel(req.params.id);
  res.json({ ok: true, status: taskManager.get(req.params.id)?.status });
});

// 审批（恢复挂起的任务）
router.post('/:id/approve', optionalAuth, async (req: AuthRequest, res: Response) => {
  const task = taskManager.get(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const { approved, remember } = req.body || {};
  if (approved === true && remember === true && task.approval?.kind && task.sessionId) {
    taskManager.rememberApproval(task.sessionId, task.approval.kind);
  }
  const ok = taskManager.resolveApproval(req.params.id, approved === true);
  if (!ok) return res.status(409).json({ error: '当前没有待审批的请求' });
  res.json({ ok: true, status: 'running' });
});

// Plan 前置确认（恢复挂起的任务）
router.post('/:id/plan-confirm', optionalAuth, async (req: AuthRequest, res: Response) => {
  const task = taskManager.get(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const { confirmed, feedback } = req.body || {};
  const ok = taskManager.resolvePlanConfirm(req.params.id, confirmed === true, typeof feedback === 'string' ? feedback : undefined);
  if (!ok) return res.status(409).json({ error: '当前没有待确认的计划' });
  res.json({ ok: true, status: 'running' });
});

export default router;
