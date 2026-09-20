import request from './request';

/**
 * 搜索参数
 */
export interface SearchParams {
  query?: string;
  category?: string;
  tags?: string[];
  sort?: 'latest' | 'popular' | 'highest-rated';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * 搜索结果�? */
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

/**
 * 标签推荐
 */
export interface TagRecommendation {
  name: string;
  count: number;
  category?: string;
}

/**
 * 标签推荐响应
 */
export interface TagRecommendationResponse {
  tags: TagRecommendation[];
}

/**
 * 搜索 Agents
 */
export async function searchAgents(params: SearchParams): Promise<SearchResponse> {
  const queryParams = new URLSearchParams();
  if (params.query) queryParams.append('query', params.query);
  if (params.category) queryParams.append('category', params.category);
  if (params.sort) queryParams.append('sort', params.sort);
  if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
  if (params.page) queryParams.append('page', params.page.toString());
  if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());

  // 处理 tags
  if (params.tags && params.tags.length > 0) {
    params.tags.forEach(tag => queryParams.append('tags', tag));
  }

  const response = await api.get(`/api/agent-market/search?${queryParams}`);
  return response.data;
}

/**
 * 获取分类列表
 */
export async function getCategoryList(): Promise<CategoryListResponse> {
  const response = await api.get('/api/agent-market/search/categories');
  return response.data;
}

/**
 * 获取标签推荐
 */
export async function getTagRecommendations(params?: {
  category?: string;
  limit?: number;
}): Promise<TagRecommendationResponse> {
  const queryParams = new URLSearchParams();
  if (params?.category) queryParams.append('category', params.category);
  if (params?.limit) queryParams.append('limit', params.limit.toString());

  const response = await api.get(`/api/agent-market/search/tags?${queryParams}`);
  return response.data;
}

/**
 * 获取热门标签
 */
export async function getPopularTags(limit: number = 10): Promise<string[]> {
  const response = await api.get(`/api/agent-market/search/popular-tags?limit=${limit}`);
  return response.data.tags;
}
