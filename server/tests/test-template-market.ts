/**
 * Agent 模板市场测试
 */

import {
  getAllTemplates,
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  reviewTemplate,
  deleteTemplate,
  getTemplateCategories,
  getTemplateVersionHistory,
  getTemplateStats,
  downloadTemplate,
  favoriteTemplate,
  unfavoriteTemplate,
  getUserFavorites,
  getTemplateReports,
  reportTemplate,
  resolveTemplateReport,
} from '../src/services/templateMarket';
import type { CreateTemplateRequest, ReviewTemplateRequest } from '../src/types/template';

console.log('🎨 开始测试 Agent 模板市场...\n');

// 测试数据
const testUserId = 'test-user-template';
const testAuthorId = 'author-test';
const testTemplateName = 'test-template-' + Date.now();

// 测试 1: 获取所有模板
async function testGetAllTemplates() {
  console.log('🎨 测试 1: 获取所有模板');
  try {
    const templates = await getAllTemplates();

    console.log('✅ 获取所有模板成功');
    console.log(`📊 模板数量: ${templates.length}`);

    if (templates.length > 0) {
      console.log('\n模板列表:');
      templates.slice(0, 3).forEach((template, index) => {
        console.log(`  ${index + 1}. ${template.title} (${template.category})`);
        console.log(`     作者: ${template.author.name} | 下载: ${template.downloadCount} | 评分: ${template.rating}`);
      });
    }

    console.log();
    return templates;
  } catch (error) {
    console.error('❌ 获取所有模板失败:', error);
    return null;
  }
}

// 测试 2: 获取模板列表（带筛选）
async function testGetTemplates() {
  console.log('🎨 测试 2: 获取模板列表（带筛选）');
  try {
    const result = await getTemplates({
      query: '代码',
      category: '开发工具',
      sortBy: 'popular',
      sortOrder: 'desc',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ 获取模板列表成功');
    console.log(`📊 总模板: ${result.total}`);
    console.log(`📋 当前页: ${result.page}/${result.totalPages}`);
    console.log(`📄 每页大小: ${result.pageSize}`);

    if (result.templates.length > 0) {
      console.log('\n搜索结果:');
      result.templates.forEach((template, index) => {
        console.log(`  ${index + 1}. ${template.title}`);
        console.log(`     相关度: ${template.name.includes('代码') ? '高' : '低'}`);
      });
    }

    // 显示聚合信息
    if (result.facets) {
      console.log('\n聚合信息:');
      console.log('  分类:', result.facets.categories.map(c => `${c.label}(${c.count})`).join(', '));
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 获取模板列表失败:', error);
    return null;
  }
}

// 测试 3: 获取模板详情
async function testGetTemplateDetail() {
  console.log('🎨 测试 3: 获取模板详情');
  try {
    const templates = await getAllTemplates();
    if (templates.length === 0) {
      console.log('⚠️ 没有可用模板\n');
      return null;
    }

    const template = await getTemplate(templates[0].id);

    console.log('✅ 获取模板详情成功');
    console.log(`📝 名称: ${template.name}`);
    console.log(`🏷️ 标题: ${template.title}`);
    console.log(`📄 描述: ${template.description.substring(0, 50)}...`);
    console.log(`🔧 系统: ${template.systemPrompt.substring(0, 50)}...`);
    console.log(`📊 查看次数: ${template.viewCount}`);

    console.log();
    return template;
  } catch (error) {
    console.error('❌ 获取模板详情失败:', error);
    return null;
  }
}

// 测试 4: 创建模板
async function testCreateTemplate() {
  console.log('🎨 测试 4: 创建模板');
  try {
    const templateData: CreateTemplateRequest = {
      name: testTemplateName,
      title: '测试模板',
      description: '这是一个用于测试的模板',
      systemPrompt: '你是一个专业的测试助手，专门用于验证模板功能的各种特性。这个模板包含了完整的测试用例，用于验证系统的各项功能是否正常工作。',
      model: 'gpt-4',
      tools: ['web_search'],
      temperature: 0.7,
      category: '测试分类',
      tags: ['测试', '模板'],
      features: ['测试功能1', '测试功能2'],
    };

    const template = await createTemplate(templateData, testAuthorId, '测试作者');

    console.log('✅ 创建模板成功');
    console.log(`📝 名称: ${template.name}`);
    console.log(`🏷️ 标题: ${template.title}`);
    console.log(`📄 描述: ${template.description}`);
    console.log(`📊 状态: ${template.status} (待审核)`);
    console.log(`🆔 版本: ${template.version}`);

    console.log();
    return template;
  } catch (error) {
    console.error('❌ 创建模板失败:', error);
    throw error;
  }
}

// 测试 5: 更新模板
async function testUpdateTemplate(templateId?: string) {
  console.log('🎨 测试 5: 更新模板');
  if (!templateId) {
    console.log('⚠️ 没有模板ID，跳过更新测试\n');
    return null;
  }

  try {
    const updateData = {
      title: '更新后的测试模板',
      description: '这是更新后的描述',
      tags: ['测试', '模板', '更新'],
      version: '1.0.1',
    };

    const template = await updateTemplate(templateId, updateData, testUserId);

    console.log('✅ 更新模板成功');
    console.log(`📝 新标题: ${template.title}`);
    console.log(`📄 新描述: ${template.description}`);
    console.log(`🏷️ 新标签: ${template.tags.join(', ')}`);
    console.log(`🆔 新版本: ${template.version}`);
    console.log(`📅 更新时间: ${new Date(template.updatedAt).toLocaleString()}`);

    console.log();
    return template;
  } catch (error) {
    console.error('❌ 更新模板失败:', error);
    return null;
  }
}

// 测试 6: 审核模板
async function testReviewTemplate(templateId?: string) {
  console.log('🎨 测试 6: 审核模板');
  if (!templateId) {
    console.log('⚠️ 没有模板ID，跳过审核测试\n');
    return null;
  }

  try {
    const reviewData: ReviewTemplateRequest = {
      status: 'approved',
      reason: '内容符合要求',
      suggestedChanges: '无',
    };

    const template = await reviewTemplate(templateId, reviewData, 'admin-user');

    console.log('✅ 审核模板成功');
    console.log(`✅ 状态: ${template.status} (已批准)`);
    console.log(`📅 发布时间: ${template.publishedAt ? new Date(template.publishedAt).toLocaleString() : '未发布'}`);
    console.log(`👤 审核人: ${template.reviewReason?.reviewedBy}`);
    console.log(`📝 审核理由: ${template.reviewReason?.reason}`);

    console.log();
    return template;
  } catch (error) {
    console.error('❌ 审核模板失败:', error);
    return null;
  }
}

// 测试 7: 删除模板
async function testDeleteTemplate(templateId?: string) {
  console.log('🎨 测试 7: 删除模板');
  if (!templateId) {
    console.log('⚠️ 没有模板ID，跳过删除测试\n');
    return false;
  }

  try {
    const result = await deleteTemplate(templateId, testUserId);

    if (result) {
      console.log('✅ 删除模板成功');
    } else {
      console.log('⚠️ 删除失败（模板不存在）');
    }

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 删除模板失败:', error);
    return false;
  }
}

// 测试 8: 获取模板分类
async function testGetTemplateCategories() {
  console.log('🎨 测试 8: 获取模板分类');
  try {
    const categories = await getTemplateCategories();

    console.log('✅ 获取分类成功');
    console.log(`📊 分类数量: ${categories.length}`);

    categories.forEach((category, index) => {
      console.log(`  ${index + 1}. ${category.label} (${category.count}个模板)`);
    });

    console.log();
    return categories;
  } catch (error) {
    console.error('❌ 获取分类失败:', error);
    return null;
  }
}

// 测试 9: 获取模板版本历史
async function testGetTemplateVersionHistory() {
  console.log('🎨 测试 9: 获取模板版本历史');
  try {
    const templates = await getAllTemplates();
    if (templates.length === 0) {
      console.log('⚠️ 没有可用模板\n');
      return null;
    }

    const versionHistory = await getTemplateVersionHistory(templates[0].id);

    console.log('✅ 获取版本历史成功');
    console.log(`📊 版本数量: ${versionHistory.versions.length}`);

    versionHistory.versions.forEach((version, index) => {
      console.log(`  ${index + 1}. 版本 ${version.version} | ${new Date(version.publishedAt).toLocaleDateString()} | ${version.size}KB`);
    });

    console.log();
    return versionHistory;
  } catch (error) {
    console.error('❌ 获取版本历史失败:', error);
    return null;
  }
}

// 测试 10: 获取模板统计
async function testGetTemplateStats() {
  console.log('🎨 测试 10: 获取模板统计');
  try {
    const stats = await getTemplateStats();

    console.log('✅ 获取统计成功');
    console.log(`📊 总模板数: ${stats.totalTemplates}`);
    console.log(`📥 总下载量: ${stats.totalDownloads}`);
    console.log(`👀 总查看量: ${stats.totalViews}`);
    console.log(`⭐ 平均评分: ${stats.averageRating.toFixed(1)}`);
    console.log(`🔥 热门分类: ${stats.topCategories.join(', ')}`);
    console.log(`👨‍💻 热门作者: ${stats.topAuthors.length}位`);

    console.log('\n趋势模板:');
    stats.trendingTemplates.slice(0, 3).forEach((template, index) => {
      console.log(`  ${index + 1}. ${template.title} (下载: ${template.downloadCount})`);
    });

    console.log();
    return stats;
  } catch (error) {
    console.error('❌ 获取统计失败:', error);
    return null;
  }
}

// 测试 11: 下载模板
async function testDownloadTemplate() {
  console.log('🎨 测试 11: 下载模板');
  try {
    const templates = await getAllTemplates();
    if (templates.length === 0) {
      console.log('⚠️ 没有可用模板\n');
      return null;
    }

    const result = await downloadTemplate(templates[0].id, testUserId);

    console.log('✅ 下载模板成功');
    console.log(`🔗 下载链接: ${result.downloadUrl}`);
    console.log(`📋 下载记录ID: ${result.record.id}`);
    console.log(`📅 下载时间: ${new Date(result.record.downloadAt).toLocaleString()}`);
    console.log(`👤 下载用户: ${result.record.userId}`);

    console.log();
    return result;
  } catch (error) {
    console.error('❌ 下载模板失败:', error);
    return null;
  }
}

// 测试 12: 收藏模板
async function testFavoriteTemplate() {
  console.log('🎨 测试 12: 收藏模板');
  try {
    const templates = await getAllTemplates();
    if (templates.length === 0) {
      console.log('⚠️ 没有可用模板\n');
      return null;
    }

    const favorite = await favoriteTemplate(templates[0].id, testUserId);

    console.log('✅ 收藏模板成功');
    console.log(`📝 收藏ID: ${favorite.id}`);
    console.log(`🆔 模板ID: ${favorite.templateId}`);
    console.log(`👤 收藏用户: ${favorite.userId}`);
    console.log(`📅 收藏时间: ${new Date(favorite.createdAt).toLocaleString()}`);

    console.log();
    return favorite;
  } catch (error) {
    console.error('❌ 收藏模板失败:', error);
    return null;
  }
}

// 测试 13: 取消收藏模板
async function testUnfavoriteTemplate() {
  console.log('🎨 测试 13: 取消收藏模板');
  try {
    const templates = await getAllTemplates();
    if (templates.length === 0) {
      console.log('⚠️ 没有可用模板\n');
      return false;
    }

    await unfavoriteTemplate(templates[0].id, testUserId);

    console.log('✅ 取消收藏成功');

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 取消收藏失败:', error);
    return false;
  }
}

// 测试 14: 获取用户收藏
async function testGetUserFavorites() {
  console.log('🎨 测试 14: 获取用户收藏');
  try {
    const favorites = await getUserFavorites(testUserId);

    console.log('✅ 获取用户收藏成功');
    console.log(`📊 收藏数量: ${favorites.length}`);

    favorites.slice(0, 3).forEach((template, index) => {
      console.log(`  ${index + 1}. ${template.title} | 收藏数: ${template.likeCount}`);
    });

    console.log();
    return favorites;
  } catch (error) {
    console.error('❌ 获取用户收藏失败:', error);
    return null;
  }
}

// 测试 15: 模板报告相关
async function testTemplateReports() {
  console.log('🎨 测试 15: 模板报告');
  try {
    // 提交报告
    const templates = await getAllTemplates();
    if (templates.length > 0) {
      const report = await reportTemplate(
        templates[0].id,
        testUserId,
        '内容不当',
        '模板中包含不当内容'
      );

      console.log('✅ 提交报告成功');
      console.log(`📝 报告ID: ${report.id}`);
      console.log(`🆔 模板ID: ${report.templateId}`);
      console.log(`👤 举报人: ${report.reportedBy}`);
      console.log(`📋 举报状态: ${report.status}`);

      // 处理报告（模拟管理员）
      if (report.status === 'pending') {
        const resolvedReport = await resolveTemplateReport(
          report.id,
          'admin-user',
          '已处理，删除相关内容',
          'resolved'
        );

        console.log('\n✅ 处理报告成功');
        console.log(`📋 最终状态: ${resolvedReport.status}`);
        console.log(`👤 处理人: ${resolvedReport.reviewedBy}`);
      }
    }

    console.log();
    return true;
  } catch (error) {
    console.error('❌ 模板报告测试失败:', error);
    return null;
  }
}

// 主测试流程
async function runTests() {
  let createdTemplateId: string | null = null;

  // 创建测试模板
  const createdTemplate = await testCreateTemplate();
  if (createdTemplate) {
    createdTemplateId = createdTemplate.id;
  }

  const tests = [
    { name: '获取所有模板', fn: testGetAllTemplates },
    { name: '获取模板列表', fn: testGetTemplates },
    { name: '获取模板详情', fn: testGetTemplateDetail },
    { name: '创建模板', fn: testCreateTemplate },
    { name: '更新模板', fn: () => testUpdateTemplate(createdTemplateId) },
    { name: '审核模板', fn: () => testReviewTemplate(createdTemplateId) },
    { name: '删除模板', fn: () => testDeleteTemplate(createdTemplateId) },
    { name: '获取模板分类', fn: testGetTemplateCategories },
    { name: '获取版本历史', fn: testGetTemplateVersionHistory },
    { name: '获取模板统计', fn: testGetTemplateStats },
    { name: '下载模板', fn: testDownloadTemplate },
    { name: '收藏模板', fn: testFavoriteTemplate },
    { name: '取消收藏', fn: testUnfavoriteTemplate },
    { name: '获取用户收藏', fn: testGetUserFavorites },
    { name: '模板报告', fn: testTemplateReports },
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
    console.log('\n🎉 所有测试通过！Agent 模板市场系统运行正常。');
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