import { api } from './request';
import type {
  AgentExport,
  AgentImport,
  AgentTemplate,
  TemplateListResponse,
  TemplateDownload,
} from '@/types/agentMarket';

// ==================== Agent 导入导出 ====================

/**
 * 导出 Agent 为 JSON 格式
 */
export async function exportAgent(agentId: string): Promise<AgentExport> {
  const res = await api.post(`/agent-market/export/${agentId}`);
  return res.data;
}

/**
 * 导出 Agent 为文件
 */
export async function exportAgentFile(agentId: string): Promise<{
  content: string;
  filename: string;
  filepath: string;
}> {
  const res = await api.post(`/agent-market/export/${agentId}/file`);
  return res.data;
}

/**
 * 从 JSON 导入 Agent
 */
export async function importAgentFromJson(
  jsonData: string
): Promise<AgentImport> {
  const res = await api.post('/agent-market/import', {
    ...JSON.parse(jsonData),
  });
  return res.data;
}

/**
 * 从文件导入 Agent
 */
export async function importAgentFromFile(
  file: File
): Promise<AgentImport> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await api.post('/agent-market/import/file', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return res.data;
}

// ==================== 模板管理 ====================

/**
 * 获取模板列表
 */
export async function getTemplates(
  page: number = 1,
  pageSize: number = 10,
  category?: string,
  search?: string
): Promise<TemplateListResponse> {
  const params: any = { page, pageSize };
  if (category) params.category = category;
  if (search) params.search = search;

  const res = await api.get('/agent-market/templates', { params });
  return res.data;
}

/**
 * 获取模板详情
 */
export async function getTemplate(id: string): Promise<AgentTemplate> {
  const res = await api.get(`/agent-market/templates/${id}`);
  return res.data;
}

/**
 * 上传模板（管理员功能）
 */
export async function uploadTemplate(
  template: Partial<AgentTemplate>
): Promise<AgentTemplate> {
  const res = await api.post('/agent-market/templates', template);
  return res.data;
}

/**
 * 下载模板
 */
export async function downloadTemplate(
  id: string
): Promise<TemplateDownload> {
  const res = await api.get(`/agent-market/templates/${id}/download`);
  return res.data;
}

/**
 * 删除模板
 */
export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/agent-market/templates/${id}`);
}

// ==================== 分类相关 ====================

/**
 * 获取所有分类
 */
export async function getCategories(): Promise<string[]> {
  const res = await api.get('/agent-market/categories');
  return res.data;
}
