import { api, getToken } from './request';
import type { StreamChunk } from '@/types';

// 创建异步任务（立即返回 taskId，后台执行）
export async function createTask(payload: {
  message: string;
  sessionId?: string;
  mode?: string;
  agentId?: string;
  collectionIds?: string[];
  enableThinking?: boolean;
}): Promise<{ taskId: string; sessionId: string }> {
  const res = await api.post('/api/tasks', payload);
  return res.data;
}

// 取消任务
export async function cancelTask(taskId: string) {
  const res = await api.post(`/api/tasks/${taskId}/cancel`);
  return res.data;
}

// 审批（文件/目录写操作）：恢复挂起的任务
export async function approveTask(taskId: string, approved: boolean, remember: boolean = false) {
  const res = await api.post(`/api/tasks/${taskId}/approve`, { approved, remember });
  return res.data;
}

// Plan 前置确认：恢复挂起的任务
export async function planConfirmTask(taskId: string, confirmed: boolean, feedback?: string) {
  const res = await api.post(`/api/tasks/${taskId}/plan-confirm`, { confirmed, feedback });
  return res.data;
}

// 订阅任务事件流（SSE）。每个事件调用 onChunk；任务终态时由调用方关闭连接。
async function subscribeTaskEvents(
  taskId: string,
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken();
  const response = await fetch(`/api/tasks/${taskId}/events`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr) continue;
        try {
          const chunk = JSON.parse(dataStr) as StreamChunk;
          onChunk(chunk);
        } catch (e) {
          console.warn('解析任务事件失败:', dataStr, e);
        }
      }
    }
  } catch (e: any) {
    // 主动 abort（任务完成/用户停止）属正常关闭
    if (e?.name === 'AbortError') return;
    throw e;
  }
}

// 通过任务引擎发送消息：创建任务 + 订阅事件流。
// 兼容现有 store 的 onChunk 逻辑：先派发 session_id，再透传各事件（统一附带 taskId）。
export async function sendMessageViaTask(
  message: string,
  sessionId: string | undefined,
  mode: string,
  enableThinking: boolean,
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal,
  extra?: {
    parentId?: string;
    branchId?: string;
    modelParams?: Record<string, number>;
    isEdit?: boolean;
    editMessageId?: string;
    agentId?: string;
    collectionIds?: string[];
  }
): Promise<{ taskId: string; sessionId: string }> {
  const res = await api.post('/api/tasks', {
    message,
    sessionId,
    mode,
    enableThinking,
    agentId: extra?.agentId,
    collectionIds: extra?.collectionIds,
    parentId: extra?.parentId,
    branchId: extra?.branchId,
    isEdit: extra?.isEdit,
    editMessageId: extra?.editMessageId,
    modelParams: extra?.modelParams,
  });
  const { taskId, sessionId: sid } = res.data;

  // 派发 session_id 以兼容 store 会话创建逻辑（任务引擎不单独下发该事件）
  onChunk({
    type: 'session_id',
    content: sid,
    mode,
    branch_id: extra?.branchId,
    user_message_id: undefined,
    taskId,
  } as StreamChunk);

  // 内部控制器：任务终态或用户停止时主动关闭 SSE（后端对进行中连接不会自动 end）
  const internal = new AbortController();
  if (signal) {
    if (signal.aborted) internal.abort();
    else signal.addEventListener('abort', () => internal.abort());
  }

  await subscribeTaskEvents(
    taskId,
    (envelope) => {
      // 后端 SSE 格式：{ seq, ts, type, data }，其中 data 才是业务 chunk。
      // 需要把外层 type 与内层 data 合并成一份 StreamChunk 再抛给 store。
      const inner = (envelope.data || {}) as Partial<StreamChunk>;
      const chunk = { type: envelope.type, ...inner, taskId } as StreamChunk;
      onChunk(chunk);
      if (
        envelope.type === 'status' &&
        (inner.final || ['completed', 'failed', 'cancelled'].includes(inner.status as string))
      ) {
        internal.abort();
      }
      if (envelope.type === 'done') {
        internal.abort();
      }
    },
    internal.signal
  );

  return { taskId, sessionId: sid };
}
