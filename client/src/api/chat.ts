import { api, API_BASE_URL } from './request';
import type { SessionInfo, StreamChunk } from '@/types';

// 发送消息（非流式）
export async function sendMessage(
  message: string,
  sessionId?: string,
  mode: string = 'agent',
  enableThinking: boolean = false
) {
  const res = await api.post('/chat/send', {
    message,
    sessionId,
    mode,
    enableThinking,
  });
  return res.data;
}

// 发送消息（流式 SSE）
export async function sendMessageStream(
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
): Promise<void> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message, sessionId, mode, enableThinking,
      parentId: extra?.parentId,
      branchId: extra?.branchId,
      modelParams: extra?.modelParams,
      isEdit: extra?.isEdit,
      editMessageId: extra?.editMessageId,
      agentId: extra?.agentId,
      collectionIds: extra?.collectionIds,
    }),
    signal,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;

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
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const chunk = JSON.parse(dataStr) as StreamChunk;
          if (chunk.type === 'done') {
            receivedDone = true;
          }
          onChunk(chunk);
        } catch (e) {
          console.warn('解析 SSE 数据失败:', dataStr, e);
        }
      }
    }
  } finally {
    // 如果流结束但没有收到 done 事件，手动触发一个 done 事件
    if (!receivedDone && !signal?.aborted) {
      console.warn('[sendMessageStream] 流结束但未收到 done 事件，手动触发');
      onChunk({ type: 'done', content: '' });
    }
  }
}

// 图片理解（多模态）
export async function analyzeImage(
  imageBase64: string,
  question: string,
  sessionId?: string
) {
  const res = await api.post('/chat/vision', {
    image: imageBase64,
    question,
    sessionId,
  });
  return res.data;
}

// 流式对话（旧版兼容）
export async function streamChat(
  message: string,
  sessionId: string | undefined,
  mode: string,
  onChunk: (chunk: StreamChunk) => void,
  onDone: () => void,
  onError: (error: string) => void
) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId, mode }),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data) {
            try {
              const chunk: StreamChunk = JSON.parse(data);
              onChunk(chunk);
              if (chunk.type === 'done') onDone();
            } catch (e) {
              console.error('解析SSE数据失败:', e);
            }
          }
        }
      }
    }
    onDone();
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}

// ===== 会话管理 =====
export async function createSession(title?: string, mode?: string, model?: string): Promise<SessionInfo> {
  const res = await api.post('/sessions', { title, mode, model });
  return res.data;
}

export async function getSessions(folderId?: string | null, tag?: string): Promise<SessionInfo[]> {
  const params: Record<string, string> = {};
  if (folderId === null) params.folderId = 'none';
  else if (folderId) params.folderId = folderId;
  if (tag) params.tag = tag;
  const res = await api.get('/sessions', { params });
  return res.data.sessions;
}

export async function getSessionDetail(id: string, branchId?: string) {
  const res = await api.get(`/sessions/${id}`, { params: branchId ? { branchId } : {} });
  return res.data;
}

export async function deleteSession(id: string) {
  await api.delete(`/sessions/${id}`);
}

export async function clearSession(id: string) {
  await api.post(`/sessions/${id}/clear`);
}

// ===== 对话分支 =====
export async function getBranches(sessionId: string) {
  const res = await api.get(`/sessions/${sessionId}/branches`);
  return res.data;
}

export async function switchBranchApi(sessionId: string, branchId: string) {
  const res = await api.post(`/sessions/${sessionId}/switch-branch`, { branchId });
  return res.data;
}

export async function editMessageApi(messageId: string, content: string) {
  const res = await api.put(`/sessions/messages/${messageId}`, { content });
  return res.data;
}

// ===== 文件夹 =====
export async function getFolders() {
  const res = await api.get('/sessions/folders');
  return res.data;
}

export async function createFolderApi(name: string, icon?: string) {
  const res = await api.post('/sessions/folders', { name, icon });
  return res.data;
}

export async function updateFolderApi(folderId: string, name?: string, icon?: string) {
  const res = await api.put(`/sessions/folders/${folderId}`, { name, icon });
  return res.data;
}

export async function deleteFolderApi(folderId: string) {
  await api.delete(`/sessions/folders/${folderId}`);
}

// ===== 会话归类 / 置顶 / 标签 =====
export async function moveToFolderApi(sessionId: string, folderId: string | null) {
  const res = await api.put(`/sessions/${sessionId}/folder`, { folderId });
  return res.data;
}

export async function togglePinApi(sessionId: string) {
  const res = await api.post(`/sessions/${sessionId}/pin`);
  return res.data;
}

export async function updateTagsApi(sessionId: string, tags: string[]) {
  const res = await api.put(`/sessions/${sessionId}/tags`, { tags });
  return res.data;
}

export async function updateSessionModelModeApi(sessionId: string, mode?: string, model?: string) {
  const res = await api.put(`/sessions/${sessionId}/model-mode`, { mode, model });
  return res.data;
}
