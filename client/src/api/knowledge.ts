import { api } from './request';
import type { DocumentInfo, Collection } from '@/types';

// ===== 文档管理 =====
export async function uploadDocument(file: File, collectionId?: string | null): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  if (collectionId) formData.append('collectionId', collectionId);
  const res = await api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function getDocuments(collectionId?: string): Promise<{ documents: DocumentInfo[]; totalChunks: number }> {
  const res = await api.get('/documents/list', {
    params: collectionId ? { collectionId } : {},
  });
  return res.data;
}

export async function deleteDocument(id: string) {
  await api.delete(`/documents/${id}`);
}

export async function getDocumentPreview(id: string): Promise<{ id: string; name: string; size: number; chunkCount: number; content: string }> {
  const res = await api.get(`/documents/${id}/preview`);
  return res.data;
}

// ===== 知识库集合 =====
export async function getCollections(): Promise<{ collections: Collection[] }> {
  const res = await api.get('/collections');
  return res.data;
}

export async function createCollection(data: { name: string; description?: string; icon?: string }): Promise<{ collection: Collection }> {
  const res = await api.post('/collections', data);
  return res.data;
}

export async function updateCollectionApi(id: string, data: { name?: string; description?: string; icon?: string }): Promise<{ collection: Collection }> {
  const res = await api.put(`/collections/${id}`, data);
  return res.data;
}

export async function deleteCollectionApi(id: string) {
  await api.delete(`/collections/${id}`);
}

export async function updateSessionCollectionsApi(sessionId: string, collectionIds: string[]) {
  const res = await api.put(`/sessions/${sessionId}/collections`, { collectionIds });
  return res.data;
}

// ===== 记忆管理 =====
export async function getMemories() {
  const res = await api.get('/memory');
  return res.data;
}

export async function deleteMemory(id: string) {
  const res = await api.delete(`/memory/${id}`);
  return res.data;
}

export async function clearMemories() {
  const res = await api.post('/memory/clear');
  return res.data;
}

// ===== 提示词模板 =====
export async function getPromptTemplates() {
  const res = await api.get('/prompt');
  return res.data;
}

export async function getActivePrompt() {
  const res = await api.get('/prompt/active');
  return res.data;
}

export async function createPromptTemplate(name: string, description: string, content: string) {
  const res = await api.post('/prompt', { name, description, content });
  return res.data;
}

export async function updatePromptTemplate(id: string, name: string, description: string, content: string) {
  const res = await api.put(`/prompt/${id}`, { name, description, content });
  return res.data;
}

export async function deletePromptTemplate(id: string) {
  const res = await api.delete(`/prompt/${id}`);
  return res.data;
}

export async function activatePromptTemplate(id: string) {
  const res = await api.post(`/prompt/${id}/activate`);
  return res.data;
}
