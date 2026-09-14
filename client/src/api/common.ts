import { api } from './request';
import type { CodeExecutionResult, DBConnectionData, ShareResult, ApiKeyItem } from '@/types';

// ===== 代码执行 =====
export async function executeCode(code: string, language: string): Promise<CodeExecutionResult> {
  const res = await api.post('/code/execute', { code, language });
  return res.data;
}

// ===== 数据库连接管理 =====
export async function getDBConnections(): Promise<{ connections: DBConnectionData[] }> {
  const res = await api.get('/db/connections');
  return res.data;
}

export async function createDBConnection(data: Partial<DBConnectionData> & { password?: string }): Promise<DBConnectionData> {
  const res = await api.post('/db/connections', data);
  return res.data;
}

export async function updateDBConnectionApi(id: string, data: any): Promise<DBConnectionData> {
  const res = await api.put(`/db/connections/${id}`, data);
  return res.data;
}

export async function deleteDBConnectionApi(id: string) {
  await api.delete(`/db/connections/${id}`);
}

export async function testDBConnectionApi(id: string): Promise<{ success: boolean; message: string }> {
  const res = await api.post(`/db/connections/${id}/test`);
  return res.data;
}

export async function getDBSchemaApi(id: string): Promise<{ schema: any[] }> {
  const res = await api.get(`/db/connections/${id}/schema`);
  return res.data;
}

export async function queryDBApi(id: string, body: { question?: string; sql?: string }): Promise<any> {
  const res = await api.post(`/db/connections/${id}/query`, body);
  return res.data;
}

// ===== 分享对话 =====
export async function createShareApi(data: { sessionId: string; password?: string; expiresInHours?: number }): Promise<ShareResult> {
  const res = await api.post('/share', data);
  return res.data;
}

export async function listSharesApi(sessionId: string): Promise<{ shares: any[] }> {
  const res = await api.get(`/share/${sessionId}`);
  return res.data;
}

export async function revokeShareApi(id: string) {
  await api.delete(`/share/${id}`);
}

// ===== 导入对话 =====
export async function importConversationsApi(source: 'chatgpt' | 'claude', file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source', source);
  const res = await api.post('/import/conversations', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// ===== API Key 管理 =====
export async function getApiKeysApi(): Promise<{ keys: ApiKeyItem[] }> {
  const res = await api.get('/api-keys');
  return res.data;
}

export async function createApiKeyApi(name: string): Promise<ApiKeyItem> {
  const res = await api.post('/api-keys', { name });
  return res.data;
}

export async function deleteApiKeyApi(id: string) {
  await api.delete(`/api-keys/${id}`);
}
