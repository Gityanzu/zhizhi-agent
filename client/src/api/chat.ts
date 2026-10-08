import { api } from './request';
import type { SessionInfo } from '@/types';

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

// ===== 会话管理 =====
export async function createSession(title?: string, mode?: string, model?: string): Promise<SessionInfo> {
  const res = await api.post('/api/sessions', { title, mode, model });
  return res.data;
}

export async function getSessions(folderId?: string | null, tag?: string): Promise<SessionInfo[]> {
  const params: Record<string, string> = {};
  if (folderId === null) params.folderId = 'none';
  else if (folderId) params.folderId = folderId;
  if (tag) params.tag = tag;
  const res = await api.get('/api/sessions', { params });
  return res.data?.sessions || [];
}

export async function getSessionDetail(id: string, branchId?: string) {
  const res = await api.get(`/api/sessions/${id}`, { params: branchId ? { branchId } : {} });
  return res.data;
}

export async function deleteSession(id: string) {
  await api.delete(`/api/sessions/${id}`);
}

export async function clearSession(id: string) {
  await api.post(`/api/sessions/${id}/clear`);
}

// ===== 对话分支 =====
export async function getBranches(sessionId: string) {
  const res = await api.get(`/api/sessions/${sessionId}/branches`);
  return res.data;
}

export async function switchBranchApi(sessionId: string, branchId: string) {
  const res = await api.post(`/api/sessions/${sessionId}/switch-branch`, { branchId });
  return res.data;
}

export async function editMessageApi(messageId: string, content: string) {
  const res = await api.put(`/api/sessions/messages/${messageId}`, { content });
  return res.data;
}

// ===== 文件夹 =====
export async function getFolders() {
  const res = await api.get('/api/sessions/folders');
  return res.data;
}

export async function createFolderApi(name: string, icon?: string) {
  const res = await api.post('/api/sessions/folders', { name, icon });
  return res.data;
}

export async function updateFolderApi(folderId: string, name?: string, icon?: string) {
  const res = await api.put(`/api/sessions/folders/${folderId}`, { name, icon });
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
