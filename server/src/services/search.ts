import { v4 as uuidv4 } from 'uuid';
import { usePostgres, query } from '../db';
import { getAgent } from './customAgent';
import { getRatingStats } from './rating';
import { getCommentStats } from './comment';
import type {
  SearchParams,
  SearchResponse,
  SearchResult,
  SearchStats,
  SearchFacets,
  FacetOption,
  SearchHistory,
  PopularSearch,
  SearchLog,
  SearchSuggestion,
} from '../types/search';

// 模拟数据 - 实际项目中可以从数据库读取
const SAMPLE_AGENTS = [
  {
    id: 'agent-1',
    name: '智能代码助手',
    avatar: '💻',
    description: '专业的代码生成和调试助手，支持多种编程语言',
    systemPrompt: '你是一个专业的编程助手，擅长代码生成、调试和优化...',
    model: 'gpt-4',
    tools: ['code_interpreter', 'web_search'],
    temperature: 0.3,
    category: '开发工具',
    tags: ['编程', '代码', '调试'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'agent-2',
    name: '创意写作助手',
    avatar: '✍️',
    description: '帮助创作小说、诗歌、文案等创意内容',
    systemPrompt: '你是一位富有创造力的作家，擅长各种文体的创作...',
    model: 'claude-3',
    tools: ['web_search'],
    temperature: 0.8,
    category: '创意写作',
    tags: ['写作', '创意', '文案'],
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
  {
    id: 'agent-3',
    name: '数据分析专家',
    avatar: '📊',
    description: '专业的数据分析和可视化助手',
    systemPrompt: '你是一位数据科学家，擅长数据分析、可视化和洞察...',
    model: 'gpt-4',
    tools: ['web_search', 'data_analysis'],
    temperature: 0.1,
    category: '数据分析',
    tags: ['数据', '分析', '可视化'],
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  },
];

/**
 * 简单的文本搜索算法
 */
function simpleSearch(query: string, agents: any[]): SearchResult[] {
  const keywords = query.toLowerCase().split(' ');
  const results: SearchResult[] = [];

  agents.forEach(agent => {
    let score = 0;
    const highlights: string[] = [];

    // 搜索名称
    const nameMatch = agent.name.toLowerCase().includes(query.toLowerCase());
    if (nameMatch) {
      score += 10;
      highlights.push(agent.name);
    }

    // 搜索描述
    const descMatch = agent.description.toLowerCase().includes(query.toLowerCase());
    if (descMatch) {
      score += 5;
      // 提取高亮片段
      const index = agent.description.toLowerCase().indexOf(query.toLowerCase());
      const start = Math.max(0, index - 30);
      const end = Math.min(agent.description.length, index + query.length + 30);
      const snippet = agent.description.substring(start, end);
      highlights.push(`...${snippet}...`);
    }

    // 搜索标签
    const tagMatches = agent.tags.some(tag =>
      tag.toLowerCase().includes(query.toLowerCase())
    );
    if (tagMatches) {
      score += 3;
    }

    // 搜索系统提示词
    const promptMatch = agent.systemPrompt.toLowerCase().includes(query.toLowerCase());
    if (promptMatch) {
      score += 1;
    }

    if (score > 0) {
      // 获取评分和评论数据
      const rating = Math.floor(Math.random() * 5) * 0.2; // 模拟数据
      const commentCount = Math.floor(Math.random() * 100);

      results.push({
        ...agent,
        score,
        highlights,
        rating,
        commentCount,
        viewCount: Math.floor(Math.random() * 1000),
        downloadCount: Math.floor(Math.random() * 500),
      });
    }
  });

  // 按分数排序
  return results.sort((a, b) => b.score - a.score);
}

/**
 * 执行搜索
 */
export async function searchAgents(params: SearchParams): Promise<SearchResponse> {
  const startTime = Date.now();

  // 验证参数
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 10, 50); // 最大50条
  const offset = (page - 1) * pageSize;

  // 获取所有Agent（实际项目中应该从数据库查询）
  let agents = SAMPLE_AGENTS;

  // 分类筛选
  if (params.category) {
    agents = agents.filter(agent => agent.category === params.category);
  }

  // 模型筛选
  if (params.model) {
    agents = agents.filter(agent => agent.model === params.model);
  }

  // 文本搜索
  if (params.query) {
    agents = simpleSearch(params.query, agents);
  } else {
    // 没有查询词，返回所有结果
    agents.forEach(agent => {
      agent.score = 1;
      agent.highlights = [agent.name, agent.description];
    });
  }

  // 排序
  if (params.sortBy) {
    agents.sort((a, b) => {
      let compareValue = 0;

      switch (params.sortBy) {
        case 'relevance':
          compareValue = b.score - a.score;
          break;
        case 'rating':
          compareValue = (b.rating || 0) - (a.rating || 0);
          break;
        case 'comments':
          compareValue = (b.commentCount || 0) - (a.commentCount || 0);
          break;
        case 'createdAt':
          compareValue = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
        case 'updatedAt':
          compareValue = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          break;
      }

      return params.sortOrder === 'desc' ? compareValue : -compareValue;
    });
  } else {
    // 默认按相关度排序
    agents.sort((a, b) => b.score - a.score);
  }

  // 分页
  const total = agents.length;
  const totalPages = Math.ceil(total / pageSize);
  const paginatedAgents = agents.slice(offset, offset + pageSize);

  // 获取聚合信息
  const facets = await getSearchFacets(agents);

  // 记录搜索日志
  await logSearch(params.query, paginatedAgents.length);

  const searchTime = Date.now() - startTime;

  return {
    agents: paginatedAgents,
    total,
    page,
    pageSize,
    totalPages,
    searchTime,
    query: params.query || '',
    facets,
  };
}

/**
 * 获取搜索聚合信息
 */
async function getSearchFacets(agents: any[]): Promise<SearchFacets> {
  // 分类聚合
  const categoryMap = new Map<string, number>();
  agents.forEach(agent => {
    categoryMap.set(agent.category, (categoryMap.get(agent.category) || 0) + 1);
  });
  const categories = Array.from(categoryMap.entries()).map(([value, count]) => ({
    value,
    count,
    label: value,
  }));

  // 模型聚合
  const modelMap = new Map<string, number>();
  agents.forEach(agent => {
    modelMap.set(agent.model, (modelMap.get(agent.model) || 0) + 1);
  });
  const models = Array.from(modelMap.entries()).map(([value, count]) => ({
    value,
    count,
    label: value,
  }));

  // 评分范围聚合
  const ratingRanges = [
    { value: '5', count: 0, label: '5星' },
    { value: '4', count: 0, label: '4星以上' },
    { value: '3', count: 0, label: '3星以上' },
    { value: '2', count: 0, label: '2星以上' },
    { value: '1', count: 0, label: '1星以上' },
  ];
  agents.forEach(agent => {
    const rating = agent.rating || 0;
    if (rating >= 5) ratingRanges[0].count++;
    else if (rating >= 4) ratingRanges[1].count++;
    else if (rating >= 3) ratingRanges[2].count++;
    else if (rating >= 2) ratingRanges[3].count++;
    else if (rating >= 1) ratingRanges[4].count++;
  });

  // 标签聚合
  const tagMap = new Map<string, number>();
  agents.forEach(agent => {
    agent.tags.forEach((tag: string) => {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    });
  });
  const tags = Array.from(tagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10) // 取前10个热门标签
    .map(([value, count]) => ({
      value,
      count,
      label: value,
    }));

  return {
    categories,
    models,
    ratingRanges,
    tags,
  };
}

/**
 * 获取搜索建议
 */
export async function getSearchSuggestions(query: string): Promise<SearchSuggestion[]> {
  const suggestions: SearchSuggestion[] = [];

  // 从样本数据中提取建议
  SAMPLE_AGENTS.forEach(agent => {
    // 名称建议
    if (agent.name.toLowerCase().includes(query.toLowerCase())) {
      suggestions.push({
        text: agent.name,
        category: agent.category,
        type: 'agent',
      });
    }

    // 分类建议
    if (agent.category.toLowerCase().includes(query.toLowerCase())) {
      suggestions.push({
        text: agent.category,
        type: 'category',
      });
    }

    // 标签建议
    agent.tags.forEach(tag => {
      if (tag.toLowerCase().includes(query.toLowerCase())) {
        suggestions.push({
          text: tag,
          type: 'query',
        });
      }
    });
  });

  // 去重
  const uniqueSuggestions = suggestions.filter((suggestion, index, self) =>
    index === self.findIndex(s => s.text === suggestion.text && s.type === suggestion.type)
  );

  return uniqueSuggestions.slice(0, 10); // 返回前10个建议
}

/**
 * 获取热门搜索
 */
export async function getPopularSearches(): Promise<PopularSearch[]> {
  // 模拟热门搜索数据
  const popularSearches: PopularSearch[] = [
    { query: '代码助手', count: 1250, trend: 'up' },
    { query: '写作', count: 980, trend: 'stable' },
    { query: '数据分析', count: 820, trend: 'down' },
    { query: '翻译', count: 750, trend: 'up' },
    { query: '创意', count: 620, trend: 'up' },
    { query: '学习', count: 580, trend: 'stable' },
    { query: '办公', count: 450, trend: 'down' },
    { query: '编程', count: 420, trend: 'up' },
  ];

  return popularSearches;
}

/**
 * 获取搜索统计
 */
export async function getSearchStats(): Promise<SearchStats> {
  // 模拟统计数据
  return {
    totalAgents: SAMPLE_AGENTS.length,
    totalSearches: 15420,
    averageResponseTime: 120,
    popularSearches: ['代码助手', '写作', '数据分析'],
  };
}

/**
 * 记录搜索日志
 */
async function logSearch(query: string, resultsCount: number): Promise<void> {
  const searchLog: SearchLog = {
    id: uuidv4(),
    query,
    resultsCount,
    searchTime: Date.now(),
    ip: '127.0.0.1', // 实际中应该从请求中获取
    userAgent: 'Unknown',
    createdAt: new Date().toISOString(),
  };

  // 这里可以将日志保存到数据库或文件
  console.log('Search log:', {
    query: searchLog.query,
    resultsCount: searchLog.resultsCount,
    searchTime: `${searchLog.searchTime}ms`,
  });
}

/**
 * 添加搜索历史
 */
export async function addSearchHistory(userId: string, query: string, resultsCount: number): Promise<SearchHistory> {
  const history: SearchHistory = {
    id: uuidv4(),
    userId,
    query,
    resultsCount,
    createdAt: new Date().toISOString(),
  };

  // 这里可以将历史保存到数据库
  console.log('Search history added:', {
    userId,
    query: history.query,
    resultsCount: history.resultsCount,
  });

  return history;
}

/**
 * 获取用户的搜索历史
 */
export async function getUserSearchHistory(userId: string): Promise<SearchHistory[]> {
  // 模拟用户搜索历史
  return [
    {
      id: '1',
      userId,
      query: '代码助手',
      resultsCount: 15,
      createdAt: new Date(Date.now() - 86400000).toISOString(), // 1天前
    },
    {
      id: '2',
      userId,
      query: '写作助手',
      resultsCount: 8,
      createdAt: new Date(Date.now() - 172800000).toISOString(), // 2天前
    },
    {
      id: '3',
      userId,
      query: '数据分析',
      resultsCount: 12,
      createdAt: new Date(Date.now() - 259200000).toISOString(), // 3天前
    },
  ];
}

/**
 * 清除搜索历史
 */
export async function clearSearchHistory(userId: string): Promise<void> {
  // 清除用户的搜索历史
  console.log(`Search history cleared for user: ${userId}`);
}