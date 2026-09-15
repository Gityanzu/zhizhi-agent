import { getAgents, getAgent } from './customAgent';
import { getAllAgentsRatingStats } from './rating';
import { getAllComments } from './comment';
import type {
  AgentViewStats,
  TemplateUsageStats,
  RatingTrendStats,
  PopularAgentStats,
  AnalyticsSummary,
  StatsResponse,
} from '../types/analytics';

/**
 * 获取 Agent 访问统计
 */
export async function getAgentViewStats(agentId: string): Promise<AgentViewStats | null> {
  const agent = await getAgent(agentId);
  if (!agent) {
    return null;
  }

  // 生成模拟的访问数据（实际应用中应该从数据库获取）
  const viewHistory = [];
  const now = new Date();
  const thirtyDays = 30;

  for (let i = thirtyDays; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // 生成随机访问次数（0-15）
    const count = Math.floor(Math.random() * 16);

    if (count > 0) {
      viewHistory.push({
        date: dateStr,
        count,
      });
    }
  }

  const totalViews = viewHistory.reduce((sum, item) => sum + item.count, 0);

  return {
    agentId,
    viewCount: totalViews,
    lastViewedAt: viewHistory[viewHistory.length - 1]?.date || now.toISOString(),
    viewHistory,
  };
}

/**
 * 获取所有 Agent 访问统计
 */
export async function getAllAgentViewStats(): Promise<AgentViewStats[]> {
  const allAgents = await getAgents();
  const stats = [];

  for (const agent of allAgents) {
    const statsData = await getAgentViewStats(agent.id);
    if (statsData) {
      stats.push(statsData);
    }
  }

  return stats;
}

/**
 * 增加访问计数
 */
export async function incrementViewCount(agentId: string): Promise<void> {
  // 在实际应用中，这里应该更新数据库中的访问计数
  // 这里只是模拟
  console.log(`📊 Agent ${agentId} 被访问了`);
}

/**
 * 获取模板使用统计
 */
export async function getTemplateUsageStats(templateId: string): Promise<TemplateUsageStats | null> {
  // 获取所有评论，从评论中提取模板使用信息
  const comments = await getAllComments();
  const agentComments = comments.filter(c => c.agentId === templateId);

  const usageByAgent = agentComments.map(comment => ({
    agentId: comment.userId,
    agentName: `User ${comment.userId.substring(0, 8)}`,
    count: 1,
  }));

  // 按用户聚合
  const agentUsageMap = new Map<string, { count: number; name: string }>();
  usageByAgent.forEach(usage => {
    if (!agentUsageMap.has(usage.agentId)) {
      agentUsageMap.set(usage.agentId, { count: 0, name: usage.agentName });
    }
    const current = agentUsageMap.get(usage.agentId)!;
    current.count += 1;
  });

  const aggregatedUsage = Array.from(agentUsageMap.entries()).map(([agentId, data]) => ({
    agentId,
    agentName: data.name,
    count: data.count,
  }));

  return {
    templateId,
    templateName: `模板 ${templateId.substring(0, 8)}`,
    usageCount: aggregatedUsage.reduce((sum, item) => sum + item.count, 0),
    lastUsedAt: comments.length > 0 ? comments[comments.length - 1].createdAt : new Date().toISOString(),
    usageByAgent: aggregatedUsage.slice(0, 10), // 只返回前10个使用最多
  };
}

/**
 * 获取所有模板使用统计
 */
export async function getAllTemplateUsageStats(): Promise<TemplateUsageStats[]> {
  const allAgents = await getAgents();
  const stats = [];

  for (const agent of allAgents) {
    const statsData = await getTemplateUsageStats(agent.id);
    if (statsData && statsData.usageCount > 0) {
      stats.push(statsData);
    }
  }

  return stats.sort((a, b) => b.usageCount - a.usageCount);
}

/**
 * 获取评分趋势统计
 */
export async function getRatingTrendStats(agentId: string): Promise<RatingTrendStats | null> {
  const agent = await getAgent(agentId);
  if (!agent) {
    return null;
  }

  // 获取所有评分
  const allRatingStats = await getAllAgentsRatingStats();
  const agentStats = allRatingStats.find(s => s.agentId === agentId);

  if (!agentStats || agentStats.totalRatings === 0) {
    return null;
  }

  // 生成模拟的评分趋势数据
  const ratingTrend = [];
  const now = new Date();
  const thirtyDays = 30;

  // 生成过去30天的数据
  for (let i = thirtyDays; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // 模拟每日的平均评分（基于当前平均评分波动）
    const randomVariation = (Math.random() - 0.5) * 0.5;
    const dailyAvg = Math.max(1, Math.min(5, agentStats.averageRating + randomVariation));
    const dailyCount = Math.floor(Math.random() * agentStats.totalRatings / 30) + 1;

    ratingTrend.push({
      date: dateStr,
      averageRating: parseFloat(dailyAvg.toFixed(1)),
      ratingCount: dailyCount,
    });
  }

  // 构建评分分布
  const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({
    rating,
    count: 0,
  }));

  // 这里使用平均评分估算分布（实际应用中应该从历史数据中获取）
  if (agentStats.averageRating >= 4.5) {
    ratingDistribution[0].count = 0;
    ratingDistribution[1].count = 0;
    ratingDistribution[2].count = 1;
    ratingDistribution[3].count = 3;
    ratingDistribution[4].count = agentStats.totalRatings - 4;
  } else if (agentStats.averageRating >= 3.5) {
    ratingDistribution[0].count = 0;
    ratingDistribution[1].count = 1;
    ratingDistribution[2].count = 2;
    ratingDistribution[3].count = 3;
    ratingDistribution[4].count = agentStats.totalRatings - 6;
  } else if (agentStats.averageRating >= 2.5) {
    ratingDistribution[0].count = 1;
    ratingDistribution[1].count = 2;
    ratingDistribution[2].count = 3;
    ratingDistribution[3].count = 2;
    ratingDistribution[4].count = agentStats.totalRatings - 8;
  } else {
    ratingDistribution[0].count = 2;
    ratingDistribution[1].count = 3;
    ratingDistribution[2].count = 4;
    ratingDistribution[3].count = 1;
    ratingDistribution[4].count = agentStats.totalRatings - 10;
  }

  return {
    agentId: agent.id,
    name: agent.name,
    ratingDistribution,
    ratingTrend,
    latestRating: agentStats.latestRating?.rating || agentStats.averageRating,
    averageRating: parseFloat(agentStats.averageRating.toFixed(1)),
    totalRatings: agentStats.totalRatings,
  };
}

/**
 * 获取所有 Agent 的评分趋势统计
 */
export async function getAllRatingTrendStats(): Promise<RatingTrendStats[]> {
  const allAgents = await getAgents();
  const stats = [];

  for (const agent of allAgents) {
    const statsData = await getRatingTrendStats(agent.id);
    if (statsData && statsData.totalRatings > 0) {
      stats.push(statsData);
    }
  }

  return stats;
}

/**
 * 获取热门 Agent 统计
 */
export async function getPopularAgentsStats(
  limit: number = 10
): Promise<PopularAgentStats[]> {
  const allAgents = await getAgents();
  const ratingStats = await getAllAgentsRatingStats();
  const agentStatsMap = new Map(ratingStats.map(s => [s.agentId, s]));

  // 计算流行度得分
  const popularAgents = allAgents.map(agent => {
    const stats = agentStatsMap.get(agent.id);
    const rating = stats?.averageRating || 0;
    const ratingCount = stats?.totalRatings || 0;
    const viewCount = agent.viewCount || 0;
    const templateCount = agent.templateCount || 0;

    // 流行度得分公式：评分权重60% + 浏览权重20% + 模板权重20%
    const popularityScore =
      rating * 60 + // 评分（1-5分，最高300分）
      viewCount * 0.2 + // 浏览次数
      templateCount * 10; // 模板数量

    return {
      agentId: agent.id,
      name: agent.name,
      category: agent.category,
      tags: agent.tags,
      rating,
      ratingCount,
      viewCount,
      templateCount,
      popularityScore,
    };
  });

  // 按流行度得分排序
  popularAgents.sort((a, b) => b.popularityScore - a.popularityScore);

  // 添加排名并限制数量
  return popularAgents.slice(0, limit).map((agent, index) => ({
    ...agent,
    rank: index + 1,
  }));
}

/**
 * 获取统计汇总
 */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const allAgents = await getAgents();
  const ratingStats = await getAllAgentsRatingStats();
  const allComments = await getAllComments();

  // 计算总访问次数
  const totalViews = allAgents.reduce((sum, agent) => sum + (agent.viewCount || 0), 0);

  // 计算总评分数
  const totalRatings = ratingStats.reduce((sum, stats) => sum + stats.totalRatings, 0);

  // 计算平均评分
  const averageRating =
    totalRatings > 0
      ? ratingStats.reduce((sum, stats) => sum + stats.averageRating * stats.totalRatings, 0) /
        totalRatings
      : 0;

  // 获取最受欢迎的 Agent
  const popularAgents = await getPopularAgentsStats(1);
  const mostPopularAgent = popularAgents[0] || null;

  // 获取分类统计
  const categoryMap = new Map<string, number>();
  allAgents.forEach(agent => {
    if (agent.category) {
      categoryMap.set(agent.category, (categoryMap.get(agent.category) || 0) + 1);
    }
  });

  const topCategories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 获取标签统计
  const tagMap = new Map<string, number>();
  allAgents.forEach(agent => {
    agent.tags?.forEach(tag => {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    });
  });

  const topTags = Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalAgents: allAgents.length,
    totalViews,
    totalRatings,
    averageRating: parseFloat(averageRating.toFixed(1)),
    mostPopularAgent: mostPopularAgent || null,
    topCategories,
    topTags,
  };
}

/**
 * 获取统计响应包装器
 */
export function wrapStatsResponse<T>(
  data: T,
  period: string
): StatsResponse<T> {
  return {
    data,
    period,
    total: Array.isArray(data) ? data.length : 1,
  };
}
