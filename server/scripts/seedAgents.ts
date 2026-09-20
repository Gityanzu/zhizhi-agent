/**
 * 种子数据脚本 - 创建测试 Agent
 */

import { getAllAgents, createAgent } from '../src/services/customAgent';
import { v4 as uuidv4 } from 'uuid';

// 测试Agent数据
const testAgents = [
  {
    name: 'AI编程助手',
    avatar: '👨‍💻',
    description: '专业的AI编程助手，帮助你编写和优化代码。支持多种编程语言，提供代码调试、重构建议。',
    category: '编程',
    tags: ['编程', '代码', '调试', 'AI', '常用'],
    systemPrompt: '你是一个专业的AI编程助手，帮助用户编写和优化代码。',
  },
  {
    name: '智能客服',
    avatar: '💁‍♀️',
    description: '7x24小时智能客服，快速解答客户问题，提升客户满意度。',
    category: '客服',
    tags: ['客服', '对话', 'AI', '常用'],
    systemPrompt: '你是一个智能客服，帮助解答客户问题。',
  },
  {
    name: '数据分析专家',
    avatar: '📊',
    description: '专业数据分析助手，帮你处理和分析数据，生成可视化报表。',
    category: '数据分析',
    tags: ['数据', '分析', '可视化', 'Python', 'Excel'],
    systemPrompt: '你是一个数据分析专家，帮助用户分析和可视化数据。',
  },
  {
    name: '翻译官',
    avatar: '🌍',
    description: '支持多语言实时翻译，准确翻译各种语言之间的文本和文档。',
    category: '翻译',
    tags: ['翻译', '语言', '多语言', '常用'],
    systemPrompt: '你是一个专业的翻译官，帮助用户翻译不同语言。',
  },
  {
    name: '创意写作助手',
    avatar: '✍️',
    description: '激发你的创作灵感，帮你写故事、文章、广告文案等。',
    category: '写作',
    tags: ['写作', '创意', '文案', '故事'],
    systemPrompt: '你是一个创意写作助手，帮助用户进行创作。',
  },
  {
    name: '代码审查员',
    avatar: '🔍',
    description: '自动审查代码，发现潜在问题和改进建议，提高代码质量。',
    category: '编程',
    tags: ['编程', '代码', '审查', 'AI', '常用'],
    systemPrompt: '你是一个专业的代码审查员，帮助发现代码问题。',
  },
  {
    name: '周报生成器',
    avatar: '📝',
    description: '快速生成周报，总结工作成果，让汇报更高效。',
    category: '效率工具',
    tags: ['周报', '总结', '效率', '文档'],
    systemPrompt: '你是一个周报生成器，帮助用户快速生成工作周报。',
  },
  {
    name: '法律顾问',
    avatar: '⚖️',
    description: '提供法律咨询和合同审查服务，保障业务合规性。',
    category: '法律',
    tags: ['法律', '合同', '咨询'],
    systemPrompt: '你是一个法律顾问，帮助用户处理法律事务。',
  },
];

async function seedAgents() {
  console.log('开始创建测试Agent...\n');

  // 检查是否已有Agent
  const existingAgents = await getAllAgents();
  console.log(`当前已有 ${existingAgents.length} 个Agent\n`);

  // 创建测试Agent
  let createdCount = 0;
  for (const agentData of testAgents) {
    try {
      const agent = await createAgent(agentData);
      console.log(`✅ 创建成功: ${agent.name} (${agent.id})`);
      createdCount++;
    } catch (error) {
      console.error(`❌ 创建失败: ${agentData.name}`, error);
    }
  }

  console.log(`\n共创建 ${createdCount} 个测试Agent`);
  console.log('\n🎉 种子数据创建完成！');
}

seedAgents()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('种子数据创建失败:', error);
    process.exit(1);
  });
