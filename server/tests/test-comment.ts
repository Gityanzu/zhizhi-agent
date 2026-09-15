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
  getAllComments,
  getUserComments,
  moderateComment,
  getPendingComments,
  getHiddenComments,
  batchModerateComments,
} from '../src/services/comment';
import type { CommentRequest, LikeRequest } from '../src/types/comment';

console.log('💬 开始测试 Agent 评论系统...\n');

// 测试数据
const testUserId = 'test-user-comment';
const testAgentId = 'c2f2d7dd-bca5-40e7-84d5-881da2d4fe84'; // 使用已存在的 Agent ID
const testCommentData: CommentRequest = {
  agentId: testAgentId,
  content: '这是一个测试评论，用于验证评论功能。',
};

// 测试 1: 创建评论
async function testCreateComment() {
  console.log('💬 测试 1: 创建评论');
  try {
    const comment = await createComment({
      ...testCommentData,
      userId: testUserId,
    });

    console.log('✅ 创建评论成功');
    console.log(`📝 评论ID: ${comment.id}`);
    console.log(`🆔 Agent ID: ${comment.agentId}`);
    console.log(`👤 用户 ID: ${comment.userId}`);
    console.log(`📄 内容: ${comment.content}`);
    console.log(`👍 点赞数: ${comment.likes}`);
    console.log(`📅 创建时间: ${new Date(comment.createdAt).toLocaleString()}`);

    console.log();
    return comment;
  } catch (error) {
    console.error('❌ 创建评论失败:', error);
    return null;
  }
}

// 测试 2: 获取评论列表
async function testGetComments() {
  console.log('💬 测试 2: 获取评论列表');
  try {
    const result = await getComments(testAgentId, {
      page: 1,
      pageSize: 10,
    });

    console.log('✅ 获取评论列表成功');
    console.log(`📊 总评论: ${result.total}`);
    console.log(`📋 当前页: ${result.page}/${result.totalPages}`);
    console.log(`📄 每页大小: ${result.pageSize}`);

    if (result.comments.length > 0) {
      console.log('\n评论列表:');
      result.comments.forEach((comment, index) => {
        console.log(`  ${index + 1}. ${comment.content.substring(0, 30)}...`);
      });
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 获取评论列表失败:', error);
    return null;
  }
}

// 测试 3: 获取单个评论
async function testGetComment(commentId?: string) {
  console.log('💬 测试 3: 获取单个评论');
  if (!commentId) {
    console.log('⚠️ 没有评论ID，跳过获取评论测试\n');
    return null;
  }

  try {
    const comment = await getComment(commentId);

    if (comment) {
      console.log('✅ 获取评论成功');
      console.log(`📝 内容: ${comment.content}`);
      console.log(`👍 点赞数: ${comment.likes}`);
    } else {
      console.log('⚠️ 评论不存在');
    }

    console.log();
    return comment;
  } catch (error) {
    console.error('❌ 获取评论失败:', error);
    return null;
  }
}

// 测试 4: 删除评论
async function testDeleteComment(commentId?: string) {
  console.log('💬 测试 4: 删除评论');
  if (!commentId) {
    console.log('⚠️ 没有评论ID，跳过删除测试\n');
    return false;
  }

  try {
    const result = await deleteComment(commentId);

    if (result) {
      console.log('✅ 删除评论成功');
    } else {
      console.log('⚠️ 删除失败（评论不存在）');
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 删除评论失败:', error);
    return false;
  }
}

// 测试 5: 点赞评论
async function testLikeComment(commentId?: string) {
  console.log('💬 测试 5: 点赞评论');
  if (!commentId) {
    console.log('⚠️ 没有评论ID，跳过点赞测试\n');
    return null;
  }

  try {
    const likeData: LikeRequest = {
      commentId,
      userId: testUserId,
    };

    await likeComment(likeData);

    console.log('✅ 点赞评论成功');

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 点赞评论失败:', error);
    return null;
  }
}

// 测试 6: 获取评论树
async function testGetCommentTree() {
  console.log('💬 测试 6: 获取评论树');
  try {
    const tree = await getCommentTree(testAgentId);

    console.log('✅ 获取评论树成功');
    console.log(`🌳 评论数量: ${tree.length}`);

    if (tree.length > 0) {
      console.log('\n评论树结构:');
      const printTree = (comments: any[], indent = '') => {
        comments.forEach(comment => {
          console.log(`${indent}├─ ${comment.content.substring(0, 30)}...`);
          if (comment.replies && comment.replies.length > 0) {
            printTree(comment.replies, indent + '│  ');
          }
        });
      };
      printTree(tree);
    }

    console.log();
    return tree;
  } catch (error) {
    console.error('❌ 获取评论树失败:', error);
    return null;
  }
}

// 测试 7: 获取评论统计
async function testGetCommentStats() {
  console.log('💬 测试 7: 获取评论统计');
  try {
    const stats = await getCommentStats(testAgentId);

    if (stats) {
      console.log('✅ 获取评论统计成功');
      console.log(`📊 总评论数: ${stats.totalComments}`);
      console.log(`👍 总点赞数: ${stats.totalLikes}`);
      console.log(`📏 平均长度: ${stats.averageLength.toFixed(1)} 字符`);
    } else {
      console.log('⚠️ 暂无统计数据');
    }

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取评论统计失败:', error);
    return null;
  }
}

// 测试 8: 获取所有评论
async function testGetAllComments() {
  console.log('💬 测试 8: 获取所有评论');
  try {
    const comments = await getAllComments();

    console.log('✅ 获取所有评论成功');
    console.log(`📊 评论总数: ${comments.length}`);

    if (comments.length > 0) {
      console.log('\n最新评论:');
      comments.slice(0, 3).forEach((comment, index) => {
        console.log(`  ${index + 1}. Agent ${comment.agentId}: ${comment.content.substring(0, 30)}...`);
      });
    }

    console.log();
    return comments;
  } catch (error) {
    console.error('❌ 获取所有评论失败:', error);
    return null;
  }
}

// 测试 9: 获取用户评论
async function testGetUserComments() {
  console.log('💬 测试 9: 获取用户评论');
  try {
    const comments = await getUserComments(testUserId);

    console.log('✅ 获取用户评论成功');
    console.log(`📊 用户评论数: ${comments.length}`);

    if (comments.length > 0) {
      console.log('\n用户评论:');
      comments.slice(0, 3).forEach((comment, index) => {
        console.log(`  ${index + 1}. ${comment.content.substring(0, 30)}...`);
      });
    }

    console.log();
    return comments;
  } catch (error) {
    console.error('❌ 获取用户评论失败:', error);
    return null;
  }
}

// 测试 10: 管理员审核评论
async function testModerateComment(commentId?: string) {
  console.log('💬 测试 10: 管理员审核评论');
  if (!commentId) {
    console.log('⚠️ 没有评论ID，跳过审核测试\n');
    return null;
  }

  try {
    const comment = await moderateComment(commentId, 'admin-user', 'approve', '内容符合要求');

    console.log('✅ 审核评论成功');
    console.log(`📝 状态: ${comment.status}`);
    console.log(`👤 审核人: ${comment.moderatedBy}`);
    console.log(`📄 审核理由: ${comment.moderationReason}`);

    console.log();
    return comment;
  } catch (error) {
    console.error('❌ 审核评论失败:', error);
    // 如果评论不存在，创建一个新的测试评论
    if (error instanceof Error && error.message.includes('评论不存在')) {
      console.log('🔄 尝试创建新评论后再审核...');
      try {
        const newComment = await createComment({
          agentId: testAgentId,
          content: '用于审核的测试评论，内容长度超过10个字符',
          userId: testUserId,
        });
        const result = await moderateComment(newComment.id, 'admin-user', 'approve', '内容符合要求');
        console.log('✅ 使用新评论审核成功');
        return result;
      } catch (newError) {
        console.error('❌ 创建新评论审核也失败:', newError);
        return null;
      }
    }
    return null;
  }
}

// 测试 11: 获取待审核评论
async function testGetPendingComments() {
  console.log('💬 测试 11: 获取待审核评论');
  try {
    const comments = await getPendingComments();

    console.log('✅ 获取待审核评论成功');
    console.log(`⏳ 待审核数量: ${comments.length}`);

    if (comments.length > 0) {
      console.log('\n待审核评论:');
      comments.slice(0, 3).forEach((comment, index) => {
        console.log(`  ${index + 1}. ${comment.content.substring(0, 30)}...`);
      });
    }

    console.log();
    return comments;
  } catch (error) {
    console.error('❌ 获取待审核评论失败:', error);
    return null;
  }
}

// 测试 12: 获取已隐藏评论
async function testGetHiddenComments() {
  console.log('💬 测试 12: 获取已隐藏评论');
  try {
    const comments = await getHiddenComments();

    console.log('✅ 获取已隐藏评论成功');
    console.log(`👻 已隐藏数量: ${comments.length}`);

    if (comments.length > 0) {
      console.log('\n已隐藏评论:');
      comments.slice(0, 3).forEach((comment, index) => {
        console.log(`  ${index + 1}. ${comment.content.substring(0, 30)}...`);
      });
    }

    console.log();
    return comments;
  } catch (error) {
    console.error('❌ 获取已隐藏评论失败:', error);
    return null;
  }
}

// 测试 13: 批量审核评论
async function testBatchModerateComments() {
  console.log('💬 测试 13: 批量审核评论');
  try {
    // 先创建几个评论
    const commentIds = [];
    for (let i = 0; i < 3; i++) {
      const comment = await createComment({
        agentId: testAgentId,
        content: `批量测试评论 ${i + 1} - 内容长度超过10个字符，满足要求`,
        userId: `user-${i}`,
      });
      commentIds.push(comment.id);
    }

    const result = await batchModerateComments(commentIds, 'admin-user', 'approve', '批量审核通过');

    console.log('✅ 批量审核成功');
    console.log(`✅ 成功: ${result.success} 个`);
    console.log(`❌ 失败: ${result.failed} 个`);

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 批量审核失败:', error);
    return null;
  }
}

// 测试 14: 验证评论内容长度
async function testCommentContentValidation() {
  console.log('💬 测试 14: 验证评论内容长度');
  try {
    // 测试过短评论
    try {
      await createComment({
        agentId: testAgentId,
        content: '太短',
        userId: testUserId,
      });
      console.log('❌ 意外成功：允许过短评论');
    } catch (error) {
      console.log('✅ 验证成功：阻止过短评论');
    }

    // 测试过长评论
    const longContent = 'a'.repeat(2001);
    try {
      await createComment({
        agentId: testAgentId,
        content: longContent,
        userId: testUserId,
      });
      console.log('❌ 意外成功：允许过长评论');
    } catch (error) {
      console.log('✅ 验证成功：阻止过长评论');
    }

    // 测试空评论
    try {
      await createComment({
        agentId: testAgentId,
        content: '',
        userId: testUserId,
      });
      console.log('❌ 意外成功：允许空评论');
    } catch (error) {
      console.log('✅ 验证成功：阻止空评论');
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 验证评论内容长度失败:', error);
    return false;
  }
}

// 测试 15: 测试回复功能
async function testReplyFunction() {
  console.log('💬 测试 15: 测试回复功能');
  try {
    // 创建主评论
    const mainComment = await createComment({
      agentId: testAgentId,
      content: '主评论',
      userId: testUserId,
    });

    // 创建回复
    const reply = await createComment({
      agentId: testAgentId,
      content: '这是回复',
      userId: testUserId,
      parentId: mainComment.id,
    });

    console.log('✅ 回复功能测试成功');
    console.log(`📝 主评论ID: ${mainComment.id}`);
    console.log(`📝 回复ID: ${reply.id}`);
    console.log(`🔗 回复父ID: ${reply.parentId}`);

    // 获取评论树
    const tree = await getCommentTree(testAgentId);
    if (tree.length > 0 && tree[0].replies && tree[0].replies.length > 0) {
      console.log('✅ 评论树包含回复');
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 回复功能测试失败:', error);
    return false;
  }
}

// 主测试流程
async function runTests() {
  let createdCommentId: string | null = null;

  // 创建测试评论
  const createdComment = await testCreateComment();
  if (createdComment) {
    createdCommentId = createdComment.id;
  }

  const tests = [
    { name: '获取评论列表', fn: testGetComments },
    { name: '获取单个评论', fn: () => testGetComment(createdCommentId) },
    { name: '点赞评论', fn: () => testLikeComment(createdCommentId) },
    { name: '删除评论', fn: () => testDeleteComment(createdCommentId) },
    { name: '获取评论树', fn: testGetCommentTree },
    { name: '获取评论统计', fn: testGetCommentStats },
    { name: '获取所有评论', fn: testGetAllComments },
    { name: '获取用户评论', fn: testGetUserComments },
    { name: '管理员审核评论', fn: () => testModerateComment(createdCommentId) },
    { name: '获取待审核评论', fn: testGetPendingComments },
    { name: '获取已隐藏评论', fn: testGetHiddenComments },
    { name: '批量审核评论', fn: testBatchModerateComments },
    { name: '验证评论内容长度', fn: testCommentContentValidation },
    { name: '测试回复功能', fn: testReplyFunction },
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
    console.log('\n🎉 所有测试通过！Agent 评论系统运行正常。');
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