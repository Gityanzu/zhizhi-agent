/**
 * Agent 搜索相关类型定义
 */

/**
 * 搜索请求
 */
export interface SearchRequest {
  query?: string; // 搜索关键词
  category?: string; // 分类筛选
  tags?: string[]; // 标签筛选
  sort?: 'latest' | 'popular' | 'highest-rated'; // 排序方式
  sortOrder?: 'asc' | 'desc'; // 排序顺序
  page?: number; // 页码
  pageSize?: number; // 每页大小
}

/**
 * 搜索结果项
 */
export interface SearchResult {
  agentId: string;
  name: string;
  description: string;
  avatar?: string;
  category?: string;
  tags?: string[];
  rating?: number;
  ratingCount?: number;
  viewCount?: number;
  templateCount?: number;
  createdAt: string;
}

/**
 * 搜索响应
 */
export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: {
    categories?: string[];
    tags?: string[];
    popularTags?: string[];
  };
}

/**
 * 标签推荐请求
 */
export interface TagRecommendationRequest {
  category?: string;
  limit?: number;
}

/**
 * 标签推荐响应
 */
export interface TagRecommendationResponse {
  tags: Array<{
    name: string;
    count: number;
    category?: string;
  }>;
}

/**
 * 分类信息
 */
export interface CategoryInfo {
  name: string;
  count: number;
}

/**
 * 分类列表响应
 */
export interface CategoryListResponse {
  categories: CategoryInfo[];
}
