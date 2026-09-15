/**
 * Agent 评论系统测试
 */

import {
  createComment,
  getComments,
  getComment,
  deleteComment,
  likeComment,
  getCommentTree,
  getCommentStats,
  getUserComments,
  getAllComments,
} from '../src/services/comment';
import { createAgent } from '../src/services/customAgent';

console.log('🧪 开始测试 Agent 评论系统...\n');

// 测试数据
const testUserId = 'test-user-001';
let testAgentId: string | null = null;

// 创建测试 Agent
async function createTestAgent(): Promise<string> {
  console.log('📝 创建测试 Agent');
  try {
    const testAgent = await createAgent({
      name: '测试评论 Agent',
      avatar: '💬',
      description: '用于测试评论系统的 Agent',
      systemPrompt: '你是一个测试 Agent',
      model: '',
      tools: ['web_search'],
      temperature: 0.7,
    });

    console.log(`✅ 测试 Agent 创建成功: ${testAgent.name} (ID: ${testAgent.id})\n`);
    return testAgent.id;
  } catch (error) {
    console.error('❌ 创建测试 Agent 失败:', error);
    throw error;
  }
}

// 测试 1: 创建评论
async function testCreateComment() {
  console.log('📝 测试 1: 创建评论');
  if (!testAgentId) {
    throw new Error('测试 Agent ID 未设置');
  }
  try {
    const comment = await createComment({
      agentId: testAgentId,
      content: '这是一个非常有用的 Agent！',
      userId: testUserId,
    });

    console.log('✅ 评论创建成功');
    console.log(`📝 内容: ${comment.content}`);
    console.log(`👤 用户: ${comment.userId}`);
    console.log(`📅 时间: ${new Date(comment.createdAt).toLocaleString()}\n`);

    return comment.id;
  } catch (error) {
    console.error('❌ 创建评论失败:', error);
    return null;
  }
}

// 测试 2: 创建回复评论
async function testCreateReplyComment(parentCommentId: string) {
  console.log('📝 测试 2: 创建回复评论');
  if (!testAgentId) {
    throw new Error('测试 Agent ID 未设置');
  }
  try {
    const comment = await createComment({
      agentId: testAgentId,
      content: '我完全同意你的看法！这个功能确实很实用。',
      userId: 'test-user-002',
      parentId: parentCommentId,
    });

    console.log('✅ 回复评论创建成功');
    console.log(`📝 内容: ${comment.content}`);
    console.log(`👤 用户: ${comment.userId}`);
    console.log(`⬆️  回复: ${comment.parentId}\n`);

    return comment.id;
  } catch (error) {
    console.error('❌ 创建回复评论失败:', error);
    return null;
  }
}

// 测试 3: 获取评论列表
async function testGetComments() {
  console.log('📝 测试 3: 获取评论列表');
  if (!testAgentId) {
    throw new Error('测试 Agent ID 未设置');
  }
  try {
    const comments = await getComments(testAgentId, 1, 10);

    console.log('✅ 获取评论列表成功');
    console.log(`📊 总评论: ${comments.total}`);
    console.log(`📋 页码: ${comments.page}/${comments.totalPages}`);

    if (comments.comments && comments.comments.length > 0) {
      comments.comments.forEach((c, index) => {
        console.log(`\n评论 ${index + 1}:`);
        console.log(`  📝 内容: ${c.content}`);
        console.log(`  👤 用户: ${c.userId}`);
        console.log(`  👍 点赞: ${c.likes}`);
        if (c.parentId) {
          console.log(`  ⬆️  回复: ${c.parentId}`);
        }
      });
    }

    console.log();
  } catch (error) {
    console.error('❌ 获取评论列表失败:', error);
  }
}

// 测试 4: 获取评论详情
async function testGetCommentDetail(commentId: string) {
  console.log('📝 测试 4: 获取评论详情');
  if (!testAgentId) {
    throw new Error('测试 Agent ID 未设置');
  }
  try {
    const comment = await getComment(commentId);

    if (!comment) {
      console.log('⚠️  评论不存在\n');
      return;
    }

    console.log('✅ 获取评论详情成功');
    console.log(`📝 内容: ${comment.content}`);
    console.log(`👤 用户: ${comment.userId}`);
    console.log(`👍 点赞: ${comment.likes}`);
    console.log(`📅 时间: ${new Date(comment.createdAt).toLocaleString()}\n`);
  } catch (error) {
    console.error('❌ 获取评论详情失败:', error);
  }
}

// 测试 5: 获取评论树
async function testGetCommentTree() {
  console.log('📝 测试 5: 获取评论树');
  if (!testAgentId) {
    throw new Error('测试 Agent ID 未设置');
  }
  try {
    const commentTree = await getCommentTree(testAgentId);

    console.log('✅ 获取评论树成功');
    console.log(`📊 评论层级: ${commentTree.length} 个主评论`);

    commentTree.forEach((comment, index) => {
      console.log(`\n主评论 ${index + 1}:`);
      console.log(`  📝 内容: ${comment.content}`);
      console.log(`  👤 用户: ${comment.userId}`);
      console.log(`  👍 点赞: ${comment.likes}`);

      if (comment.replies && comment.replies.length > 0) {
        comment.replies.forEach((reply, replyIndex) => {
          console.log(`    回复 ${replyIndex + 1}:`);
          console.log(`      📝 内容: ${reply.content}`);
          console.log(`      👤 用户: ${reply.userId}`);
        });
      }
    });

    console.log();
  } catch (error) {
    console.error('❌ 获取评论树失败:', error);
  }
}

// 测试 6: 点赞评论
async function testLikeComment() {
  console.log('📝 测试 6: 点赞评论');
  try {
    await likeComment({
      commentId: testCommentId!,
      userId: 'test-user-003',
    });

    console.log('✅ 点赞成功\n');
  } catch (error) {
    console.error('❌ 点赞失败:', error);
  }
}

// 测试 7: 获取评论统计
async function testGetCommentStats() {
  console.log('📝 测试 7: 获取评论统计');
  try {
    const stats = await getCommentStats(testAgentId);

    if (!stats) {
      console.log('⚠️  暂无评论统计\n');
      return;
    }

    console.log('✅ 获取统计成功');
    console.log(`📊 总评论: ${stats.totalComments}`);
    console.log(`👍 总点赞: ${stats.totalLikes}`);
    console.log(`📏 平均长度: ${stats.averageLength} 字符\n`);
  } catch (error) {
    console.error('❌ 获取评论统计失败:', error);
  }
}

// 测试 8: 获取用户评论
async function testGetUserComments() {
  console.log('📝 测试 8: 获取用户评论');
  try {
    const userComments = await getUserComments(testUserId);

    console.log('✅ 获取用户评论成功');
    console.log(`📊 用户 ${testUserId} 的评论数: ${userComments.length}\n`);
  } catch (error) {
    console.error('❌ 获取用户评论失败:', error);
  }
}

// 测试 9: 获取所有评论（管理员）
async function testGetAllComments() {
  console.log('📝 测试 9: 获取所有评论');
  try {
    const allComments = await getAllComments();

    console.log('✅ 获取所有评论成功');
    console.log(`📊 总评论数: ${allComments.length}\n`);
  } catch (error) {
    console.error('❌ 获取所有评论失败:', error);
  }
}

// 测试 10: 删除评论
async function testDeleteComment(commentId: string) {
  console.log('📝 测试 10: 删除评论');
  try {
    const result = await deleteComment(commentId);

    if (result) {
      console.log('✅ 删除成功\n');
    } else {
      console.log('⚠️  删除失败（评论不存在）\n');
    }
  } catch (error) {
    console.error('❌ 删除评论失败:', error);
  }
}

// 主测试流程
let testCommentId: string | null = null;

async function runTests() {
  try {
    // 创建测试 Agent
    testAgentId = await createTestAgent();

    // 测试主评论
    testCommentId = await testCreateComment();
    if (!testCommentId) {
      console.log('⚠️  主评论创建失败，跳过相关测试\n');
      return;
    }

    // 测试回复评论
    const replyCommentId = await testCreateReplyComment(testCommentId);
    if (replyCommentId) {
      await testCreateReplyComment(testCommentId);
    }

    // 获取各种信息
    await testGetComments();
    await testGetCommentDetail(testCommentId);
    await testGetCommentTree();
    await testGetCommentStats();
    await testGetUserComments();
    await testGetAllComments();

    // 测试点赞
    await testLikeComment();

    // 删除测试
    await testDeleteComment(testCommentId);

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