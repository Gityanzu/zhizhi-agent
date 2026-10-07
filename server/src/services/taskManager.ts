import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { taskStore, Task, TaskStatus, TaskEvent, TaskApproval } from './taskStore';
import type { ApprovalRequest } from './agent';

const APPROVAL_TIMEOUT_MS = 120000;

interface PendingApproval {
  resolve: (v: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

// 任务管理器：状态机 + 事件分发（供 SSE 订阅）+ HITL 挂起/恢复 + 取消。
class TaskManager extends EventEmitter {
  private pending = new Map<string, PendingApproval>();
  private cancelled = new Set<string>();

  constructor() {
    super();
    // 任务可能较多订阅者，关闭 maxListeners 警告
    this.setMaxListeners(0);
  }

  init(): void {
    taskStore.loadAll();
  }

  create(input: { sessionId?: string; userId?: string | null; mode: string; prompt: string }): Task {
    const now = Date.now();
    const task: Task = {
      id: randomUUID(),
      sessionId: input.sessionId,
      userId: input.userId,
      mode: input.mode,
      prompt: input.prompt,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      events: [],
      approval: null,
    };
    return taskStore.create(task);
  }

  get(id: string): Task | undefined {
    return taskStore.get(id);
  }

  list(filter?: { sessionId?: string; userId?: string | null; status?: string }): Task[] {
    return taskStore.list(filter);
  }

  // 推送一个事件（写入内存并广播给 SSE 订阅者）
  emitEvent(id: string, type: string, data: any): TaskEvent {
    const ev = taskStore.appendEvent(id, { type, data });
    this.emit('event', { taskId: id, event: ev });
    return ev;
  }

  setStatus(id: string, status: TaskStatus, patch: Partial<Task> = {}): Task | undefined {
    const updated = taskStore.update(id, { status, ...patch });
    if (updated) this.emitEvent(id, 'status', { status, ...patch });
    return updated;
  }

  setResult(id: string, result: string, extra: Partial<Task> = {}): Task | undefined {
    return this.setStatus(id, 'completed', { result, ...extra });
  }

  setError(id: string, error: string): Task | undefined {
    return this.setStatus(id, 'failed', { error });
  }

  // HITL：挂起任务，等待外部审批（前端调 /api/tasks/:id/approve 恢复）
  requestApproval(taskId: string, areq: ApprovalRequest): Promise<boolean> {
    if (this.cancelled.has(taskId)) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(taskId);
        this.setStatus(taskId, 'running', { approval: null });
        resolve(false);
      }, APPROVAL_TIMEOUT_MS);
      this.pending.set(taskId, { resolve, timer });
      const approval: TaskApproval = {
        requestId: areq.requestId,
        kind: areq.kind,
        path: areq.path,
        inRoot: areq.inRoot,
        oldContent: areq.oldContent,
        newContent: areq.newContent,
      };
      taskStore.update(taskId, { status: 'need_approval', approval });
      this.emitEvent(taskId, 'approval_required', areq);
    });
  }

  resolveApproval(taskId: string, approved: boolean): boolean {
    const p = this.pending.get(taskId);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(taskId);
    taskStore.update(taskId, { status: 'running', approval: null });
    p.resolve(approved);
    return true;
  }

  requestCancel(id: string): void {
    this.cancelled.add(id);
    const p = this.pending.get(id);
    if (p) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      taskStore.update(id, { status: 'cancelled', approval: null });
      p.resolve(false);
    } else {
      this.setStatus(id, 'cancelled');
    }
  }

  isCancelled(id: string): boolean {
    return this.cancelled.has(id);
  }
}

export const taskManager = new TaskManager();
