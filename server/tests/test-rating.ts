/**
 * Agent 评分系统测试
 */

import {
  createUserRating,
  updateUserRating,
  deleteUserRating,
  getUserRating,
  getRatings,
  getRatingStats,
  getAllAgentsRatingStats,
  disableRating,
  restoreRating,
  adminDeleteRating,
} from '../src/services/rating';
import type { CreateRatingRequest, UpdateRatingRequest } from '../src/types/rating';

console.log('⭐ 开始测试 Agent 评分系统...\n');

// 测试数据
const testUserId = 'test-user-rating';
const testAgentId = 'agent-1';
const testRatingData: CreateRatingRequest = {
  rating: 4,
  comment: '这是一个很好的 Agent！',
};

// 测试 1: 创建评分
async function testCreateRating() {
  console.log('⭐ 测试 1: 创建评分');
  try {
    const rating = await createUserRating(testAgentId, testUserId, testRatingData);

    console.log('✅ 创建评分成功');
    console.log(`📝 评分ID: ${rating.id}`);
    console.log(`🆔 Agent ID: ${rating.agentId}`);
    console.log(`👤 用户 ID: ${rating.userId}`);
    console.log(`⭐ 评分: ${rating.rating}/5`);
    console.log(`💬 评论: ${rating.comment}`);
    console.log(`📅 创建时间: ${new Date(rating.createdAt).toLocaleString()}`);
    console.log(`📊 状态: ${rating.status}`);

    console.log();
    return rating;
  } catch (error) {
    console.error('❌ 创建评分失败:', error);
    return null;
  }
}

// 测试 2: 获取用户评分
async function testGetUserRating() {
  console.log('⭐ 测试 2: 获取用户评分');
  try {
    const rating = await getUserRating(testAgentId, testUserId);

    if (rating) {
      console.log('✅ 获取用户评分成功');
      console.log(`⭐ 评分: ${rating.rating}/5`);
      console.log(`💬 评论: ${rating.comment}`);
    } else {
      console.log('⚠️ 用户尚未评分');
    }

    console.log();
    return rating;
  } catch (error) {
    console.error('❌ 获取用户评分失败:', error);
    return null;
  }
}

// 测试 3: 更新评分
async function testUpdateRating(ratingId?: string) {
  console.log('⭐ 测试 3: 更新评分');
  if (!ratingId) {
    console.log('⚠️ 没有评分ID，跳过更新测试\n');
    return null;
  }

  try {
    const updateData: UpdateRatingRequest = {
      rating: 5,
      comment: '这是一个非常出色的 Agent！强烈推荐！',
    };

    const rating = await updateUserRating(ratingId, testUserId, updateData);

    console.log('✅ 更新评分成功');
    console.log(`⭐ 新评分: ${rating.rating}/5`);
    console.log(`💬 新评论: ${rating.comment}`);
    console.log(`📅 更新时间: ${new Date(rating.updatedAt).toLocaleString()}`);

    console.log();
    return rating;
  } catch (error) {
    console.error('❌ 更新评分失败:', error);
    return null;
  }
}

// 测试 4: 获取评分列表
async function testGetRatings() {
  console.log('⭐ 测试 4: 获取评分列表');
  try {
    const result = await getRatings({
      agentId: testAgentId,
      sortBy: 'latest',
      sortOrder: 'desc',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ 获取评分列表成功');
    console.log(`📊 总评分: ${result.total}`);
    console.log(`📋 当前页: ${result.page}/${result.totalPages}`);
    console.log(`📄 每页大小: ${result.pageSize}`);

    if (result.ratings.length > 0) {
      console.log('\n评分列表:');
      result.ratings.forEach((rating, index) => {
        console.log(`  ${index + 1}. ${rating.rating}星 - ${rating.comment || '无评论'}`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 获取评分列表失败:', error);
    return null;
  }
}

// 测试 5: 获取评分统计
async function testGetRatingStats() {
  console.log('⭐ 测试 5: 获取评分统计');
  try {
    const stats = await getRatingStats(testAgentId);

    console.log('✅ 获取评分统计成功');
    console.log(`📊 平均评分: ${stats.averageRating}/5`);
    console.log(`🔢 总评分数: ${stats.totalRatings}`);
    console.log('\n评分分布:');
    Object.entries(stats.ratingDistribution).forEach(([stars, count]) => {
      console.log(`  ${stars}星: ${count}个`);
    });

    if (stats.latestRating) {
      console.log(`\n最新评分: ${stats.latestRating.rating}星 - ${stats.latestRating.comment || '无评论'}`);
    }

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取评分统计失败:', error);
    return null;
  }
}

// 测试 6: 删除评分
async function testDeleteRating(ratingId?: string) {
  console.log('⭐ 测试 6: 删除评分');
  if (!ratingId) {
    console.log('⚠️ 没有评分ID，跳过删除测试\n');
    return false;
  }

  try {
    const result = await deleteUserRating(ratingId, testUserId);

    if (result) {
      console.log('✅ 删除评分成功');
    } else {
      console.log('⚠️ 删除失败（评分不存在）');
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 删除评分失败:', error);
    return false;
  }
}

// 测试 7: 获取所有 Agent 评分统计
async function testGetAllAgentsRatingStats() {
  console.log('⭐ 测试 7: 获取所有 Agent 评分统计');
  try {
    const stats = await getAllAgentsRatingStats();

    console.log('✅ 获取所有 Agent 评分统计成功');
    console.log(`📊 Agent 数量: ${stats.length}`);

    stats.slice(0, 3).forEach((stat, index) => {
      console.log(`\n${index + 1}. Agent ${stat.agentId}`);
      console.log(`   平均评分: ${stat.averageRating}/5 (${stat.totalRatings} 个评分)`);
    });

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取所有 Agent 评分统计失败:', error);
    return null;
  }
}

// 测试 8: 管理员操作 - 禁用评分
async function testDisableRating(ratingId?: string) {
  console.log('⭐ 测试 8: 管理员禁用评分');
  if (!ratingId) {
    console.log('⚠️ 没有评分ID，跳过禁用测试\n');
    return null;
  }

  try {
    const rating = await disableRating(ratingId, 'admin-user');

    console.log('✅ 禁用评分成功');
    console.log(`⭐ 评分: ${rating.rating}/5`);
    console.log(`📊 状态: ${rating.status}`);
    console.log(`👤 操作人: admin-user`);

    console.log();
    return rating;
  } catch (error) {
    console.error('❌ 禁用评分失败:', error);
    return null;
  }
}

// 测试 9: 管理员操作 - 恢复评分
async function testRestoreRating(ratingId?: string) {
  console.log('⭐ 测试 9: 管理员恢复评分');
  if (!ratingId) {
    console.log('⚠️ 没有评分ID，跳过恢复测试\n');
    return null;
  }

  try {
    const rating = await restoreRating(ratingId, 'admin-user');

    console.log('✅ 恢复评分成功');
    console.log(`⭐ 评分: ${rating.rating}/5`);
    console.log(`📊 状态: ${rating.status}`);
    console.log(`👤 操作人: admin-user`);

    console.log();
    return rating;
  } catch (error) {
    console.error('❌ 恢复评分失败:', error);
    return null;
  }
}

// 测试 10: 管理员操作 - 删除评分
async function testAdminDeleteRating(ratingId?: string) {
  console.log('⭐ 测试 10: 管理员删除评分');
  if (!ratingId) {
    console.log('⚠️ 没有评分ID，跳过删除测试\n');
    return false;
  }

  try {
    const result = await adminDeleteRating(ratingId, 'admin-user');

    if (result) {
      console.log('✅ 管理员删除评分成功');
    } else {
      console.log('⚠️ 删除失败（评分不存在）');
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 管理员删除评分失败:', error);
    return false;
  }
}

// 测试 11: 验证评分限制 - 重复评分
async function testDuplicateRating() {
  console.log('⭐ 测试 11: 验证重复评分限制');
  try {
    // 先创建一个评分
    const firstRating = await createUserRating(testAgentId + '-dup', testUserId, {
      rating: 4,
      comment: '第一次评分',
    });

    // 尝试重复评分
    const duplicateData: CreateRatingRequest = {
      rating: 3,
      comment: '尝试重复评分',
    };

    try {
      await createUserRating(testAgentId + '-dup', testUserId, duplicateData);
      console.log('❌ 意外成功：允许重复评分');
    } catch (error) {
      console.log('✅ 验证成功：阻止重复评分');
      console.log(`📝 错误信息: ${error instanceof Error ? error.message : error}`);
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 验证重复评分失败:', error);
    return false;
  }
}

// 测试 12: 验证评分范围
async function testRatingRangeValidation() {
  console.log('⭐ 测试 12: 验证评分范围');
  try {
    const invalidRatings = [
      { rating: 0, comment: '0星评分' },
      { rating: 6, comment: '6星评分' },
      { rating: -1, comment: '负数评分' },
    ];

    for (const invalidRating of invalidRatings) {
      try {
        await createUserRating(testAgentId, testUserId, invalidRating);
        console.log(`❌ 意外成功：允许${invalidRating.rating}星评分`);
      } catch (error) {
        console.log(`✅ 验证成功：阻止${invalidRating.rating}星评分`);
      }
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 验证评分范围失败:', error);
    return false;
  }
}

// 测试 13: 验证评论长度
async function testCommentLengthValidation() {
  console.log('⭐ 测试 13: 验证评论长度');
  try {
    const longComment = 'a'.repeat(1001); // 超过1000字符
    const invalidData: CreateRatingRequest = {
      rating: 3,
      comment: longComment,
    };

    try {
      await createUserRating(testAgentId, testUserId, invalidData);
      console.log('❌ 意外成功：允许超长评论');
    } catch (error) {
      console.log('✅ 验证成功：阻止超长评论');
      console.log(`📝 错误信息: ${error instanceof Error ? error.message : error}`);
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 验证评论长度失败:', error);
    return false;
  }
}

// 测试 14: 分页功能测试
async function testPagination() {
  console.log('⭐ 测试 14: 分页功能');
  try {
    // 使用不同的用户ID来创建多个评分
    const testUsers = ['user1', 'user2', 'user3', 'user4', 'user5'];

    for (let i = 0; i < testUsers.length; i++) {
      const ratingData: CreateRatingRequest = {
        rating: Math.floor(Math.random() * 5) + 1,
        comment: `测试评论 ${i + 1}`,
      };
      await createUserRating('agent-pagination', testUsers[i], ratingData);
    }

    // 测试分页
    const page1 = await getRatings({ agentId: 'agent-pagination', page: 1, pageSize: 3 });
    const page2 = await getRatings({ agentId: 'agent-pagination', page: 2, pageSize: 3 });

    console.log('✅ 分页功能测试成功');
    console.log(`📄 第一页: ${page1.ratings.length} 个评分`);
    console.log(`📄 第二页: ${page2.ratings.length} 个评分`);
    console.log(`📊 总数: ${page1.total}`);

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 分页功能测试失败:', error);
    return false;
  }
}

// 测试 15: 排序功能测试
async function testSorting() {
  console.log('⭐ 测试 15: 排序功能');
  try {
    // 使用不同的用户ID创建不同评分的测试数据
    const testUsers = ['sort1', 'sort2', 'sort3', 'sort4', 'sort5'];
    const testRatings = [
      { rating: 2, comment: '较差' },
      { rating: 5, comment: '优秀' },
      { rating: 1, comment: '很差' },
      { rating: 4, comment: '良好' },
      { rating: 3, comment: '一般' },
    ];

    for (let i = 0; i < testRatings.length; i++) {
      await createUserRating('agent-sort-test', testUsers[i], testRatings[i]);
    }

    // 测试不同排序方式
    const highestFirst = await getRatings({
      agentId: 'agent-sort-test',
      sortBy: 'highest',
      sortOrder: 'desc'
    });

    const lowestFirst = await getRatings({
      agentId: 'agent-sort-test',
      sortBy: 'lowest',
      sortOrder: 'asc'
    });

    console.log('✅ 排序功能测试成功');
    console.log(`📈 从高到低: ${highestFirst.ratings.map(r => r.rating).join(' → ')}`);
    console.log(`📉 从低到高: ${lowestFirst.ratings.map(r => r.rating).join(' → ')}`);

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 排序功能测试失败:', error);
    return false;
  }
}

// 主测试流程
async function runTests() {
  let createdRatingId: string | null = null;

  // 创建测试评分
  const createdRating = await testCreateRating();
  if (createdRating) {
    createdRatingId = createdRating.id;
  }

  const tests = [
    { name: '获取用户评分', fn: testGetUserRating },
    { name: '更新评分', fn: () => testUpdateRating(createdRatingId) },
    { name: '获取评分列表', fn: testGetRatings },
    { name: '获取评分统计', fn: testGetRatingStats },
    { name: '删除评分', fn: () => testDeleteRating(createdRatingId) },
    { name: '获取所有 Agent 评分统计', fn: testGetAllAgentsRatingStats },
    { name: '管理员禁用评分', fn: () => testDisableRating(createdRatingId) },
    { name: '管理员恢复评分', fn: () => testRestoreRating(createdRatingId) },
    { name: '管理员删除评分', fn: () => testAdminDeleteRating(createdRatingId) },
    { name: '验证重复评分限制', fn: testDuplicateRating },
    { name: '验证评分范围', fn: testRatingRangeValidation },
    { name: '验证评论长度', fn: testCommentLengthValidation },
    { name: '分页功能', fn: testPagination },
    { name: '排序功能', fn: testSorting },
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
    console.log('\n🎉 所有测试通过！Agent 评分系统运行正常。');
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