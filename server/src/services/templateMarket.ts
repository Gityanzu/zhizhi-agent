import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { usePostgres, query } from '../db';
import type {
  PublicTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  ReviewTemplateRequest,
  TemplateListParams,
  TemplateListResponse,
  TemplateFacets,
  FacetOption,
  DownloadRecord,
  TemplateFavorite,
  TemplateStats,
  TemplateVersionHistory,
  TemplateReport,
  TemplateStatus,
  TemplateType,
} from '../types/template';

// 模拟数据 - 实际项目中应该从数据库读取
const SAMPLE_TEMPLATES: PublicTemplate[] = [
  {
    id: 'template-1',
    name: 'code-assistant',
    title: '智能代码助手',
    description: '专业的代码生成和调试助手，支持多种编程语言',
    systemPrompt: '你是一个专业的编程助手，擅长代码生成、调试和优化...',
    model: 'gpt-4',
    tools: ['code_interpreter', 'web_search'],
    temperature: 0.3,
    category: '开发工具',
    tags: ['编程', '代码', '调试', 'JavaScript', 'Python'],
    type: 'public',
    status: 'approved',
    version: '1.0.0',
    viewCount: 1250,
    downloadCount: 820,
    likeCount: 156,
    rating: 4.5,
    reviewCount: 34,
    author: {
      id: 'author-1',
      name: 'AI开发者',
      avatar: '👨‍💻',
      bio: '专注于AI应用开发',
    },
    features: ['代码生成', '错误修复', '性能优化', '文档生成'],
    screenshots: ['https://example.com/code-assistant-1.png', 'https://example.com/code-assistant-2.png'],
    demoUrl: 'https://example.com/demo/code-assistant',
    documentation: 'https://docs.example.com/code-assistant',
    license: 'MIT',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    publishedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'template-2',
    name: 'creative-writer',
    title: '创意写作助手',
    description: '帮助创作小说、诗歌、文案等创意内容',
    systemPrompt: '你是一位富有创造力的作家，擅长各种文体的创作...',
    model: 'claude-3',
    tools: ['web_search'],
    temperature: 0.8,
    category: '创意写作',
    tags: ['写作', '创意', '文案', '小说', '诗歌'],
    type: 'public',
    status: 'approved',
    version: '1.2.0',
    viewCount: 980,
    downloadCount: 650,
    likeCount: 128,
    rating: 4.7,
    reviewCount: 42,
    author: {
      id: 'author-2',
      name: '文字创作者',
      avatar: '✍️',
      bio: '文学创作爱好者',
    },
    features: ['小说创作', '诗歌生成', '文案优化', '风格模仿'],
    screenshots: ['https://example.com/creative-writer-1.png'],
    demoUrl: 'https://example.com/demo/creative-writer',
    documentation: 'https://docs.example.com/creative-writer',
    license: 'CC BY-SA',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-20T00:00:00Z',
    publishedAt: '2024-01-02T00:00:00Z',
  },
  {
    id: 'template-3',
    name: 'data-analyst',
    title: '数据分析专家',
    description: '专业的数据分析和可视化助手',
    systemPrompt: '你是一位数据科学家，擅长数据分析、可视化和洞察...',
    model: 'gpt-4',
    tools: ['web_search', 'data_analysis'],
    temperature: 0.1,
    category: '数据分析',
    tags: ['数据', '分析', '可视化', '统计', '机器学习'],
    type: 'premium',
    status: 'approved',
    version: '2.0.0',
    viewCount: 750,
    downloadCount: 420,
    likeCount: 98,
    rating: 4.8,
    reviewCount: 28,
    author: {
      id: 'author-3',
      name: '数据科学家',
      avatar: '📊',
      bio: '数据科学专家',
    },
    features: ['数据清洗', '统计分析', '图表生成', '趋势预测'],
    screenshots: ['https://example.com/data-analyst-1.png', 'https://example.com/data-analyst-2.png', 'https://example.com/data-analyst-3.png'],
    demoUrl: 'https://example.com/demo/data-analyst',
    documentation: 'https://docs.example.com/data-analyst',
    license: 'Apache 2.0',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-02-01T00:00:00Z',
    publishedAt: '2024-01-03T00:00:00Z',
  },
];

/**
 * 验证模板数据
 */
function validateTemplate(data: CreateTemplateRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.name || data.name.trim().length < 2) {
    errors.push('模板名称至少需要 2 个字符');
  }

  if (!data.title || data.title.trim().length < 3) {
    errors.push('模板标题至少需要 3 个字符');
  }

  if (!data.description || data.description.trim().length < 10) {
    errors.push('模板描述至少需要 10 个字符');
  }

  if (!data.systemPrompt || data.systemPrompt.trim().length < 50) {
    errors.push('系统提示词至少需要 50 个字符');
  }

  if (!data.model) {
    errors.push('模型不能为空');
  }

  if (!Array.isArray(data.tools) || data.tools.length === 0) {
    errors.push('至少需要一个工具');
  }

  if (data.temperature < 0 || data.temperature > 2) {
    errors.push('温度值必须在 0-2 之间');
  }

  if (!data.category) {
    errors.push('分类不能为空');
  }

  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    errors.push('至少需要一个标签');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 获取所有模板
 */
export async function getAllTemplates(): Promise<PublicTemplate[]> {
  return SAMPLE_TEMPLATES;
}

/**
 * 获取模板列表
 */
export async function getTemplates(params: TemplateListParams): Promise<TemplateListResponse> {
  let templates = [...SAMPLE_TEMPLATES];

  // 筛选
  if (params.query) {
    const query = params.query.toLowerCase();
    templates = templates.filter(template =>
      template.name.toLowerCase().includes(query) ||
      template.title.toLowerCase().includes(query) ||
      template.description.toLowerCase().includes(query) ||
      template.tags.some(tag => tag.toLowerCase().includes(query)) ||
      template.systemPrompt.toLowerCase().includes(query)
    );
  }

  if (params.category) {
    templates = templates.filter(template => template.category === params.category);
  }

  if (params.type) {
    templates = templates.filter(template => template.type === params.type);
  }

  if (params.status) {
    templates = templates.filter(template => template.status === params.status);
  }

  if (params.authorId) {
    templates = templates.filter(template => template.author.id === params.authorId);
  }

  // 排序
  if (params.sortBy) {
    templates.sort((a, b) => {
      let compareValue = 0;

      switch (params.sortBy) {
        case 'latest':
          compareValue = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          break;
        case 'popular':
          compareValue = (b.viewCount + b.downloadCount * 2) - (a.viewCount + a.downloadCount * 2);
          break;
        case 'rating':
          compareValue = b.rating - a.rating;
          break;
        case 'downloads':
          compareValue = b.downloadCount - a.downloadCount;
          break;
      }

      return params.sortOrder === 'desc' ? compareValue : -compareValue;
    });
  } else {
    // 默认按最新排序
    templates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  // 分页
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 10, 50);
  const total = templates.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTemplates = templates.slice(startIndex, endIndex);

  // 获取聚合信息
  const facets = await getTemplateFacets(templates);

  return {
    templates: paginatedTemplates,
    total,
    page,
    pageSize,
    totalPages,
    facets,
  };
}

/**
 * 获取模板详情
 */
export async function getTemplate(templateId: string): Promise<PublicTemplate | null> {
  const template = SAMPLE_TEMPLATES.find(t => t.id === templateId);

  if (!template) {
    return null;
  }

  // 增加查看次数
  template.viewCount += 1;

  return { ...template };
}

/**
 * 创建模板
 */
export async function createTemplate(
  data: CreateTemplateRequest,
  authorId: string,
  authorName: string
): Promise<PublicTemplate> {
  const validation = validateTemplate(data);
  if (!validation.valid) {
    throw new Error(`模板验证失败: ${validation.errors.join(', ')}`);
  }

  const template: PublicTemplate = {
    id: uuidv4(),
    name: data.name,
    title: data.title,
    description: data.description,
    systemPrompt: data.systemPrompt,
    model: data.model,
    tools: data.tools,
    temperature: data.temperature,
    category: data.category,
    tags: data.tags,
    type: data.type || 'public',
    status: 'pending',
    version: '1.0.0',
    viewCount: 0,
    downloadCount: 0,
    likeCount: 0,
    rating: 0,
    reviewCount: 0,
    author: {
      id: authorId,
      name: authorName,
    },
    features: data.features || [],
    screenshots: data.screenshots || [],
    demoUrl: data.demoUrl,
    documentation: data.documentation,
    license: data.license || 'MIT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  SAMPLE_TEMPLATES.push(template);

  return template;
}

/**
 * 更新模板
 */
export async function updateTemplate(
  templateId: string,
  data: UpdateTemplateRequest,
  updaterId: string
): Promise<PublicTemplate> {
  const templateIndex = SAMPLE_TEMPLATES.findIndex(t => t.id === templateId);
  if (templateIndex === -1) {
    throw new Error('模板不存在');
  }

  const template = SAMPLE_TEMPLATES[templateIndex];

  // 更新字段
  Object.assign(template, data, {
    updatedAt: new Date().toISOString(),
  });

  return template;
}

/**
 * 审核模板
 */
export async function reviewTemplate(
  templateId: string,
  data: ReviewTemplateRequest,
  reviewerId: string
): Promise<PublicTemplate> {
  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error('模板不存在');
  }

  template.status = data.status;
  template.updatedAt = new Date().toISOString();

  if (data.status === 'approved') {
    template.publishedAt = new Date().toISOString();
  }

  if (data.reason || data.suggestedChanges) {
    template.reviewReason = {
      reason: data.reason || '',
      suggestedChanges: data.suggestedChanges,
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
    };
  }

  return template;
}

/**
 * 删除模板
 */
export async function deleteTemplate(templateId: string, userId: string): Promise<boolean> {
  const templateIndex = SAMPLE_TEMPLATES.findIndex(t => t.id === templateId);
  if (templateIndex === -1) {
    return false;
  }

  // 检查权限（作者或管理员）
  const template = SAMPLE_TEMPLATES[templateIndex];
  if (template.author.id !== userId) {
    throw new Error('无权限删除此模板');
  }

  SAMPLE_TEMPLATES.splice(templateIndex, 1);
  return true;
}

/**
 * 获取模板聚合信息
 */
async function getTemplateFacets(templates: PublicTemplate[]): Promise<TemplateFacets> {
  // 分类聚合
  const categoryMap = new Map<string, number>();
  templates.forEach(template => {
    categoryMap.set(template.category, (categoryMap.get(template.category) || 0) + 1);
  });
  const categories = Array.from(categoryMap.entries()).map(([value, count]) => ({
    value,
    count,
    label: value,
  }));

  // 类型聚合
  const typeMap = new Map<string, number>();
  templates.forEach(template => {
    typeMap.set(template.type, (typeMap.get(template.type) || 0) + 1);
  });
  const types = Array.from(typeMap.entries()).map(([value, count]) => ({
    value,
    count,
    label: value,
  }));

  // 状态聚合
  const statusMap = new Map<string, number>();
  templates.forEach(template => {
    statusMap.set(template.status, (statusMap.get(template.status) || 0) + 1);
  });
  const statuses = Array.from(statusMap.entries()).map(([value, count]) => ({
    value,
    count,
    label: value,
  }));

  // 标签聚合
  const tagMap = new Map<string, number>();
  templates.forEach(template => {
    template.tags.forEach(tag => {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    });
  });
  const tags = Array.from(tagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([value, count]) => ({
      value,
      count,
      label: value,
    }));

  // 模型聚合
  const modelMap = new Map<string, number>();
  templates.forEach(template => {
    modelMap.set(template.model, (modelMap.get(template.model) || 0) + 1);
  });
  const models = Array.from(modelMap.entries()).map(([value, count]) => ({
    value,
    count,
    label: value,
  }));

  // 作者聚合
  const authorMap = new Map<string, number>();
  templates.forEach(template => {
    authorMap.set(template.author.id, (authorMap.get(template.author.id) || 0) + 1);
  });
  const authors = Array.from(authorMap.entries()).map(([value, count]) => ({
    value,
    count,
    label: SAMPLE_TEMPLATES.find(t => t.author.id === value)?.author.name || value,
  }));

  return {
    categories,
    types,
    statuses,
    tags,
    models,
    authors,
  };
}

/**
 * 获取模板分类列表
 */
export async function getTemplateCategories(): Promise<FacetOption[]> {
  const templates = await getAllTemplates();
  const categoryMap = new Map<string, number>();

  templates.forEach(template => {
    categoryMap.set(template.category, (categoryMap.get(template.category) || 0) + 1);
  });

  return Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value,
      count,
      label: value,
    }));
}

/**
 * 获取模板版本历史
 */
export async function getTemplateVersionHistory(templateId: string): Promise<TemplateVersionHistory | null> {
  const template = await getTemplate(templateId);
  if (!template) {
    return null;
  }

  // 模拟版本历史
  const versions = [
    {
      version: template.version,
      changelog: '初始版本',
      publishedAt: template.publishedAt || template.createdAt,
      size: 1024, // KB
      downloadUrl: `/api/agent-market/templates/${templateId}/download`,
      checksum: 'abc123...',
    },
  ];

  return {
    templateId,
    versions,
  };
}

/**
 * 获取模板统计信息
 */
export async function getTemplateStats(): Promise<TemplateStats> {
  const templates = await getAllTemplates();

  const totalTemplates = templates.length;
  const totalDownloads = templates.reduce((sum, t) => sum + t.downloadCount, 0);
  const totalViews = templates.reduce((sum, t) => sum + t.viewCount, 0);
  const averageRating = templates.reduce((sum, t) => sum + t.rating, 0) / totalTemplates || 0;

  // 热门分类
  const categoryCount = new Map<string, number>();
  templates.forEach(t => {
    categoryCount.set(t.category, (categoryCount.get(t.category) || 0) + 1);
  });
  const topCategories = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category]) => category);

  // 热门作者
  const authorCount = new Map<string, number>();
  templates.forEach(t => {
    authorCount.set(t.author.id, (authorCount.get(t.author.id) || 0) + 1);
  });
  const topAuthors = Array.from(authorCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  // 趋势模板（按下载量排序）
  const trendingTemplates = [...templates]
    .sort((a, b) => b.downloadCount - a.downloadCount)
    .slice(0, 5);

  return {
    totalTemplates,
    totalDownloads,
    totalViews,
    averageRating,
    topCategories,
    topAuthors,
    trendingTemplates,
  };
}

/**
 * 下载模板
 */
export async function downloadTemplate(
  templateId: string,
  userId: string,
  version?: string
): Promise<{ downloadUrl: string; record: DownloadRecord }> {
  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error('模板不存在');
  }

  // 创建下载记录
  const record: DownloadRecord = {
    id: uuidv4(),
    templateId,
    version: version || template.version,
    userId,
    downloadAt: new Date().toISOString(),
    ipAddress: '127.0.0.1', // 实际中应该从请求中获取
    userAgent: 'Unknown',
  };

  // 增加下载次数
  template.downloadCount += 1;

  // 生成下载 URL
  const downloadUrl = `/api/agent-market/templates/${templateId}/download?v=${record.version}`;

  return {
    downloadUrl,
    record,
  };
}

/**
 * 收藏模板
 */
export async function favoriteTemplate(templateId: string, userId: string): Promise<TemplateFavorite> {
  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error('模板不存在');
  }

  const favorite: TemplateFavorite = {
    id: uuidv4(),
    templateId,
    userId,
    createdAt: new Date().toISOString(),
  };

  // 增加收藏次数
  template.likeCount += 1;

  return favorite;
}

/**
 * 取消收藏模板
 */
export async function unfavoriteTemplate(templateId: string, userId: string): Promise<boolean> {
  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error('模板不存在');
  }

  // 减少收藏次数
  if (template.likeCount > 0) {
    template.likeCount -= 1;
  }

  return true;
}

/**
 * 获取用户收藏的模板
 */
export async function getUserFavorites(userId: string): Promise<PublicTemplate[]> {
  // 模拟用户收藏的模板
  return SAMPLE_TEMPLATES.slice(0, 3).map(template => ({
    ...template,
    likeCount: template.likeCount + 1, // 模拟收藏
  }));
}

/**
 * 获取模板报告列表
 */
export async function getTemplateReports(status?: TemplateReport['status']): Promise<TemplateReport[]> {
  // 模拟报告数据
  const reports: TemplateReport[] = [
    {
      id: 'report-1',
      templateId: 'template-1',
      reportedBy: 'user-1',
      reason: '内容不当',
      description: '模板中包含敏感内容',
      status: 'pending',
      createdAt: '2024-01-15T10:00:00Z',
    },
  ];

  if (status) {
    return reports.filter(report => report.status === status);
  }

  return reports;
}

/**
 * 提交模板报告
 */
export async function reportTemplate(
  templateId: string,
  reportedBy: string,
  reason: string,
  description: string
): Promise<TemplateReport> {
  const report: TemplateReport = {
    id: uuidv4(),
    templateId,
    reportedBy,
    reason,
    description,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  return report;
}

/**
 * 处理模板报告
 */
export async function resolveTemplateReport(
  reportId: string,
  resolverId: string,
  resolution: string,
  status: 'reviewed' | 'resolved'
): Promise<TemplateReport> {
  // 模拟处理报告
  const report: TemplateReport = {
    id: reportId,
    templateId: 'template-1',
    reportedBy: 'user-1',
    reason: '内容不当',
    description: '模板中包含敏感内容',
    status,
    reviewedBy: resolverId,
    reviewedAt: new Date().toISOString(),
    resolution,
    createdAt: '2024-01-15T10:00:00Z',
  };

  return report;
}