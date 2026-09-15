/**
 * Agent 模板市场相关类型定义
 */

/**
 * 模板状态
 */
export type TemplateStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'deprecated';

/**
 * 模板类型
 */
export type TemplateType = 'public' | 'private' | 'premium' | 'official';

/**
 * 模板审核理由
 */
export interface ReviewReason {
  reason: string;
  suggestedChanges?: string;
  reviewedBy: string;
  reviewedAt: string;
}

/**
 * 模板版本
 */
export interface TemplateVersion {
  version: string;
  changelog: string;
  publishedAt: string;
  size: number; // KB
  downloadUrl: string;
  checksum: string;
}

/**
 * 公开模板
 */
export interface PublicTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  systemPrompt: string;
  model: string;
  tools: string[];
  temperature: number;

  // 作者信息
  author: {
    id: string;
    name: string;
    avatar?: string;
    bio?: string;
  };

  // 分类和标签
  category: string;
  tags: string[];

  // 模板信息
  type: TemplateType;
  status: TemplateStatus;
  version: string;

  // 统计信息
  viewCount: number;
  downloadCount: number;
  likeCount: number;
  rating: number;
  reviewCount: number;

  // 审核信息
  reviewReason?: ReviewReason;

  // 时间信息
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;

  // 扩展字段
  features?: string[];
  screenshots?: string[];
  demoUrl?: string;
  documentation?: string;
  license?: string;
}

/**
 * 模板创建请求
 */
export interface CreateTemplateRequest {
  name: string;
  title: string;
  description: string;
  systemPrompt: string;
  model: string;
  tools: string[];
  temperature: number;
  category: string;
  tags: string[];
  type?: TemplateType;
  features?: string[];
  screenshots?: string[];
  demoUrl?: string;
  documentation?: string;
  license?: string;
}

/**
 * 模板更新请求
 */
export interface UpdateTemplateRequest extends Partial<CreateTemplateRequest> {
  status?: TemplateStatus;
  version?: string;
}

/**
 * 模板审核请求
 */
export interface ReviewTemplateRequest {
  status: TemplateStatus;
  reason?: string;
  suggestedChanges?: string;
}

/**
 * 模板列表参数
 */
export interface TemplateListParams {
  query?: string;
  category?: string;
  type?: TemplateType;
  status?: TemplateStatus;
  authorId?: string;
  sortBy?: 'latest' | 'popular' | 'rating' | 'downloads';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * 模板列表响应
 */
export interface TemplateListResponse {
  templates: PublicTemplate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets?: TemplateFacets;
}

/**
 * 模板聚合信息
 */
export interface TemplateFacets {
  categories: FacetOption[];
  types: FacetOption[];
  statuses: FacetOption[];
  tags: FacetOption[];
  models: FacetOption[];
  authors: FacetOption[];
}

/**
 * 聚合选项
 */
export interface FacetOption {
  value: string;
  count: number;
  label: string;
}

/**
 * 模板下载请求
 */
export interface DownloadTemplateRequest {
  templateId: string;
  version?: string;
  userId: string;
}

/**
 * 模板下载记录
 */
export interface DownloadRecord {
  id: string;
  templateId: string;
  version: string;
  userId: string;
  downloadAt: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 模板收藏
 */
export interface TemplateFavorite {
  id: string;
  templateId: string;
  userId: string;
  createdAt: string;
}

/**
 * 模板统计
 */
export interface TemplateStats {
  totalTemplates: number;
  totalDownloads: number;
  totalViews: number;
  averageRating: number;
  topCategories: string[];
  topAuthors: string[];
  trendingTemplates: PublicTemplate[];
}

/**
 * 模板版本历史
 */
export interface TemplateVersionHistory {
  templateId: string;
  versions: TemplateVersion[];
}

/**
 * 模板报告
 */
export interface TemplateReport {
  id: string;
  templateId: string;
  reportedBy: string;
  reason: string;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  reviewedBy?: string;
  reviewedAt?: string;
  resolution?: string;
  createdAt: string;
}