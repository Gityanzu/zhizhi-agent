/**
 * Agent 搜索相关类型定义
 */

/**
 * 搜索参数
 */
export interface SearchParams {
  query: string;                  // 搜索关键词
  category?: string;              // 分类筛选
  model?: string;                 // 模型筛选
  sortBy?: 'relevance' | 'rating' | 'comments' | 'createdAt' | 'updatedAt'; // 排序方式
  sortOrder?: 'asc' | 'desc';     // 排序方向
  page?: number;                  // 页码
  pageSize?: number;              // 每页数量
}

/**
 * 搜索统计
 */
export interface SearchStats {
  totalAgents: number;            // 总Agent数量
  totalSearches: number;          // 总搜索次数
  averageResponseTime: number;    // 平均响应时间(ms)
  popularSearches: string[];       // 热门搜索词
}

/**
 * 搜索结果
 */
export interface SearchResult {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  model: string;
  tools: string[];
  temperature: number;
  score: number;                  // 相关度得分
  highlights: string[];            // 高亮片段
  category: string;               // 分类
  rating?: number;                // 评分（0-5）
  commentCount?: number;          // 评论数
  viewCount?: number;            // 查看次数
  downloadCount?: number;         // 下载次数
  createdAt: string;
  updatedAt: string;
}

/**
 * 搜索响应
 */
export interface SearchResponse {
  agents: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  searchTime: number;            // 搜索耗时(ms)
  query: string;                  // 原始查询
  facets?: SearchFacets;          // 搜索聚合信息
}

/**
 * 搜索聚合（用于筛选）
 */
export interface SearchFacets {
  categories: FacetOption[];      // 分类聚合
  models: FacetOption[];         // 模型聚合
  ratingRanges: FacetOption[];    // 评分范围聚合
  tags: FacetOption[];            // 标签聚合
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
 * 搜索历史
 */
export interface SearchHistory {
  id: string;
  query: string;
  resultsCount: number;
  createdAt: string;
}

/**
 * 热门搜索
 */
export interface PopularSearch {
  query: string;
  count: number;
  trend: 'up' | 'down' | 'stable'; // 趋势
}

/**
 * 搜索建议
 */
export interface SearchSuggestion {
  text: string;
  category?: string;
  type: 'query' | 'category' | 'agent'; // 建议类型
}

/**
 * 高级搜索条件
 */
export interface AdvancedSearchParams extends SearchParams {
  tags?: string[];                // 标签筛选
  ratingMin?: number;             // 最低评分
  ratingMax?: number;             // 最高评分
  createdAtStart?: string;        // 创建时间开始
  createdAtEnd?: string;          // 创建时间结束
  updatedAtStart?: string;        // 更新时间开始
  updatedAtEnd?: string;          // 更新时间结束
}