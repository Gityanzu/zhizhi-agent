/**
 * Agent 搜索系统测试
 */

import {
  searchAgents,
  getSearchSuggestions,
  getPopularSearches,
  getSearchStats,
  addSearchHistory,
  getUserSearchHistory,
  clearSearchHistory,
} from '../src/services/search';

console.log('🔍 开始测试 Agent 搜索系统...\n');

// 测试 1: 基础搜索
async function testBasicSearch() {
  console.log('🔍 测试 1: 基础搜索');
  try {
    const results = await searchAgents({
      query: '代码助手',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ 基础搜索成功');
    console.log(`📊 总结果: ${results.total}`);
    console.log(`📋 当前页: ${results.page}/${results.totalPages}`);
    console.log(`⏱️ 搜索耗时: ${results.searchTime}ms`);

    if (results.agents.length > 0) {
      console.log('\n搜索结果:');
      results.agents.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} (相关度: ${(agent.score * 10).toFixed(1)}%)`);
        console.log(`     ${agent.description}`);
      });
    }

    console.log();
    return results;
  } catch (error) {
    console.error('❌ 基础搜索失败:', error);
    return null;
  }
}

// 测试 2: 带筛选的搜索
async function testFilteredSearch() {
  console.log('🔍 测试 2: 带筛选的搜索');
  try {
    const results = await searchAgents({
      query: '助手',
      category: '开发工具',
      sortBy: 'rating',
      sortOrder: 'desc',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ 筛选搜索成功');
    console.log(`📊 总结果: ${results.total}`);
    console.log(`📋 当前页: ${results.page}/${results.totalPages}`);

    if (results.agents.length > 0) {
      console.log('\n搜索结果:');
      results.agents.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name}`);
        console.log(`     评分: ${agent.rating || '暂无'} | 评论: ${agent.commentCount || 0}`);
      });
    }

    console.log();
    return results;
  } catch (error) {
    console.error('❌ 筛选搜索失败:', error);
    return null;
  }
}

// 测试 3: 聚合搜索
async function testAdvancedSearch() {
  console.log('🔍 测试 3: 聚合搜索');
  try {
    const results = await searchAgents({
      query: '',
      category: '创意写作',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      pageSize: 10,
    });

    console.log('✅ 聚合搜索成功');
    console.log(`📊 总结果: ${results.total}`);

    // 显示聚合信息
    if (results.facets) {
      console.log('\n聚合信息:');
      console.log('  分类:');
      results.facets.categories.forEach(cat => {
        console.log(`    - ${cat.label}: ${cat.count}`);
      });
      console.log('  模型:');
      results.facets.models.forEach(model => {
        console.log(`    - ${model.label}: ${model.count}`);
      });
    }

    console.log();
    return results;
  } catch (error) {
    console.error('❌ 聚合搜索失败:', error);
    return null;
  }
}

// 测试 4: 搜索建议
async function testSearchSuggestions() {
  console.log('🔍 测试 4: 搜索建议');
  try {
    const suggestions = await getSearchSuggestions('代');

    console.log('✅ 获取搜索建议成功');
    console.log(`📋 建议数量: ${suggestions.length}`);

    suggestions.forEach((suggestion, index) => {
      console.log(`  ${index + 1}. ${suggestion.text} (${suggestion.type})`);
      if (suggestion.category) {
        console.log(`     分类: ${suggestion.category}`);
      }
    });

    console.log();
    return suggestions;
  } catch (error) {
    console.error('❌ 获取搜索建议失败:', error);
    return null;
  }
}

// 测试 5: 热门搜索
async function testPopularSearches() {
  console.log('🔍 测试 5: 热门搜索');
  try {
    const popular = await getPopularSearches();

    console.log('✅ 获取热门搜索成功');
    console.log(`📋 热门搜索数量: ${popular.length}`);

    popular.forEach((item, index) => {
      const trendIcon = item.trend === 'up' ? '↗' : item.trend === 'down' ? '↘' : '→';
      console.log(`  ${index + 1}. ${item.query} ${trendIcon} ${item.count}次`);
    });

    console.log();
    return popular;
  } catch (error) {
    console.error('❌ 获取热门搜索失败:', error);
    return null;
  }
}

// 测试 6: 搜索统计
async function testSearchStats() {
  console.log('🔍 测试 6: 搜索统计');
  try {
    const stats = await getSearchStats();

    console.log('✅ 获取搜索统计成功');
    console.log(`📊 总Agent数: ${stats.totalAgents}`);
    console.log(`📈 总搜索次数: ${stats.totalSearches}`);
    console.log(`⏱️ 平均响应时间: ${stats.averageResponseTime}ms`);
    console.log(`🔥 热门搜索: ${stats.popularSearches.join(', ')}`);

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取搜索统计失败:', error);
    return null;
  }
}

// 测试 7: 搜索历史
async function testSearchHistory() {
  console.log('🔍 测试 7: 搜索历史');
  const testUserId = 'test-user-search';

  try {
    // 添加搜索历史
    const history = await addSearchHistory(testUserId, '测试搜索', 10);
    console.log('✅ 添加搜索历史成功');
    console.log(`📝 查询: ${history.query}`);
    console.log(`📊 结果数: ${history.resultsCount}`);
    console.log(`📅 时间: ${new Date(history.createdAt).toLocaleString()}`);

    // 获取用户历史
    const userHistory = await getUserSearchHistory(testUserId);
    console.log('\n✅ 获取用户历史成功');
    console.log(`📋 历史数量: ${userHistory.length}`);

    userHistory.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.query} (${item.resultsCount}个结果)`);
    });

    // 清除历史
    await clearSearchHistory(testUserId);
    console.log('\n✅ 清除搜索历史成功');

    console.log();
    return { history, userHistory };
  } catch (error) {
    console.error('❌ 搜索历史操作失败:', error);
    return null;
  }
}

// 测试 8: 空搜索
async function testEmptySearch() {
  console.log('🔍 测试 8: 空搜索');
  try {
    const results = await searchAgents({
      query: '',
      page: 1,
      pageSize: 10,
    });

    console.log('✅ 空搜索成功');
    console.log(`📊 总结果: ${results.total}`);
    console.log(`⏱️ 搜索耗时: ${results.searchTime}ms`);

    if (results.agents.length > 0) {
      console.log(`📋 显示前${results.agents.length}个Agent:`);
      results.agents.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} - ${agent.category}`);
      });
    }

    console.log();
    return results;
  } catch (error) {
    console.error('❌ 空搜索失败:', error);
    return null;
  }
}

// 测试 9: 分页功能
async function testPagination() {
  console.log('🔍 测试 9: 分页功能');
  try {
    // 第一页
    const page1 = await searchAgents({
      query: 'agent',
      page: 1,
      pageSize: 2,
    });

    console.log('✅ 第一页获取成功');
    console.log(`📊 总结果: ${page1.total}`);
    console.log(`📋 当前页: ${page1.page}/${page1.totalPages}`);
    console.log(`📄 每页大小: ${page1.pageSize}`);

    // 第二页
    if (page1.totalPages > 1) {
      const page2 = await searchAgents({
        query: 'agent',
        page: 2,
        pageSize: 2,
      });

      console.log('\n✅ 第二页获取成功');
      console.log(`📋 当前页: ${page2.page}/${page2.totalPages}`);
      console.log(`📄 显示数量: ${page2.agents.length}`);
    }

    console.log();
    return page1;
  } catch (error) {
    console.error('❌ 分页测试失败:', error);
    return null;
  }
}

// 测试 10: 性能测试
async function testPerformance() {
  console.log('🔍 测试 10: 性能测试');
  const startTime = Date.now();

  try {
    // 并发执行多个搜索
    const searchPromises = [
      searchAgents({ query: 'code', page: 1, pageSize: 5 }),
      searchAgents({ query: 'writing', page: 1, pageSize: 5 }),
      searchAgents({ query: 'data', page: 1, pageSize: 5 }),
      getPopularSearches(),
      getSearchStats(),
    ];

    const results = await Promise.all(searchPromises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    console.log('✅ 性能测试成功');
    console.log(`⏱️ 总耗时: ${totalTime}ms`);
    console.log(`📊 并发搜索数量: ${searchPromises.length}`);
    console.log(`📈 平均每个搜索: ${(totalTime / searchPromises.length).toFixed(2)}ms`);

    console.log();
    return { results, totalTime };
  } catch (error) {
    console.error('❌ 性能测试失败:', error);
    return null;
  }
}

// 主测试流程
async function runTests() {
  const tests = [
    { name: '基础搜索', fn: testBasicSearch },
    { name: '筛选搜索', fn: testFilteredSearch },
    { name: '聚合搜索', fn: testAdvancedSearch },
    { name: '搜索建议', fn: testSearchSuggestions },
    { name: '热门搜索', fn: testPopularSearches },
    { name: '搜索统计', fn: testSearchStats },
    { name: '搜索历史', fn: testSearchHistory },
    { name: '空搜索', fn: testEmptySearch },
    { name: '分页功能', fn: testPagination },
    { name: '性能测试', fn: testPerformance },
  ];

  const passedTests = [];
  const failedTests = [];

  for (const test of tests) {
    console.log(`\n========================================`);
    console.log(`  运行测试: ${test.name}`);
    console.log(`========================================`);

    try {
      const result = await test.fn();
      if (result !== null) {
        passedTests.push({ name: test.name, result });
      } else {
        failedTests.push(test.name);
      }
    } catch (error) {
      console.error(`❌ 测试失败: ${test.name}`, error);
      failedTests.push(test.name);
    }
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
      console.log(`  ✓ ${test.name}`);
    });
  }

  if (failedTests.length > 0) {
    console.log('\n失败的功能:');
    failedTests.forEach(test => {
      console.log(`  ✗ ${test.name}`);
    });
  }

  if (failedTests.length === 0) {
    console.log('\n🎉 所有测试通过！Agent 搜索系统运行正常。');
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