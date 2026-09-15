/**
 * Agent 市场相关类型定义
 */

import { CustomAgent } from './index';

/**
 * 导出的 Agent 数据（用于分享和导入）
 */
export interface AgentExport {
  version: string;
  agent: CustomAgent;
  exportTime: string;
  format: 'json';
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
}

/**
 * 模板下载
 */
export interface TemplateDownload extends AgentTemplate {
  downloadUrl: string;
  downloadToken: string;
  expiresAt: string;
}
