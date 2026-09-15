/**
 * Agent 统计和分析系统测试
 */

import {
  getAgentViewStats,
  getAllAgentViewStats,
  getTemplateUsageStats,
  getAllTemplateUsageStats,
  getRatingTrendStats,
  getAllRatingTrendStats,
  getPopularAgentsStats,
  getAnalyticsSummary,
} from '../src/services/analytics';
import type { StatsResponse } from '../types/analytics';

console.log('📊 开始测试 Agent 统计和分析系统...\n');

// 测试 1: 获取单个 Agent 的访问统计
async function testGetAgentViewStats() {
  console.log('📊 测试 1: 获取单个 Agent 的访问统计');
  try {
    const agents = await getAllAgentViewStats();
    if (agents.length > 0) {
      const stats = await getAgentViewStats(agents[0].agentId);

      if (stats) {
        console.log('✅ 获取访问统计成功');
        console.log(`🆔 Agent ID: ${stats.agentId}`);
        console.log(`👀 总浏览次数: ${stats.viewCount}`);
        console.log(`📅 最后访问: ${new Date(stats.lastViewedAt).toLocaleDateString()}`);
        console.log(`📋 最近7天浏览: ${stats.viewHistory.slice(0, 7).map(h => h.count).join(', ')}`);
      }
    } else {
      console.log('⚠️ 没有 Agent 数据');
    }

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取访问统计失败:', error);
    return null;
  }
}

// 测试 2: 获取所有 Agent 的访问统计
async function testGetAllAgentViewStats() {
  console.log('📊 测试 2: 获取所有 Agent 的访问统计');
  try {
    const stats = await getAllAgentViewStats();

    console.log('✅ 获取所有访问统计成功');
    console.log(`📊 总计: ${stats.length} 个 Agent`);

    if (stats.length > 0) {
      console.log('\n前3个 Agent:');
      stats.slice(0, 3).forEach((stat, index) => {
        console.log(`  ${index + 1}. ${stat.agentId.substring(0, 8)} - ${stat.viewCount} 次浏览`);
      });
    }

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取所有访问统计失败:', error);
    return null;
  }
}

// 测试 3: 获取模板使用统计
async function testGetTemplateUsageStats() {
  console.log('📊 测试 3: 获取模板使用统计');
  try {
    const agents = await getAllAgentViewStats();
    if (agents.length > 0) {
      const stats = await getTemplateUsageStats(agents[0].agentId);

      if (stats) {
        console.log('✅ 获取模板使用统计成功');
        console.log(`🆔 模板 ID: ${stats.templateId}`);
        console.log(`📊 使用次数: ${stats.usageCount}`);
        console.log(`📅 最后使用: ${new Date(stats.lastUsedAt).toLocaleDateString()}`);
        console.log(`👥 使用最多的 Agent: ${stats.usageByAgent[0]?.agentName || '无'}`);
      }
    } else {
      console.log('⚠️ 没有模板数据');
    }

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取模板使用统计失败:', error);
    return null;
  }
}

// 测试 4: 获取所有模板使用统计
async function testGetAllTemplateUsageStats() {
  console.log('📊 测试 4: 获取所有模板使用统计');
  try {
    const stats = await getAllTemplateUsageStats();

    console.log('✅ 获取所有模板使用统计成功');
    console.log(`📊 总计: ${stats.length} 个模板有使用数据`);

    if (stats.length > 0) {
      console.log('\n使用次数最多的3个模板:');
      stats.slice(0, 3).forEach((stat, index) => {
        console.log(`  ${index + 1}. ${stat.templateName} - ${stat.usageCount} 次使用`);
      });
    }

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取所有模板使用统计失败:', error);
    return null;
  }
}

// 测试 5: 获取评分趋势统计
async function testGetRatingTrendStats() {
  console.log('📊 测试 5: 获取评分趋势统计');
  try {
    const ratingTrends = await getAllRatingTrendStats();
    if (ratingTrends.length > 0) {
      const stats = await getRatingTrendStats(ratingTrends[0].agentId);

      if (stats) {
        console.log('✅ 获取评分趋势成功');
        console.log(`🆔 Agent: ${stats.name}`);
        console.log(`⭐ 平均评分: ${stats.averageRating}`);
        console.log(`📝 总评分数: ${stats.totalRatings}`);
        console.log(`📅 最新评分: ${stats.latestRating}`);

        console.log('\n最近5天评分趋势:');
        stats.ratingTrend.slice(-5).forEach((day, index) => {
          console.log(`  ${index + 1}. ${day.date}: 平均 ${day.averageRating} (${day.ratingCount} 条)`);
        });

        console.log('\n评分分布:');
        stats.ratingDistribution.forEach(d => {
          console.log(`  ${'⭐'.repeat(d.rating)}: ${d.count} 条`);
        });
      }
    } else {
      console.log('⚠️ 没有评分数据');
    }

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取评分趋势失败:', error);
    return null;
  }
}

// 测试 6: 获取热门 Agent 统计
async function testGetPopularAgentsStats() {
  console.log('📊 测试 6: 获取热门 Agent 统计');
  try {
    const popularAgents = await getPopularAgentsStats(10);

    console.log('✅ 获取热门 Agent 成功');
    console.log(`📊 返回前 ${popularAgents.length} 个热门 Agent`);

    if (popularAgents.length > 0) {
      console.log('\n热门 Agent 排行:');
      popularAgents.forEach((agent, index) => {
        console.log(
          `  ${index + 1}. ${agent.name} - ` +
          `评分: ${agent.rating}⭐ (${agent.ratingCount}条) ` +
          `浏览: ${agent.viewCount}次 ` +
          `模板: ${agent.templateCount}个 ` +
          `综合得分: ${agent.popularityScore.toFixed(1)}`
        );
      });
    }

    console.log();
    return popularAgents;
  } catch (error) {
    console.error('❌ 获取热门 Agent 失败:', error);
    return null;
  }
}

// 测试 7: 获取统计汇总
async function testGetAnalyticsSummary() {
  console.log('📊 测试 7: 获取统计汇总');
  try {
    const summary = await getAnalyticsSummary();

    console.log('✅ 获取统计汇总成功');
    console.log(`👥 Agent 总数: ${summary.totalAgents}`);
    console.log(`👀 总浏览次数: ${summary.totalViews}`);
    console.log(`⭐ 总评分数: ${summary.totalRatings}`);
    console.log(`📊 平均评分: ${summary.averageRating}`);

    console.log('\n最热门的 Agent:');
    if (summary.mostPopularAgent) {
      const agent = summary.mostPopularAgent;
      console.log(`  ${agent.name} - 综合得分: ${agent.popularityScore.toFixed(1)}`);
    }

    console.log('\n热门分类:');
    summary.topCategories.forEach((cat, index) => {
      console.log(`  ${index + 1}. ${cat.name} - ${cat.count} 个 Agent`);
    });

    console.log('\n热门标签:');
    summary.topTags.forEach((tag, index) => {
      console.log(`  ${index + 1}. ${tag.name} - ${tag.count} 次`);
    });

    console.log();
    return summary;
  } catch (error) {
    console.error('❌ 获取统计汇总失败:', error);
    return null;
  }
}

// 测试 8: 测试不同的热门 Agent 数量
async function testDifferentPopularLimits() {
  console.log('📊 测试 8: 测试不同的热门 Agent 数量');
  try {
    const limits = [5, 10, 20];

    for (const limit of limits) {
      const popularAgents = await getPopularAgentsStats(limit);
      console.log(`✅ 获取 ${limit} 个热门 Agent 成功`);
      console.log(`📊 实际返回: ${popularAgents.length} 个`);
      console.log();
    }

    return true;
  } catch (error) {
    console.error('❌ 测试不同数量失败:', error);
    return false;
  }
}

// 测试 9: 测试无数据的 Agent
async function testEmptyStats() {
  console.log('📊 测试 9: 测试无数据的 Agent');
  try {
    const stats = await getAgentViewStats('non-existent-agent-id');
    if (!stats) {
      console.log('✅ 正确处理不存在的 Agent');
    } else {
      console.log('⚠️ 意外返回了数据');
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return false;
  }
}

// 测试 10: 验证评分分布
async function testRatingDistribution() {
  console.log('📊 测试 10: 验证评分分布');
  try {
    const ratingTrends = await getAllRatingTrendStats();
    if (ratingTrends.length > 0) {
      const stats = await getRatingTrendStats(ratingTrends[0].agentId);

      if (stats) {
        console.log('✅ 验证评分分布');
        console.log(`总评分数: ${stats.totalRatings}`);
        console.log(`平均评分: ${stats.averageRating}`);

        // 计算分布总和
        const totalDistribution = stats.ratingDistribution.reduce((sum, item) => sum + item.count, 0);
        console.log(`分布总和: ${totalDistribution}`);

        if (totalDistribution === stats.totalRatings) {
          console.log('✅ 评分分布总和正确');
        } else {
          console.log('⚠️ 评分分布总和不匹配');
        }
      }
    } else {
      console.log('⚠️ 没有评分数据');
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return false;
  }
}

// 测试 11: 测试访问历史
async function testViewHistory() {
  console.log('📊 测试 11: 测试访问历史');
  try {
    const agents = await getAllAgentViewStats();
    if (agents.length > 0) {
      const stats = await getAgentViewStats(agents[0].agentId);

      if (stats && stats.viewHistory.length > 0) {
        console.log('✅ 访问历史测试成功');
        console.log(`📅 历史天数: ${stats.viewHistory.length}`);
        console.log(`📈 总浏览次数: ${stats.viewCount}`);

        // 验证按日期排序
        const dates = stats.viewHistory.map(h => h.date);
        const isSorted = dates.every((date, i) => i === 0 || new Date(date) >= new Date(dates[i - 1]));

        if (isSorted) {
          console.log('✅ 历史记录按日期正确排序');
        } else {
          console.log('⚠️ 历史记录排序不正确');
        }
      }
    } else {
      console.log('⚠️ 没有 Agent 数据');
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return false;
  }
}

// 测试 12: 测试综合得分计算
async function testPopularityScore() {
  console.log('📊 测试 12: 测试综合得分计算');
  try {
    const popularAgents = await getPopularAgentsStats(5);

    if (popularAgents.length > 1) {
      console.log('✅ 综合得分测试成功');
      console.log('\n热门 Agent 得分对比:');
      popularAgents.forEach((agent, index) => {
        console.log(
          `  ${index + 1}. ${agent.name}: ${agent.popularityScore.toFixed(1)} ` +
          `(${agent.rating.toFixed(1)}分 × 60 + ${agent.viewCount}次 × 0.2 + ${agent.templateCount}个 × 10)`
        );
      });

      // 验证得分顺序是否正确
      const scores = popularAgents.map(a => a.popularityScore);
      const isSorted = scores.every((score, i) => i === 0 || score <= scores[i - 1]);

      if (isSorted) {
        console.log('✅ 得分按降序正确排列');
      } else {
        console.log('⚠️ 得分排序不正确');
      }
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return false;
  }
}

// 测试 13: 测试趋势数据完整性
async function testTrendDataIntegrity() {
  console.log('📊 测试 13: 测试趋势数据完整性');
  try {
    const ratingTrends = await getAllRatingTrendStats();
    if (ratingTrends.length > 0) {
      const stats = await getRatingTrendStats(ratingTrends[0].agentId);

      if (stats) {
        console.log('✅ 趋势数据完整性测试');
        console.log(`📅 趋势天数: ${stats.ratingTrend.length}`);

        // 验证每条趋势数据的完整性
        const isComplete = stats.ratingTrend.every(day => {
          return day.date && day.averageRating !== undefined && day.ratingCount !== undefined;
        });

        if (isComplete) {
          console.log('✅ 每条趋势数据完整');
        } else {
          console.log('⚠️ 趋势数据不完整');
        }

        // 验证日期格式
        const dates = stats.ratingTrend.map(day => new Date(day.date));
        const hasValidDates = dates.every(date => !isNaN(date.getTime()));

        if (hasValidDates) {
          console.log('✅ 日期格式正确');
        } else {
          console.log('⚠️ 日期格式错误');
        }
      }
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return false;
  }
}

// 测试 14: 测试分类统计
async function testCategoryStats() {
  console.log('📊 测试 14: 测试分类统计');
  try {
    const summary = await getAnalyticsSummary();

    console.log('✅ 分类统计测试成功');
    console.log(`📊 分类总数: ${summary.topCategories.length}`);

    if (summary.topCategories.length > 0) {
      console.log('\n分类分布:');
      summary.topCategories.forEach((cat, index) => {
        console.log(`  ${index + 1}. ${cat.name} - ${cat.count} 个 Agent`);
      });
    } else {
      console.log('⚠️ 没有分类数据');
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return false;
  }
}

// 测试 15: 测试标签统计
async function testTagStats() {
  console.log('📊 测试 15: 测试标签统计');
  try {
    const summary = await getAnalyticsSummary();

    console.log('✅ 标签统计测试成功');
    console.log(`📊 标签总数: ${summary.topTags.length}`);

    if (summary.topTags.length > 0) {
      console.log('\n热门标签:');
      summary.topTags.forEach((tag, index) => {
        console.log(`  ${index + 1}. ${tag.name} - ${tag.count} 次`);
      });
    } else {
      console.log('⚠️ 没有标签数据');
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return false;
  }
}

// 主测试流程
async function runTests() {
  const tests = [
    { name: '获取单个 Agent 访问统计', fn: testGetAgentViewStats },
    { name: '获取所有 Agent 访问统计', fn: testGetAllAgentViewStats },
    { name: '获取模板使用统计', fn: testGetTemplateUsageStats },
    { name: '获取所有模板使用统计', fn: testGetAllTemplateUsageStats },
    { name: '获取评分趋势统计', fn: testGetRatingTrendStats },
    { name: '获取热门 Agent 统计', fn: testGetPopularAgentsStats },
    { name: '获取统计汇总', fn: testGetAnalyticsSummary },
    { name: '测试不同热门 Agent 数量', fn: testDifferentPopularLimits },
    { name: '测试无数据的 Agent', fn: testEmptyStats },
    { name: '验证评分分布', fn: testRatingDistribution },
    { name: '测试访问历史', fn: testViewHistory },
    { name: '测试综合得分计算', fn: testPopularityScore },
    { name: '测试趋势数据完整性', fn: testTrendDataIntegrity },
    { name: '测试分类统计', fn: testCategoryStats },
    { name: '测试标签统计', fn: testTagStats },
  ];

  const passedTests = [];
  const failedTests = [];

  for (const test of tests) {
    console.log(`\n========================================`);
    console.log(`  运行测试: ${test.name}`);
    console.log(`========================================`);

    try {
      await test.fn();
      passedTests.push(test.name);
    } catch (error) {
      console.error(`❌ 测试失败: ${test.name}`, error);
      failedTests.push(test.name);
    }

    // 短暂延迟，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 测试总结
  console.log('\n========================================');
  console.log('            测试总结');
  console.log('========================================');
  console.log(`✅ 通过测试: ${passedTests.length}/${tests.length}`);
  console.log(`❌ 失败测试: ${failedTests.length}/${tests.length}`);

  if (passedTests.length > 0) {
    console.log('\n通过的功能:');
    passedTests.forEach(test => {
      console.log(`  ✓ ${test}`);
    });
  }

  if (failedTests.length > 0) {
    console.log('\n失败的功能:');
    failedTests.forEach(test => {
      console.log(`  ✗ ${test}`);
    });
  }

  if (failedTests.length === 0) {
    console.log('\n🎉 所有测试通过！Agent 统计和分析系统运行正常。');
  } else {
    console.log('\n⚠️ 部分测试失败，请检查相关功能。');
  }

  console.log('\n========================================\n');
}

// 运行测试
runTests().catch((error) => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
