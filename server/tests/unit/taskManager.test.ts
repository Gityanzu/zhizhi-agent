import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskManager } from '../../src/services/taskManager';

// 内存版 taskStore mock（避免落盘与持久化副作用，并保留 list 过滤语义）
vi.mock('../../src/services/taskStore', () => {
  const tasks = new Map<string, any>();
  const seq = new Map<string, number>();
  function nextSeq(id: string) {
    const n = (seq.get(id) || 0) + 1;
    seq.set(id, n);
    return n;
  }
  return {
    taskStore: {
      loadAll() {},
      create(t: any) { tasks.set(t.id, t); return t; },
      get(id: string) { return tasks.get(id); },
      list(filter?: any) {
        let arr = Array.from(tasks.values());
        if (filter?.sessionId) arr = arr.filter((t: any) => t.sessionId === filter.sessionId);
        if (filter?.userId !== undefined) arr = arr.filter((t: any) => t.userId === filter.userId);
        if (filter?.status) arr = arr.filter((t: any) => t.status === filter.status);
        return arr.sort((a: any, b: any) => b.createdAt - a.createdAt);
      },
      appendEvent(id: string, ev: any) {
        const t = tasks.get(id);
        if (!t) throw new Error('task not found: ' + id);
        const full = { ...ev, seq: nextSeq(id), ts: Date.now() };
        t.events.push(full);
        t.updatedAt = full.ts;
        return full;
      },
      update(id: string, patch: any) {
        const t = tasks.get(id);
        if (!t) return undefined;
        Object.assign(t, patch);
        t.updatedAt = Date.now();
        return t;
      },
    },
  };
});

describe('TaskManager', () => {
  let tm: TaskManager;
  beforeEach(() => {
    tm = new TaskManager();
  });

  describe('create / get / list', () => {
    it('create 返回带 id 的 queued 任务', () => {
      const t = tm.create({ mode: 'agent', prompt: 'hi' });
      expect(t.id).toBeDefined();
      expect(t.status).toBe('queued');
      expect(tm.get(t.id)).toBe(t);
    });

    it('list 可按 sessionId / userId / status 过滤', () => {
      const a = tm.create({ sessionId: 's1', userId: 'u1', mode: 'agent', prompt: 'a' });
      tm.create({ sessionId: 's2', userId: 'u2', mode: 'agent', prompt: 'b' });
      expect(tm.list({ sessionId: 's1' })).toHaveLength(1);
      tm.setStatus(a.id, 'completed');
      expect(tm.list({ sessionId: 's1', status: 'completed' })).toHaveLength(1);
      expect(tm.list({ userId: 'u2' })).toHaveLength(1);
    });
  });

  describe('emitEvent', () => {
    it('追加事件并广播 event', () => {
      const t = tm.create({ mode: 'agent', prompt: 'hi' });
      const received: any[] = [];
      tm.on('event', (p) => received.push(p));
      const ev = tm.emitEvent(t.id, 'token', { content: 'x' });
      expect(ev.seq).toBe(1);
      expect(tm.get(t.id)!.events).toHaveLength(1);
      expect(received[0]).toEqual({ taskId: t.id, event: ev });
    });
  });

  describe('状态转换', () => {
    it('setStatus / setResult / setError', () => {
      const t = tm.create({ mode: 'agent', prompt: 'hi' });
      tm.setStatus(t.id, 'running');
      expect(tm.get(t.id)!.status).toBe('running');
      tm.setResult(t.id, 'done', { tokenUsage: { total: 1 } });
      expect(tm.get(t.id)!.status).toBe('completed');
      expect(tm.get(t.id)!.result).toBe('done');
      const t2 = tm.create({ mode: 'agent', prompt: 'x' });
      tm.setError(t2.id, 'boom');
      expect(tm.get(t2.id)!.status).toBe('failed');
      expect(tm.get(t2.id)!.error).toBe('boom');
    });
  });

  describe('审批 HITL', () => {
    it('requestApproval 挂起为 need_approval，resolveApproval 恢复为 running', async () => {
      const t = tm.create({ sessionId: 's', mode: 'agent', prompt: 'hi' });
      const p = tm.requestApproval(t.id, { requestId: 'r1', kind: 'write', path: 'a.ts' });
      expect(tm.get(t.id)!.status).toBe('need_approval');
      expect(tm.get(t.id)!.approval?.requestId).toBe('r1');
      const resolved = tm.resolveApproval(t.id, true);
      expect(resolved).toBe(true);
      expect(tm.get(t.id)!.status).toBe('running');
      expect(tm.get(t.id)!.approval).toBeNull();
      expect(await p).toBe(true);
    });

    it('无待审批时 resolveApproval 返回 false（对应端点 409）', () => {
      const t = tm.create({ mode: 'agent', prompt: 'hi' });
      expect(tm.resolveApproval(t.id, true)).toBe(false);
    });

    it('取消时挂起的审批以 false 恢复', async () => {
      const t = tm.create({ mode: 'agent', prompt: 'hi' });
      const p = tm.requestApproval(t.id, { requestId: 'r2', kind: 'write' });
      tm.requestCancel(t.id);
      expect(await p).toBe(false);
      expect(tm.get(t.id)!.status).toBe('cancelled');
    });
  });

  describe('Plan 前置确认 HITL', () => {
    it('requestPlanConfirm 挂起为 need_plan_confirm，resolvePlanConfirm 恢复', async () => {
      const t = tm.create({ sessionId: 's', mode: 'plan', prompt: 'hi' });
      const p = tm.requestPlanConfirm(t.id, [{ title: 'step1' }]);
      expect(tm.get(t.id)!.status).toBe('need_plan_confirm');
      const resolved = tm.resolvePlanConfirm(t.id, true, 'ok');
      expect(resolved).toBe(true);
      expect(tm.get(t.id)!.status).toBe('running');
      expect(await p).toEqual({ confirmed: true, feedback: 'ok' });
    });

    it('无待确认时 resolvePlanConfirm 返回 false（对应端点 409）', () => {
      const t = tm.create({ mode: 'plan', prompt: 'hi' });
      expect(tm.resolvePlanConfirm(t.id, true)).toBe(false);
    });

    it('取消时挂起的 Plan 确认以 confirmed:false 恢复', async () => {
      const t = tm.create({ mode: 'plan', prompt: 'hi' });
      const p = tm.requestPlanConfirm(t.id, []);
      tm.requestCancel(t.id);
      expect(await p).toEqual({ confirmed: false });
    });
  });

  describe('记住授权', () => {
    it('rememberApproval / isRemembered 按 sessionId:kind 记忆', () => {
      expect(tm.isRemembered('s', 'write')).toBe(false);
      tm.rememberApproval('s', 'write');
      expect(tm.isRemembered('s', 'write')).toBe(true);
      expect(tm.isRemembered('s', 'delete')).toBe(false);
      expect(tm.isRemembered('other', 'write')).toBe(false);
    });
  });

  describe('取消', () => {
    it('普通（运行中）任务 requestCancel 置 cancelled', () => {
      const t = tm.create({ mode: 'agent', prompt: 'hi' });
      tm.requestCancel(t.id);
      expect(tm.get(t.id)!.status).toBe('cancelled');
      expect(tm.isCancelled(t.id)).toBe(true);
    });
  });
});
