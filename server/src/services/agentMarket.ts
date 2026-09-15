import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { CustomAgent } from '../services/customAgent';
import {
  getAgent,
  getAllAgents,
  createAgent,
  updateAgent,
  deleteAgent,
} from './customAgent';
import type {
  AgentExport,
  AgentImport,
  AgentTemplate,
  TemplateDownload,
} from '../types/agentMarket';

const PERSIST_DIR = path.resolve(__dirname, '../../data');
const TEMPLATES_DIR = path.join(PERSIST_DIR, 'templates');
const EXPORTS_DIR = path.join(PERSIST_DIR, 'exports');
const TEMPLATES_FILE = path.join(TEMPLATES_DIR, 'templates.json');

// 确保目录存在
if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

let templatesMap = new Map<string, AgentTemplate>();
let templatesLoaded = false;

/**
 * 加载模板数据
 */
function loadTemplates(): void {
  if (templatesLoaded) return;
  if (fs.existsSync(TEMPLATES_FILE)) {
    try {
      const raw = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
      const data = JSON.parse(raw) as AgentTemplate[];
      for (const t of data) templatesMap.set(t.id, t);
      console.log(`Agent 模板已加载: ${templatesMap.size} 个`);
    } catch (e) {
      console.warn('加载 Agent 模板失败:', e);
    }
  }
  templatesLoaded = true;
}

/**
 * 保存模板数据
 */
function saveTemplates(): void {
  try {
    const data = Array.from(templatesMap.values());
    fs.writeFileSync(
      TEMPLATES_FILE,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  } catch (e) {
    console.error('保存 Agent 模板失败:', e);
  }
}

/**
 * 验证导入的 Agent 数据
 */
export function validateAgentImport(data: AgentImport): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.name || data.name.trim() === '') {
    errors.push('Agent 名称不能为空');
  }

  if (data.tools && !Array.isArray(data.tools)) {
    errors.push('tools 必须是数组');
  }

  if (
    data.temperature !== undefined &&
    (data.temperature < 0 || data.temperature > 2)
  ) {
    errors.push('temperature 必须在 0-2 之间');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 导出 Agent 为 JSON 文件
 */
export async function exportAgent(agentId: string): Promise<AgentExport> {
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent 不存在: ${agentId}`);
  }

  const exportData: AgentExport = {
    version: '1.0.0',
    agent,
    exportTime: new Date().toISOString(),
    format: 'json',
  };

  return exportData;
}

/**
 * 导出 Agent 为可分享的文件
 */
export async function exportAgentFile(
  agentId: string
): Promise<{ content: string; filename: string; filepath: string }> {
  const exportData = await exportAgent(agentId);

  const filename = `${exportData.agent.name.replace(/\s+/g, '_')}_agent.json`;
  const filepath = path.join(EXPORTS_DIR, filename);

  // 写入文件
  fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf-8');

  return {
    content: JSON.stringify(exportData),
    filename,
    filepath,
  };
}

/**
 * 从 JSON 导入 Agent
 */
export async function importAgentFromJson(jsonData: string): Promise<CustomAgent> {
  try {
    const data = JSON.parse(jsonData) as AgentExport;

    if (data.format !== 'json') {
      throw new Error('不支持的导出格式');
    }

    if (!data.agent) {
      throw new Error('Agent 数据缺失');
    }

    const importData: AgentImport = {
      name: data.agent.name,
      avatar: data.agent.avatar,
      description: data.agent.description,
      systemPrompt: data.agent.systemPrompt,
      model: data.agent.model,
      tools: data.agent.tools,
      temperature: data.agent.temperature,
    };

    // 验证数据
    const validation = validateAgentImport(importData);
    if (!validation.valid) {
      throw new Error(`数据验证失败: ${validation.errors.join(', ')}`);
    }

    // 创建 Agent
    const agent = await createAgent(importData);
    return agent;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('JSON 格式错误');
    }
    throw error;
  }
}

/**
 * 从文件导入 Agent
 */
export async function importAgentFromFile(
  filepath: string
): Promise<CustomAgent> {
  try {
    if (!fs.existsSync(filepath)) {
      throw new Error('文件不存在');
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    return await importAgentFromJson(content);
  } catch (error) {
    throw new Error(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 获取所有可用模板
 */
export async function getTemplates(
  page: number = 1,
  pageSize: number = 10,
  category?: string,
  search?: string
): Promise<{
  templates: AgentTemplate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  loadTemplates();

  let templates = Array.from(templatesMap.values());

  // 分类筛选
  if (category && category !== '全部') {
    templates = templates.filter((t) => t.category === category);
  }

  // 搜索
  if (search) {
    const searchLower = search.toLowerCase();
    templates = templates.filter(
      (t) =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
    );
  }

  // 排序（默认：下载次数降序）
  templates.sort((a, b) => {
    const aCount = a.downloadCount || 0;
    const bCount = b.downloadCount || 0;
    return bCount - aCount;
  });

  // 分页
  const total = templates.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginatedTemplates = templates.slice(start, end);

  return {
    templates: paginatedTemplates,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * 获取模板详情
 */
export async function getTemplate(id: string): Promise<AgentTemplate | null> {
  loadTemplates();
  return templatesMap.get(id) || null;
}

/**
 * 上传模板（管理员功能）
 */
export async function uploadTemplate(
  template: AgentTemplate
): Promise<AgentTemplate> {
  loadTemplates();

  const newTemplate: AgentTemplate = {
    ...template,
    id: template.id || uuidv4(),
    downloadCount: 0,
    rating: 0,
    reviewCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  templatesMap.set(newTemplate.id, newTemplate);
  saveTemplates();

  return newTemplate;
}

/**
 * 下载模板
 */
export async function downloadTemplate(
  id: string
): Promise<TemplateDownload> {
  const template = await getTemplate(id);
  if (!template) {
    throw new Error('模板不存在');
  }

  // 更新下载次数
  const updatedTemplate = {
    ...template,
    downloadCount: (template.downloadCount || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  templatesMap.set(id, updatedTemplate);
  saveTemplates();

  // 生成下载 URL（实际项目中应该是真实的下载链接）
  return {
    ...updatedTemplate,
    downloadUrl: `/api/agent-market/templates/${id}/download`,
    downloadToken: uuidv4(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24小时后过期
  };
}

/**
 * 删除模板
 */
export async function deleteTemplate(id: string): Promise<boolean> {
  loadTemplates();
  const result = templatesMap.delete(id);
  if (result) {
    saveTemplates();
  }
  return result;
}

/**
 * 添加模板下载记录
 */
export async function addTemplateDownloadCount(
  id: string
): Promise<void> {
  loadTemplates();
  const template = templatesMap.get(id);
  if (template) {
    template.downloadCount = (template.downloadCount || 0) + 1;
    template.updatedAt = new Date().toISOString();
    saveTemplates();
  }
}

/**
 * 初始化内置模板（可选）
 */
export async function initBuiltinTemplates(): Promise<void> {
  loadTemplates();
  if (templatesMap.size > 0) {
    return; // 已经有模板了
  }

  const builtinTemplates: Omit<AgentTemplate, 'id' | 'downloadCount' | 'rating' | 'reviewCount' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: '写作助手',
      avatar: '✍️',
      description: '专业写作助手，帮你润色、扩写、改写各类文章',
      systemPrompt:
        '你是一位专业写作助手。擅长文章润色、扩写、缩写、改写。请根据用户需求输出高质量文本，注意语言流畅、逻辑清晰、结构完整。',
      model: '',
      tools: ['web_search', 'summarize_text'],
      temperature: 0.7,
      category: '写作',
      tags: ['写作', '润色', '扩写'],
    },
    {
      name: '代码审查员',
      avatar: '🔍',
      description: '审查代码质量，发现潜在bug和优化点',
      systemPrompt:
        '你是一位资深代码审查员。请仔细分析用户提供的代码，指出潜在bug、安全问题、性能瓶颈，并给出具体的改进建议。',
      model: '',
      tools: ['code_interpreter', 'web_search'],
      temperature: 0.3,
      category: '开发',
      tags: ['代码审查', 'bug修复', '性能优化'],
    },
    {
      name: '数据分析师',
      avatar: '📊',
      description: '数据处理、统计分析与可视化',
      systemPrompt:
        '你是一位数据分析师。擅长数据清洗、统计建模、趋势分析。请用代码解释器处理数据，给出清晰的分析结论和图表。',
      model: '',
      tools: ['code_interpreter', 'search_knowledge_base'],
      temperature: 0.4,
      category: '数据',
      tags: ['数据分析', '统计', '可视化'],
    },
    {
      name: '翻译官',
      avatar: '🌐',
      description: '多语言互译，兼顾语境和地道表达',
      systemPrompt:
        '你是一位专业翻译官，精通中英日韩等多语言。翻译时保持原文语气和语境，输出地道自然的译文。',
      model: '',
      tools: ['translate_text'],
      temperature: 0.5,
      category: '写作',
      tags: ['翻译', '语言', '国际化'],
    },
  ];

  for (const template of builtinTemplates) {
    await uploadTemplate(template as any);
  }

  console.log('内置 Agent 模板已初始化');
}

/**
 * 获取所有分类
 */
export function getCategories(): string[] {
  return ['全部', '写作', '开发', '数据', '生活', '学习', '专业'];
}
