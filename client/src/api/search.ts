import { api } from './request';
import type {
  SearchParams,
  SearchResponse,
  SearchStats,
  SearchHistory,
  PopularSearch,
  SearchSuggestion,
  AdvancedSearchParams,
} from '@/types/search';

// ==================== 基础搜索 ====================

/**
 * 搜索 Agent
 */
export async function searchAgents(params: SearchParams): Promise<SearchResponse> {
  const res = await api.get('/agent-market/search', {
    params,
  });
  return res.data;
}

// ==================== 搜索建议 ====================

/**
 * 获取搜索建议
 */
export async function getSearchSuggestions(query: string): Promise<SearchSuggestion[]> {
  const res = await api.get('/agent-market/search/suggestions', {
    params: { q: query },
  });
  return res.data;
}

// ==================== 热门搜索 ====================

/**
 * 获取热门搜索
 */
export async function getPopularSearches(): Promise<PopularSearch[]> {
  const res = await api.get('/agent-market/search/popular');
  return res.data;
}

// ==================== 搜索统计 ====================

/**
 * 获取搜索统计
 */
export async function getSearchStats(): Promise<SearchStats> {
  const res = await api.get('/agent-market/search/stats');
  return res.data;
}

// ==================== 搜索历史 ====================

/**
 * 获取用户搜索历史
 */
export async function getUserSearchHistory(): Promise<SearchHistory[]> {
  const res = await api.get('/agent-market/search/history');
  return res.data;
}

/**
 * 清除搜索历史
 */
export async function clearSearchHistory(): Promise<void> {
  await api.delete('/agent-market/search/history');
}

// ==================== 高级搜索 ====================

/**
 * 高级搜索
 */
export async function advancedSearch(params: AdvancedSearchParams): Promise<SearchResponse> {
  const res = await api.post('/agent-market/search/advanced', params);
  return res.data;
}

// ==================== 搜索相关工具函数 ====================

/**
 * 格式化搜索时间
 */
export function formatSearchTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

/**
 * 获取排序选项标签
 */
export function getSortLabel(sortBy: string): string {
  const sortLabels: Record<string, string> = {
    relevance: '相关度',
    rating: '评分',
    comments: '评论数',
    createdAt: '创建时间',
    updatedAt: '更新时间',
  };
  return sortLabels[sortBy] || sortBy;
}

/**
 * 获取趋势图标
 */
export function getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up':
      return '↗';
    case 'down':
      return '↘';
    case 'stable':
      return '→';
    default:
      return '';
  }
}

/**
 * 高亮搜索关键词
 */
export function highlightText(text: string, query: string): string {
  if (!query) return text;

  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

/**
 * 获取搜索聚合数据
 */
export async function getSearchFacets(query?: string): Promise<SearchResponse['facets']> {
  const params = query ? { query } : {};
  const res = await api.get('/agent-market/search', {
    params,
  });
  return res.data.facets;
}

/**
 * 清空搜索历史（带确认）
 */
export async function clearSearchHistoryWithConfirm(): Promise<boolean> {
  if (confirm('确定要清除所有搜索历史吗？')) {
    try {
      await clearSearchHistory();
      return true;
    } catch (error) {
      console.error('清除搜索历史失败:', error);
      return false;
    }
  }
  return false;
}

/**
 * 导出搜索历史
 */
export async function exportSearchHistory(): Promise<string> {
  const history = await getUserSearchHistory();

  // 转换为CSV格式
  const csvHeaders = ['查询词', '结果数量', '搜索时间'];
  const csvRows = history.map(item => [
    item.query,
    item.resultsCount.toString(),
    new Date(item.createdAt).toLocaleString(),
  ]);

  const csvContent = [csvHeaders, ...csvRows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');

  // 添加BOM以支持中文
  return '﻿' + csvContent;
}

/**
 * 获取搜索提示
 */
export function getSearchTips(): string[] {
  return [
    '使用关键词精确搜索，如"代码助手"、"数据分析"',
    '可以按分类筛选，如"开发工具"、"创意写作"',
    '支持按评分、评论数排序',
    '搜索结果会显示相关度得分',
    '热门搜索可以快速找到热门Agent',
  ];
}