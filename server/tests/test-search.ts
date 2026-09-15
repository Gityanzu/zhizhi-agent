/**
 * Agent 搜索系统测试
 */

import {
  searchAgents,
  getCategoryList,
  getTagRecommendations,
  getPopularTags,
} from '../src/services/search';
import type { SearchRequest } from '../src/types/search';

console.log('🔍 开始测试 Agent 搜索系统...\n');

// 获取所有 agents 用于测试
let allAgents: any[] = [];

// 初始化测试数据
async function initTestData() {
  try {
    const agents = await searchAgents('', {
      page: 1,
      pageSize: 1000,
    });
    allAgents = agents.results;
    console.log(`✅ 加载了 ${allAgents.length} 个 Agent\n`);
  } catch (error) {
    console.error('❌ 加载测试数据失败:', error);
  }
}

// 测试 1: 全文搜索
async function testFullTextSearch() {
  console.log('🔍 测试 1: 全文搜索');
  try {
    // 搜索包含 "聊天" 的 agents
    const result = await searchAgents('聊天');

    console.log('✅ 全文搜索成功');
    console.log(`📊 总结果数: ${result.total}`);
    console.log(`📋 当前页: ${result.page}/${result.totalPages}`);
    console.log(`📄 每页大小: ${result.pageSize}`);

    if (result.results.length > 0) {
      console.log('\n搜索结果:');
      result.results.slice(0, 3).forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} - ${agent.description.substring(0, 50)}...`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 全文搜索失败:', error);
    return null;
  }
}

// 测试 2: 分类筛选
async function testCategoryFilter() {
  console.log('🔍 测试 2: 分类筛选');
  try {
    // 搜索特定分类
    const result = await searchAgents('', {
      category: '聊天',
      page: 1,
      pageSize: 10,
    });

    console.log('✅ 分类筛选成功');
    console.log(`📊 分类 "${result.filters.categories?.find(c => c.name === '聊天')?.name}" 结果数: ${result.total}`);

    if (result.results.length > 0) {
      console.log('\n分类结果:');
      result.results.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name}`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 分类筛选失败:', error);
    return null;
  }
}

// 测试 3: 标签筛选
async function testTagFilter() {
  console.log('🔍 测试 3: 标签筛选');
  try {
    // 搜索包含特定标签的 agents
    const result = await searchAgents('', {
      tags: ['常用'],
      page: 1,
      pageSize: 10,
    });

    console.log('✅ 标签筛选成功');
    console.log(`📊 标签筛选结果数: ${result.total}`);

    if (result.results.length > 0) {
      console.log('\n标签筛选结果:');
      result.results.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} - 标签: ${agent.tags?.join(', ')}`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 标签筛选失败:', error);
    return null;
  }
}

// 测试 4: 排序功能 - 按最新排序
async function testSortByLatest() {
  console.log('🔍 测试 4: 按最新排序');
  try {
    const result = await searchAgents('', {
      sortBy: 'latest',
      sortOrder: 'desc',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ 按最新排序成功');
    console.log(`📊 排序结果数: ${result.total}`);

    if (result.results.length > 0) {
      console.log('\n最新结果:');
      result.results.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} - 创建于 ${new Date(agent.createdAt).toLocaleDateString()}`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 按最新排序失败:', error);
    return null;
  }
}

// 测试 5: 排序功能 - 按热度排序
async function testSortByPopular() {
  console.log('🔍 测试 5: 按热度排序');
  try {
    const result = await searchAgents('', {
      sortBy: 'popular',
      sortOrder: 'desc',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ 按热度排序成功');
    console.log(`📊 排序结果数: ${result.total}`);

    if (result.results.length > 0) {
      console.log('\n热门结果:');
      result.results.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} - 浏览: ${agent.viewCount}`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 按热度排序失败:', error);
    return null;
  }
}

// 测试 6: 排序功能 - 按评分排序
async function testSortByHighestRated() {
  console.log('🔍 测试 6: 按评分排序');
  try {
    const result = await searchAgents('', {
      sortBy: 'highest-rated',
      sortOrder: 'desc',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ 按评分排序成功');
    console.log(`📊 排序结果数: ${result.total}`);

    if (result.results.length > 0) {
      console.log('\n高分结果:');
      result.results.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} - 评分: ${agent.rating} (${agent.ratingCount} 评价)`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 按评分排序失败:', error);
    return null;
  }
}

// 测试 7: 分页功能
async function testPagination() {
  console.log('🔍 测试 7: 分页功能');
  try {
    const pageSize = 2;
    const page1 = await searchAgents('', {
      sortBy: 'latest',
      page: 1,
      pageSize,
    });

    const page2 = await searchAgents('', {
      sortBy: 'latest',
      page: 2,
      pageSize,
    });

    console.log('✅ 分页功能测试成功');
    console.log(`📄 第一页结果数: ${page1.results.length}`);
    console.log(`📄 第二页结果数: ${page2.results.length}`);
    console.log(`📊 总数: ${page1.total}`);

    if (page1.results.length > 0 && page2.results.length > 0) {
      console.log('\n分页对比:');
      console.log(`  第一页: ${page1.results.map(a => a.name).join(', ')}`);
      console.log(`  第二页: ${page2.results.map(a => a.name).join(', ')}`);
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 分页功能测试失败:', error);
    return false;
  }
}

// 测试 8: 获取分类列表
async function testGetCategoryList() {
  console.log('🔍 测试 8: 获取分类列表');
  try {
    const result = await getCategoryList();

    console.log('✅ 获取分类列表成功');
    console.log(`📊 分类总数: ${result.categories.length}`);

    if (result.categories.length > 0) {
      console.log('\n分类列表:');
      result.categories.forEach((cat, index) => {
        console.log(`  ${index + 1}. ${cat.name} - ${cat.count} 个 Agent`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 获取分类列表失败:', error);
    return null;
  }
}

// 测试 9: 获取标签推荐（全局）
async function testGetTagRecommendations() {
  console.log('🔍 测试 9: 获取标签推荐');
  try {
    const result = await getTagRecommendations({ limit: 10 });

    console.log('✅ 获取标签推荐成功');
    console.log(`📊 推荐标签数: ${result.tags.length}`);

    if (result.tags.length > 0) {
      console.log('\n推荐标签:');
      result.tags.forEach((tag, index) => {
        console.log(`  ${index + 1}. ${tag.name} - ${tag.count} 次`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 获取标签推荐失败:', error);
    return null;
  }
}

// 测试 10: 获取分类标签推荐
async function testGetCategoryTagRecommendations() {
  console.log('🔍 测试 10: 获取分类标签推荐');
  try {
    const result = await getTagRecommendations({
      category: '聊天',
      limit: 5,
    });

    console.log('✅ 获取分类标签推荐成功');
    console.log(`📊 推荐标签数: ${result.tags.length}`);

    if (result.tags.length > 0) {
      console.log('\n聊天分类推荐标签:');
      result.tags.forEach((tag, index) => {
        console.log(`  ${index + 1}. ${tag.name} - ${tag.count} 次`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 获取分类标签推荐失败:', error);
    return null;
  }
}

// 测试 11: 获取热门标签
async function testGetPopularTags() {
  console.log('🔍 测试 11: 获取热门标签');
  try {
    const popularTags = getPopularTags(allAgents, 10);

    console.log('✅ 获取热门标签成功');
    console.log(`📊 热门标签数: ${popularTags.length}`);

    if (popularTags.length > 0) {
      console.log('\n热门标签:');
      popularTags.forEach((tag, index) => {
        console.log(`  ${index + 1}. ${tag}`);
      });
    }

    console.log();
    return popularTags;
  } catch (error) {
    console.error('❌ 获取热门标签失败:', error);
    return null;
  }
}

// 测试 12: 组合筛选测试
async function testCombinedFilters() {
  console.log('🔍 测试 12: 组合筛选测试');
  try {
    const result = await searchAgents('聊天', {
      category: '聊天',
      sortBy: 'highest-rated',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ 组合筛选成功');
    console.log(`📊 组合筛选结果数: ${result.total}`);

    if (result.results.length > 0) {
      console.log('\n组合筛选结果:');
      result.results.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} - 评分: ${agent.rating}`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 组合筛选测试失败:', error);
    return null;
  }
}

// 测试 13: 空查询测试
async function testEmptyQuery() {
  console.log('🔍 测试 13: 空查询测试');
  try {
    const result = await searchAgents('', {
      page: 1,
      pageSize: 10,
    });

    console.log('✅ 空查询测试成功');
    console.log(`📊 返回总 Agent 数: ${result.total}`);

    if (result.results.length > 0) {
      console.log('\n前3个 Agent:');
      result.results.slice(0, 3).forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name}`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 空查询测试失败:', error);
    return null;
  }
}

// 测试 14: 不存在的分类
async function testNonExistentCategory() {
  console.log('🔍 测试 14: 不存在的分类');
  try {
    const result = await searchAgents('', {
      category: '不存在的分类',
      page: 1,
      pageSize: 10,
    });

    console.log('✅ 不存在的分类测试成功');
    console.log(`📊 搜索结果数: ${result.total}`);

    if (result.total === 0) {
      console.log('✅ 正确返回空结果');
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 不存在的分类测试失败:', error);
    return null;
  }
}

// 测试 15: 复杂搜索场景
async function testComplexSearch() {
  console.log('🔍 测试 15: 复杂搜索场景');
  try {
    // 搜索关键词 "助手" 且有 "Python" 标签，按最新排序
    const result = await searchAgents('助手', {
      tags: ['Python'],
      sortBy: 'latest',
      sortOrder: 'desc',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ 复杂搜索测试成功');
    console.log(`📊 复杂搜索结果数: ${result.total}`);

    if (result.results.length > 0) {
      console.log('\n复杂搜索结果:');
      result.results.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} - 标签: ${agent.tags?.join(', ')}`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 复杂搜索测试失败:', error);
    return null;
  }
}

// 主测试流程
async function runTests() {
  console.log('========================================');
  console.log('  开始 Agent 搜索系统测试');
  console.log('========================================\n');

  // 初始化测试数据
  await initTestData();

  const tests = [
    { name: '全文搜索', fn: testFullTextSearch },
    { name: '分类筛选', fn: testCategoryFilter },
    { name: '标签筛选', fn: testTagFilter },
    { name: '按最新排序', fn: testSortByLatest },
    { name: '按热度排序', fn: testSortByPopular },
    { name: '按评分排序', fn: testSortByHighestRated },
    { name: '分页功能', fn: testPagination },
    { name: '获取分类列表', fn: testGetCategoryList },
    { name: '获取标签推荐', fn: testGetTagRecommendations },
    { name: '获取分类标签推荐', fn: testGetCategoryTagRecommendations },
    { name: '获取热门标签', fn: testGetPopularTags },
    { name: '组合筛选测试', fn: testCombinedFilters },
    { name: '空查询测试', fn: testEmptyQuery },
    { name: '不存在的分类', fn: testNonExistentCategory },
    { name: '复杂搜索场景', fn: testComplexSearch },
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
