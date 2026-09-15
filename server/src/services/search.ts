import { getAgents, getAgent } from './customAgent';
import type {
  SearchResult,
  SearchRequest,
  SearchResponse,
  TagRecommendationRequest,
  TagRecommendationResponse,
  CategoryListResponse,
} from '../types/search';

/**
 * 全文搜索
 */
export async function searchAgents(
  query?: string,
  filters?: {
    category?: string;
    tags?: string[];
    sortBy?: 'latest' | 'popular' | 'highest-rated';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }
): Promise<SearchResponse> {
  // 获取所有 agents
  const allAgents = await getAgents();
  const agents = allAgents.filter(agent => {
    // 如果有查询关键词，进行全文搜索
    if (query && query.trim()) {
      const searchStr = `${agent.name} ${agent.description} ${agent.tags?.join(' ')}`.toLowerCase();
      const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      const hasMatch = searchTerms.every(term => searchStr.includes(term));
      if (!hasMatch) return false;
    }

    // 分类筛选
    if (filters?.category && agent.category !== filters.category) {
      return false;
    }

    // 标签筛选
    if (filters?.tags && filters.tags.length > 0) {
      const hasAllTags = filters.tags.every(tag =>
        agent.tags?.some(agentTag => agentTag.toLowerCase() === tag.toLowerCase())
      );
      if (!hasAllTags) return false;
    }

    return true;
  });

  // 排序
  if (filters?.sortBy) {
    switch (filters.sortBy) {
      case 'latest':
        agents.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
      case 'popular':
        agents.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        break;
      case 'highest-rated':
        agents.sort((a, b) => {
          const ratingA = a.rating || 0;
          const ratingB = b.rating || 0;
          return sortOrder === 'asc' ? ratingA - ratingB : ratingB - ratingA;
        });
        break;
    }
  } else {
    // 默认按创建时间倒序
    agents.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // 分页
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 20;
  const total = agents.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginatedAgents = agents.slice(start, end);

  // 构建响应
  const results = paginatedAgents.map(agent => ({
    agentId: agent.id,
    name: agent.name,
    description: agent.description,
    avatar: agent.avatar,
    category: agent.category,
    tags: agent.tags,
    rating: agent.rating,
    ratingCount: agent.ratingCount,
    viewCount: agent.viewCount,
    templateCount: agent.templateCount,
    createdAt: agent.createdAt,
  }));

  return {
    results,
    total,
    page,
    pageSize,
    totalPages,
    filters: {
      // 收集所有分类
      categories: [...new Set(allAgents.map(a => a.category).filter(Boolean))],
      // 收集所有标签
      tags: [...new Set(allAgents.flatMap(a => a.tags || []))],
      // 收集热门标签（出现次数最多的5个）
      popularTags: getPopularTags(allAgents, 5),
    },
  };
}

/**
 * 获取分类列表
 */
export async function getCategoryList(): Promise<CategoryListResponse> {
  const allAgents = await getAgents();
  const categories = new Map<string, number>();

  allAgents.forEach(agent => {
    if (agent.category) {
      categories.set(agent.category, (categories.get(agent.category) || 0) + 1);
    }
  });

  const categoryList: CategoryInfo[] = Array.from(categories.entries()).map(
    ([name, count]) => ({ name, count })
  );

  return {
    categories: categoryList.sort((a, b) => b.count - a.count),
  };
}

/**
 * 获取标签推荐
 */
export async function getTagRecommendations(
  options?: TagRecommendationRequest
): Promise<TagRecommendationResponse> {
  const limit = options?.limit || 10;

  const allAgents = await getAgents();
  const tagCounts = new Map<string, number>();
  const categoryTags = new Map<string, string[]>();

  allAgents.forEach(agent => {
    // 统计标签出现次数
    if (agent.tags) {
      agent.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    }

    // 按分类分组标签
    if (agent.category) {
      if (!categoryTags.has(agent.category)) {
        categoryTags.set(agent.category, []);
      }
      if (agent.tags) {
        categoryTags.get(agent.category)!.push(...agent.tags);
      }
    }
  });

  // 过滤掉空标签
  const validTagCounts = new Map<string, number>();
  tagCounts.forEach((count, tag) => {
    if (tag && tag.trim()) {
      validTagCounts.set(tag, count);
    }
  });

  // 如果指定了分类，只返回该分类的标签
  if (options?.category) {
    const categoryTagsArray = categoryTags.get(options.category) || [];
    const uniqueCategoryTags = [...new Set(categoryTagsArray)];
    const recommendedTags = uniqueCategoryTags
      .map(tag => ({
        name: tag,
        count: tagCounts.get(tag) || 0,
        category: options.category,
      }))
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return { tags: recommendedTags };
  }

  // 否则返回全局热门标签
  const recommendedTags = Array.from(validTagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return { tags: recommendedTags };
}

/**
 * 获取热门标签
 */
export function getPopularTags(agents: any[], limit: number): string[] {
  const tagCounts = new Map<string, number>();

  agents.forEach(agent => {
    if (agent.tags) {
      agent.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    }
  });

  return Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ name }) => name);
}
