import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { taskStore, Task, TaskStatus, TaskEvent, TaskApproval } from './taskStore';
import type { ApprovalRequest } from './agent';

// 审批等待上限。原来是 120s：用户稍微走开一会儿（读一下请求内容、对比一下 diff），
// 审批就会被静默按"拒绝"处理 —— 工具没执行，模型却收到"用户已拒绝"，任务在
// 莫名其妙的地方拐弯。放宽到 10 分钟，与 Plan 前置确认保持一致。
const APPROVAL_TIMEOUT_MS = Number(process.env.APPROVAL_TIMEOUT_MS) || 10 * 60 * 1000;
const PLAN_CONFIRM_TIMEOUT_MS = 10 * 60 * 1000; // Plan 前置确认超时（10 分钟）

interface PendingApproval {
  resolve: (v: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingPlanConfirm {
  resolve: (v: { confirmed: boolean; feedback?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

// 任务管理器：状态机 + 事件分发（供 SSE 订阅）+ HITL 挂起/恢复 + 取消。
export class TaskManager extends EventEmitter {
  private pending = new Map<string, PendingApproval>();
  private pendingPlanConfirms = new Map<string, PendingPlanConfirm>();
  private rememberedApprovals = new Set<string>();
  private cancelled = new Set<string>();
  /**
   * 审批超时这类「不是用户主动决定」的事件必须让用户看见。
   * 但它们由本类直接产生、不经过 agent 的生成器，所以拿不到 taskRunner 手里的
   * 消息正文（full）；这里先暂存，等 taskRunner 收尾时并入正文一起落库，
   * 否则提示只在流式过程中闪一下，刷新页面就没了。
   */
  private notices = new Map<string, string[]>();

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
    // 监听器（SSE 订阅）若抛异常，吞掉以免冒泡成未捕获异常导致进程崩溃
    try {
      this.emit('event', { taskId: id, event: ev });
    } catch (e) {
      console.error('[TaskManager] 事件广播失败（已忽略，不影响任务）:', e);
    }
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
        // 不能只是静默 resolve(false)：用户什么都没看到，模型却被告知"用户已拒绝"。
        // 这里既推一条实时事件（用户当场能看到），也记入 notices 由 taskRunner 落库。
        const notice =
          `[审批超时] 等待授权超过 ${Math.round(APPROVAL_TIMEOUT_MS / 60000)} 分钟未收到确认，` +
          `本次未执行「${areq.path || areq.kind}」。如仍需要它，请在下一次弹窗时及时确认。`;
        this.notices.set(taskId, [...(this.notices.get(taskId) || []), notice]);
        this.emitEvent(taskId, 'token', { type: 'token', content: `\n\n> ${notice}\n\n` });
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
        description: areq.description,
      };
      taskStore.update(taskId, { status: 'need_approval', approval });
      this.emitEvent(taskId, 'approval_required', areq);
    });
  }

  /** 取出并清空暂存的提示（由 taskRunner 在收尾时并入消息正文） */
  drainNotices(taskId: string): string[] {
    const list = this.notices.get(taskId);
    if (!list || list.length === 0) return [];
    this.notices.delete(taskId);
    return list;
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

  // HITL：挂起任务等待 Plan 前置确认（前端调 /api/tasks/:id/plan-confirm 恢复）
  requestPlanConfirm(taskId: string, plan: any): Promise<{ confirmed: boolean; feedback?: string }> {
    if (this.cancelled.has(taskId)) return Promise.resolve({ confirmed: false });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPlanConfirms.delete(taskId);
        this.setStatus(taskId, 'running', { planConfirm: null });
        resolve({ confirmed: false });
      }, PLAN_CONFIRM_TIMEOUT_MS);
      this.pendingPlanConfirms.set(taskId, { resolve, timer });
      taskStore.update(taskId, { status: 'need_plan_confirm', planConfirm: plan });
      this.emitEvent(taskId, 'plan_proposed', { plan });
    });
  }

  resolvePlanConfirm(taskId: string, confirmed: boolean, feedback?: string): boolean {
    const p = this.pendingPlanConfirms.get(taskId);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pendingPlanConfirms.delete(taskId);
    taskStore.update(taskId, { status: 'running', planConfirm: null });
    p.resolve({ confirmed, feedback });
    return true;
  }

  // “本次会话始终允许”：按 `${sessionId}:${kind}` 记住，内存态，重启即失效（与 chat.ts 内联一致）。
  rememberApproval(sessionId: string | undefined, kind: string): void {
    if (sessionId) this.rememberedApprovals.add(`${sessionId}:${kind}`);
  }

  isRemembered(sessionId: string | undefined, kind: string): boolean {
    return sessionId ? this.rememberedApprovals.has(`${sessionId}:${kind}`) : false;
  }

  requestCancel(id: string): void {
    this.cancelled.add(id);
    const p = this.pending.get(id);
    if (p) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      taskStore.update(id, { status: 'cancelled', approval: null });
      p.resolve(false);
      return;
    }
    const pp = this.pendingPlanConfirms.get(id);
    if (pp) {
      clearTimeout(pp.timer);
      this.pendingPlanConfirms.delete(id);
      taskStore.update(id, { status: 'cancelled', planConfirm: null });
      pp.resolve({ confirmed: false });
      return;
    }
    this.setStatus(id, 'cancelled');
  }

  isCancelled(id: string): boolean {
    return this.cancelled.has(id);
  }
}

export const taskManager = new TaskManager();
