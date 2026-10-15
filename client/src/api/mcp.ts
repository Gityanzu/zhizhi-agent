import { api } from './request';

export interface McpServer {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getMcpServers(): Promise<McpServer[]> {
  const res = await api.get('/api/mcp/servers');
  return res.data.servers || [];
}

export async function createMcpServer(data: Partial<McpServer>): Promise<McpServer> {
  const res = await api.post('/api/mcp/servers', data);
  return res.data.server;
}

export async function updateMcpServer(id: string, data: Partial<McpServer>): Promise<McpServer> {
  const res = await api.put(`/api/mcp/servers/${id}`, data);
  return res.data.server;
}

export async function deleteMcpServer(id: string): Promise<void> {
  await api.delete(`/api/mcp/servers/${id}`);
}

export async function testMcpServer(id: string): Promise<{ ok: boolean; message: string }> {
  const res = await api.post(`/api/mcp/servers/${id}/test`);
  return res.data;
}

export interface McpToolInfo {
  remoteName: string;
  bridgeName: string;
  description: string;
}

export async function getMcpServerTools(id: string): Promise<McpToolInfo[]> {
  const res = await api.get(`/api/mcp/servers/${id}/tools`);
  return res.data.tools || [];
}
