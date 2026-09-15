/**
 * Agent 评分系统测试
 */

import {
  createRating,
  getRatingStats,
  getRatingHistory,
  getRating,
  deleteRating,
  getUserRating,
  getAllRatings,
} from '../src/services/rating';
import { initBuiltinTemplates } from '../src/services/agentMarket';
import { createAgent } from '../src/services/customAgent';

console.log('🧪 开始测试 Agent 评分系统...\n');

// 测试数据
const testUserId = 'test-user-001';
let testAgentId: string | null = null;

// 测试 1: 初始化模板
async function testInitTemplates() {
  console.log('📝 测试 1: 初始化模板');
  try {
    await initBuiltinTemplates();
    console.log('✅ 模板初始化成功\n');
  } catch (error) {
    console.error('❌ 初始化模板失败:', error);
  }
}

// 创建测试 Agent
async function createTestAgent(): Promise<string> {
  console.log('📝 创建测试 Agent');
  try {
    const testAgent = await createAgent({
      name: '测试评分 Agent',
      avatar: '⭐',
      description: '用于测试评分系统的 Agent',
      systemPrompt: '你是一个测试 Agent',
      model: '',
      tools: ['web_search'],
      temperature: 0.7,
    } as any);

    testAgentId = testAgent.id; // 保存 Agent ID

    console.log(`✅ 测试 Agent 创建成功: ${testAgent.name} (ID: ${testAgent.id})\n`);
    return testAgent.id;
  } catch (error) {
    console.error('❌ 创建测试 Agent 失败:', error);
    throw error;
  }
}

// 测试 2: 创建评分
async function testCreateRating(agentId: string) {
  console.log('📝 测试 2: 创建评分');
  try {
    const rating = await createRating({
      agentId: agentId,
      userId: testUserId,
      rating: 5,
      comment: '这是一个非常棒的 Agent！',
    });

    console.log('✅ 评分创建成功');
    console.log(`⭐ 评分: ${rating.rating}`);
    console.log(`📝 评论: ${rating.comment}`);
    console.log(`👤 用户: ${rating.userId}`);
    console.log(`📅 时间: ${new Date(rating.createdAt).toLocaleString()}\n`);

    return rating.id;
  } catch (error) {
    console.error('❌ 创建评分失败:', error);
    return null;
  }
}

// 测试 3: 获取评分统计
async function testGetRatingStats() {
  if (!testAgentId) {
    console.log('⚠️  测试 Agent ID 未设置\n');
    return;
  }

  console.log('📝 测试 3: 获取评分统计');
  try {
    const stats = await getRatingStats(testAgentId);

    if (!stats) {
      console.log('⚠️  暂无评分统计\n');
      return;
    }

    console.log('✅ 获取统计成功');
    console.log(`📊 平均分: ${stats.averageRating}`);
    console.log(`📈 总评分数: ${stats.totalRatings}`);
    console.log(`⭐ 5星: ${stats.fiveStarPercent.toFixed(1)}%`);
    console.log(`⭐ 4星: ${stats.fourStarPercent.toFixed(1)}%`);
    console.log(`⭐ 3星: ${stats.threeStarPercent.toFixed(1)}%`);
    console.log(`⭐ 2星: ${stats.twoStarPercent.toFixed(1)}%`);
    console.log(`⭐ 1星: ${stats.oneStarPercent.toFixed(1)}%\n`);
  } catch (error) {
    console.error('❌ 获取评分统计失败:', error);
  }
}

// 测试 4: 获取评分历史
async function testGetRatingHistory() {
  if (!testAgentId) {
    console.log('⚠️  测试 Agent ID 未设置\n');
    return;
  }

  console.log('📝 测试 4: 获取评分历史');
  try {
    const history = await getRatingHistory(testAgentId, 1, 10);

    console.log('✅ 获取评分历史成功');
    console.log(`📊 总记录: ${history.total}`);
    console.log(`📋 页码: ${history.page}/${history.totalPages}`);

    if (history.rating && history.rating.length > 0) {
      history.rating.forEach((r, index) => {
        console.log(`\n记录 ${index + 1}:`);
        console.log(`  ⭐ 评分: ${r.rating} 星`);
        console.log(`  📝 评论: ${r.comment || '无'}`);
        console.log(`  👤 用户: ${r.userId}`);
        console.log(`  📅 时间: ${new Date(r.createdAt).toLocaleString()}`);
      });
    }

    console.log();
  } catch (error) {
    console.error('❌ 获取评分历史失败:', error);
  }
}

// 测试 5: 获取用户评分（防止重复评分）
async function testGetUserRating() {
  if (!testAgentId) {
    console.log('⚠️  测试 Agent ID 未设置\n');
    return;
  }

  console.log('📝 测试 5: 获取用户评分');
  try {
    const userRating = await getUserRating(testAgentId, testUserId);

    if (userRating) {
      console.log('✅ 用户已有评分');
      console.log(`⭐ 评分: ${userRating.rating}`);
      console.log(`📝 评论: ${userRating.comment || '无'}`);
    } else {
      console.log('✅ 用户暂无评分\n');
    }
  } catch (error) {
    console.error('❌ 获取用户评分失败:', error);
  }
}

// 测试 6: 获取评分详情
async function testGetRatingDetail(ratingId: string) {
  console.log('📝 测试 6: 获取评分详情');
  try {
    const rating = await getRating(ratingId);

    if (!rating) {
      console.log('⚠️  评分不存在\n');
      return;
    }

    console.log('✅ 获取评分详情成功');
    console.log(`⭐ 评分: ${rating.rating}`);
    console.log(`📝 评论: ${rating.comment || '无'}`);
    console.log(`👤 用户: ${rating.userId}`);
    console.log(`📅 创建时间: ${new Date(rating.createdAt).toLocaleString()}\n`);
  } catch (error) {
    console.error('❌ 获取评分详情失败:', error);
  }
}

// 测试 7: 多个评分
async function testMultipleRatings() {
  if (!testAgentId) {
    console.log('⚠️  测试 Agent ID 未设置\n');
    return;
  }

  console.log('📝 测试 7: 创建多个评分');
  try {
    const users = ['user-002', 'user-003', 'user-004', 'user-005'];
    const ratings = [4, 3, 5, 2];

    for (let i = 0; i < users.length; i++) {
      await createRating({
        agentId: testAgentId,
        userId: users[i],
        rating: ratings[i],
        comment: `第 ${i + 1} 个用户的评价`,
      });
      console.log(`✅ 已为 ${users[i]} 创建 ${ratings[i]} 星评分`);
    }
    console.log();
  } catch (error) {
    console.error('❌ 创建多个评分失败:', error);
  }
}

// 测试 8: 获取更新后的统计
async function testUpdatedStats() {
  if (!testAgentId) {
    console.log('⚠️  测试 Agent ID 未设置\n');
    return;
  }

  console.log('📝 测试 8: 获取更新后的统计');
  try {
    const stats = await getRatingStats(testAgentId);

    if (!stats) {
      console.log('⚠️  暂无评分统计\n');
      return;
    }

    console.log('✅ 获取更新后统计成功');
    console.log(`📊 平均分: ${stats.averageRating}`);
    console.log(`📈 总评分数: ${stats.totalRatings}`);
    console.log(`⭐ 5星: ${stats.fiveStarPercent.toFixed(1)}%`);
    console.log(`⭐ 4星: ${stats.fourStarPercent.toFixed(1)}%`);
    console.log(`⭐ 3星: ${stats.threeStarPercent.toFixed(1)}%`);
    console.log(`⭐ 2星: ${stats.twoStarPercent.toFixed(1)}%`);
    console.log(`⭐ 1星: ${stats.oneStarPercent.toFixed(1)}%\n`);
  } catch (error) {
    console.error('❌ 获取更新后统计失败:', error);
  }
}

// 主测试流程
async function runTests() {
  try {
    await testInitTemplates();

    // 创建测试 Agent
    const testAgentId = await createTestAgent();

    const ratingId = await testCreateRating(testAgentId);
    if (ratingId) {
      await testGetUserRating();
      await testGetRatingStats();
      await testGetRatingHistory();
      await testGetRatingDetail(ratingId);
      await testMultipleRatings();
      await testUpdatedStats();
    }

    console.log('✅ 所有测试完成！');
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
runTests().catch((error) => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
