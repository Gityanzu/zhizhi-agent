import * as fs from 'fs';
import * as path from 'path';

// 任务存储：内存为主，元数据持久化到 data/tasks.json（事件仅在内存，支持进程存活期内断线重连）。
// 运行中的任务在进程重启后标记为 failed，避免悬挂。

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'need_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskEvent {
  seq: number;
  ts: number;
  type: string;
  data: any;
}

export interface TaskApproval {
  requestId: string;
  kind: string;
  path?: string;
  inRoot?: boolean;
  oldContent?: string;
  newContent?: string;
}

export interface Task {
  id: string;
  sessionId?: string;
  userId?: string | null;
  mode: string;
  prompt: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  result?: string;
  error?: string;
  tokenUsage?: any;
  agentTrace?: any;
  plan?: any;
  events: TaskEvent[];
  approval: TaskApproval | null;
}

const DATA_DIR = path.resolve(__dirname, '../../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class TaskStore {
  private tasks = new Map<string, Task>();
  private seq = new Map<string, number>();

  loadAll(): void {
    try {
      ensureDir();
      if (!fs.existsSync(TASKS_FILE)) return;
      const raw = fs.readFileSync(TASKS_FILE, 'utf-8');
      const arr: Task[] = JSON.parse(raw);
      for (const t of arr) {
        const maxSeq = t.events.reduce((m, e) => Math.max(m, e.seq), 0);
        this.seq.set(t.id, maxSeq);
        // 运行中的任务（进程重启）标记为 failed，避免悬挂
        if (t.status === 'running' || t.status === 'queued' || t.status === 'need_approval') {
          t.status = 'failed';
          t.error = '服务重启，任务中断';
          t.approval = null;
        }
        this.tasks.set(t.id, t);
      }
    } catch (e) {
      console.warn('[TaskStore] 加载任务失败:', e instanceof Error ? e.message : String(e));
    }
  }

  private persist(): void {
    try {
      ensureDir();
      const arr = Array.from(this.tasks.values());
      fs.writeFile(TASKS_FILE, JSON.stringify(arr), () => {});
    } catch (e) {
      console.warn('[TaskStore] 持久化任务失败:', e instanceof Error ? e.message : String(e));
    }
  }

  create(task: Task): Task {
    this.tasks.set(task.id, task);
    this.seq.set(task.id, 0);
    this.persist();
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  list(filter?: { sessionId?: string; userId?: string | null; status?: string }): Task[] {
    let arr = Array.from(this.tasks.values());
    if (filter?.sessionId) arr = arr.filter((t) => t.sessionId === filter.sessionId);
    if (filter?.userId !== undefined) arr = arr.filter((t) => t.userId === filter.userId);
    if (filter?.status) arr = arr.filter((t) => t.status === filter.status);
    return arr.sort((a, b) => b.createdAt - a.createdAt);
  }

  nextSeq(id: string): number {
    const n = (this.seq.get(id) || 0) + 1;
    this.seq.set(id, n);
    return n;
  }

  // 仅写入内存（事件多，避免频繁落盘）；状态变更时再由 update() 持久化。
  appendEvent(id: string, ev: Omit<TaskEvent, 'seq' | 'ts'>): TaskEvent {
    const task = this.tasks.get(id);
    if (!task) throw new Error('task not found: ' + id);
    const full: TaskEvent = { ...ev, seq: this.nextSeq(id), ts: Date.now() };
    task.events.push(full);
    task.updatedAt = full.ts;
    return full;
  }

  update(id: string, patch: Partial<Task>): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    Object.assign(task, patch);
    task.updatedAt = Date.now();
    this.persist();
    return task;
  }
}

export const taskStore = new TaskStore();
