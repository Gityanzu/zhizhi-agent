/**
 * Agent 市场相关类型定义
 */

/**
 * 导出的 Agent 数据
 */
export interface AgentExport {
  version: string;
  agent: {
    id: string;
    name: string;
    avatar: string;
    description: string;
    systemPrompt: string;
    model: string;
    tools: string[];
    temperature: number;
    createdAt: string;
    updatedAt: string;
  };
  exportTime: string;
  format: string;
}

/**
 * 导入的 Agent 数据
 */
export interface AgentImport {
  name?: string;
  avatar?: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  tools?: string[];
  temperature?: number;
}

/**
 * 模板数据
 */
export interface AgentTemplate {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  model: string;
  tools: string[];
  temperature: number;
  category: string;
  tags?: string[];
  downloadCount?: number;
  rating?: number;
  reviewCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 模板列表响应
 */
export interface TemplateListResponse {
  templates: AgentTemplate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 模板下载
 */
export interface TemplateDownload extends AgentTemplate {
  downloadUrl: string;
  downloadToken: string;
  expiresAt: string;
}
