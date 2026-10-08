import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/session', () => ({
  createSession: vi.fn(),
  assertSessionOwner: vi.fn(),
  addMessage: vi.fn(),
}));

vi.mock('../../src/services/taskManager', () => ({
  taskManager: {
    create: vi.fn(() => ({ id: 'task-id' })),
    setError: vi.fn(),
  },
}));

vi.mock('../../src/services/taskRunner', () => ({
  runTaskInBackground: vi.fn(() => Promise.resolve()),
}));

// 避免加载 auth 中间件（及其 db 连接池）导致 vitest 进程跑完测试后不退出
vi.mock('../../src/middleware/auth', () => ({
  optionalAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

import { handleCreateTask } from '../../src/routes/task';
import { createSession, assertSessionOwner, addMessage } from '../../src/services/session';
import { taskManager } from '../../src/services/taskManager';
import { runTaskInBackground } from '../../src/services/taskRunner';

describe('handleCreateTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('message 为空返回 400', async () => {
    const r = await handleCreateTask({ message: '' }, null);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('message 不能为空');
  });

  it('正常创建：新建会话、写用户消息、启动后台任务', async () => {
    vi.mocked(createSession).mockResolvedValue({ id: 'new-sid' });
    vi.mocked(addMessage).mockResolvedValue('msg-1');
    const r = await handleCreateTask({ message: 'hi', mode: 'agent' }, 'u1');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ taskId: 'task-id', sessionId: 'new-sid' });
    expect(createSession).toHaveBeenCalled();
    expect(addMessage).toHaveBeenCalledWith('new-sid', 'user', 'hi', 'agent', {
      parentId: undefined,
      branchId: undefined,
    });
    expect(taskManager.create).toHaveBeenCalledWith({
      sessionId: 'new-sid',
      userId: 'u1',
      mode: 'agent',
      prompt: 'hi',
    });
    expect(runTaskInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-id', sessionId: 'new-sid', message: 'hi', isEdit: false, userMessageId: 'msg-1' })
    );
  });

  it('编辑模式不写用户消息，透传 editMessageId / branchId', async () => {
    vi.mocked(assertSessionOwner).mockResolvedValue(true);
    const r = await handleCreateTask(
      { sessionId: 's1', message: 'edited', mode: 'qa', isEdit: true, editMessageId: 'e1', branchId: 'b1' },
      'u1'
    );
    expect(r.status).toBe(200);
    expect(addMessage).not.toHaveBeenCalled();
    expect(runTaskInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ isEdit: true, editMessageId: 'e1', branchId: 'b1', userMessageId: undefined })
    );
  });

  it('会话归属校验失败返回 403 且不创建任务', async () => {
    vi.mocked(assertSessionOwner).mockResolvedValue(false);
    const r = await handleCreateTask({ sessionId: 's1', message: 'hi' }, 'u1');
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('无权访问该会话');
    expect(taskManager.create).not.toHaveBeenCalled();
  });

  it('透传 parentId / branchId 到 addMessage 与后台任务', async () => {
    vi.mocked(createSession).mockResolvedValue({ id: 's2' });
    vi.mocked(addMessage).mockResolvedValue('m2');
    await handleCreateTask({ message: 'hi', parentId: 'p1', branchId: 'b1' }, null);
    expect(addMessage).toHaveBeenCalledWith('s2', 'user', 'hi', 'agent', { parentId: 'p1', branchId: 'b1' });
    expect(runTaskInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'p1', branchId: 'b1' })
    );
  });

  it('modelParams 仅当为对象时透传', async () => {
    vi.mocked(createSession).mockResolvedValue({ id: 's3' });
    await handleCreateTask({ message: 'hi', modelParams: { temperature: 0.5 } }, null);
    expect(runTaskInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ modelParams: { temperature: 0.5 } })
    );
    vi.clearAllMocks();
    vi.mocked(createSession).mockResolvedValue({ id: 's4' });
    await handleCreateTask({ message: 'hi', modelParams: 'bad' as any }, null);
    expect(runTaskInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ modelParams: undefined })
    );
  });
});
