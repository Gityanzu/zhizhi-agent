/**
 * Agent 市场功能测试
 */

import {
  exportAgent,
  importAgentFromJson,
  getTemplates,
  getTemplate,
  uploadTemplate,
  downloadTemplate,
  getCategories,
} from '../src/services/agentMarket';
import { initBuiltinTemplates } from '../src/services/agentMarket';

console.log('🧪 开始测试 Agent 市场功能...\n');

// 测试 1: 初始化内置模板
async function testInitTemplates() {
  console.log('📝 测试 1: 初始化内置模板');
  try {
    await initBuiltinTemplates();
    const categories = getCategories();
    console.log('✅ 内置模板初始化成功');
    console.log(`📋 分类列表: ${categories.join(', ')}\n`);
  } catch (error) {
    console.error('❌ 初始化模板失败:', error);
  }
}

// 测试 2: 获取模板列表
async function testGetTemplates() {
  console.log('📝 测试 2: 获取模板列表');
  try {
    const result = await getTemplates(1, 5);
    console.log(`✅ 获取成功，共 ${result.total} 个模板`);
    console.log(`📊 页码: ${result.page}/${result.totalPages}`);
    console.log(`🔍 模板: ${result.templates.map((t) => t.name).join(', ')}\n`);
  } catch (error) {
    console.error('❌ 获取模板列表失败:', error);
  }
}

// 测试 3: 获取分类
async function testGetCategories() {
  console.log('📝 测试 3: 获取分类列表');
  try {
    const categories = getCategories();
    console.log('✅ 获取成功');
    console.log(`📋 分类: ${categories.join(', ')}\n`);
  } catch (error) {
    console.error('❌ 获取分类失败:', error);
  }
}

// 测试 4: 上传新模板
async function testUploadTemplate() {
  console.log('📝 测试 4: 上传新模板');
  try {
    const newTemplate = {
      id: `test-template-${Date.now()}`,
      name: '测试助手',
      avatar: '🧪',
      description: '这是一个测试模板',
      systemPrompt: '你是一个测试助手',
      model: '',
      tools: ['web_search'],
      temperature: 0.7,
      category: '测试',
      tags: ['测试', '示例'],
    };

    const result = await uploadTemplate(newTemplate);
    if (!result) {
      throw new Error('上传结果为空');
    }
    console.log('✅ 上传成功');
    console.log(`📋 模板名称: ${result.name}`);
    console.log(`🎯 分类: ${result.category}\n`);

    return result.id;
  } catch (error) {
    console.error('❌ 上传模板失败:', error);
    return null;
  }
}

// 测试 5: 获取模板详情
async function testGetTemplate(id: string) {
  console.log('📝 测试 5: 获取模板详情');
  try {
    const result = await getTemplate(id);
    if (!result) {
      console.log('⚠️  模板不存在\n');
      return;
    }
    console.log('✅ 获取成功');
    console.log(`📋 模板名称: ${result.name}`);
    console.log(`🔧 工具: ${result.tools.join(', ')}`);
    console.log(`📊 下载次数: ${result.downloadCount}\n`);
  } catch (error) {
    console.error('❌ 获取模板详情失败:', error);
  }
}

// 测试 6: 下载模板
async function testDownloadTemplate(id: string) {
  console.log('📝 测试 6: 下载模板');
  try {
    const result = await downloadTemplate(id);
    console.log('✅ 下载成功');
    console.log(`📦 下载链接: ${result.downloadUrl}`);
    console.log(`⏰ 过期时间: ${new Date(result.expiresAt).toLocaleString()}\n`);
  } catch (error) {
    console.error('❌ 下载模板失败:', error);
  }
}

// 测试 7: 数据验证
async function testDataValidation() {
  console.log('📝 测试 7: 数据验证');
  try {
    const { validateAgentImport } = await import('../src/services/agentMarket');
    const testData = {
      name: '测试助手',
      avatar: '🧪',
      description: '测试描述',
      systemPrompt: '测试提示词',
      model: '',
      tools: ['web_search'],
      temperature: 0.7,
    };

    const result = validateAgentImport(testData);
    console.log('✅ 验证成功');
    console.log(`🔍 有效: ${result.valid}`);
    if (!result.valid) {
      console.log(`⚠️  错误: ${result.errors.join(', ')}\n`);
    }
  } catch (error) {
    console.error('❌ 数据验证失败:', error);
  }
}

// 主测试流程
async function runTests() {
  try {
    await testInitTemplates();
    await testGetCategories();
    await testGetTemplates();

    const templateId = await testUploadTemplate();
    if (templateId) {
      await testGetTemplate(templateId);
      await testDownloadTemplate(templateId);
    }

    await testDataValidation();

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
