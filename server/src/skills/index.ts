/**
 * Skill 技能系统
 * 
 * 每个 Skill 是一个可复用的专业能力包，包含：
 * - 名称和描述
 * - 触发关键词（用于自动匹配）
 * - 系统提示词（定义角色和行为）
 * - 可用工具列表（限制该Skill能使用的工具）
 * - 示例对话
 */

import { getLLM } from '../services/llm';
import { tools, executeTool } from '../services/agent';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';

// ==================== Skill 定义 ====================

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  triggerKeywords: string[]; // 触发关键词，用于自动匹配
  systemPrompt: string; // 该Skill的系统提示词
  allowedTools: string[]; // 允许使用的工具列表（空表示全部可用）
  examples: Array<{ input: string; output: string }>; // 示例
}

// ==================== 内置 Skill 列表 ====================

export const BUILTIN_SKILLS: SkillDefinition[] = [
  // 编程助手
  {
    id: 'coding',
    name: '编程助手',
    description: '专业的代码编写、调试、优化和审查助手，支持多种编程语言',
    icon: '💻',
    triggerKeywords: ['代码', '编程', '程序', '函数', 'bug', '调试', '优化', 'python', 'javascript', 'java', '前端', '后端', '算法', '写个', '实现'],
    systemPrompt: `你是一个资深全栈开发工程师（编程助手 Skill）。

你的专长：
1. 编写高质量、可维护的代码
2. 调试和修复 bug
3. 代码性能优化
4. 代码审查和最佳实践建议
5. 解释代码逻辑和架构设计

工作原则：
- 先理解需求，再给出方案
- 代码要有注释，关键逻辑要解释
- 优先使用最佳实践和设计模式
- 考虑边界情况和错误处理
- 给出代码后说明使用方法

可用工具：创建文件、读取文件、写入文件、追加文件、列出文件、数学计算、运行命令

请用中文回答，代码部分用对应语言的语法。`,
    allowedTools: ['create_file', 'read_file', 'write_file', 'append_file', 'list_files', 'search_files', 'calculate', 'run_shell'],
    examples: [
      { input: '用Python写一个快速排序', output: '好的，这是Python实现的快速排序...' },
      { input: '帮我看看这段代码有什么问题', output: '我来分析一下这段代码...' },
    ],
  },

  // 文档写作
  {
    id: 'writing',
    name: '文档写作',
    description: '专业的文档撰写、润色、摘要和翻译助手',
    icon: '✍️',
    triggerKeywords: ['写', '文档', '报告', '文章', '总结', '摘要', '润色', '翻译', '邮件', '方案', '策划', '文案'],
    systemPrompt: `你是一个专业的技术文档写作专家（文档写作 Skill）。

你的专长：
1. 撰写各类技术文档（README、API文档、设计文档）
2. 撰写商务文档（报告、方案、邮件、策划案）
3. 文本润色和优化
4. 长文本摘要和要点提炼
5. 中英文翻译

写作原则：
- 结构清晰，逻辑连贯
- 语言专业、准确、简洁
- 根据读者调整深度和风格
- 技术文档要准确，商务文档要得体
- 适当使用标题、列表、表格等格式

可用工具：创建文件、读取文件、写入文件、追加文件、翻译、摘要

请用中文回答。`,
    allowedTools: ['create_file', 'read_file', 'write_file', 'append_file', 'list_files', 'translate_text', 'summarize_text'],
    examples: [
      { input: '帮我写一份项目README', output: '好的，我来为你撰写一份专业的README文档...' },
      { input: '把这段文字翻译成英文', output: '好的，这是翻译结果...' },
    ],
  },

  // 研究分析
  {
    id: 'research',
    name: '研究分析',
    description: '深度研究、数据分析、问题拆解和决策支持助手',
    icon: '🔍',
    triggerKeywords: ['分析', '研究', '对比', '评估', '调研', '市场', '行业', '趋势', '数据', '决策', '方案'],
    systemPrompt: `你是一个资深的研究分析师（研究分析 Skill）。

你的专长：
1. 深度问题分析和拆解
2. 多维度对比和评估
3. 数据解读和趋势分析
4. 行业研究和市场分析
5. 决策支持和方案建议

分析框架：
- 先明确问题和目标
- 从多个维度分析（技术、成本、风险、收益等）
- 给出结构化的结论
- 提供可执行的建议
- 标注信息来源和不确定性

可用工具：知识库检索、数学计算、创建文件、写入文件

请用中文回答，分析要有条理，结论要明确。`,
    allowedTools: ['search_knowledge_base', 'calculate', 'create_file', 'write_file', 'summarize_text'],
    examples: [
      { input: '分析一下前端框架的选型', output: '我从多个维度来分析主流前端框架...' },
      { input: '帮我做一个市场调研方案', output: '好的，这是一份完整的市场调研方案...' },
    ],
  },

  // 学习导师
  {
    id: 'tutor',
    name: '学习导师',
    description: '个性化学习辅导、知识讲解、学习规划和答疑助手',
    icon: '🎓',
    triggerKeywords: ['学习', '教程', '讲解', '解释', '什么是', '怎么学', '入门', '教程', '知识点', '概念'],
    systemPrompt: `你是一个耐心的学习导师（学习导师 Skill）。

你的专长：
1. 用通俗易懂的语言解释复杂概念
2. 制定个性化学习路径
3. 循序渐进地讲解知识点
4. 解答学习中的疑问
5. 提供练习和反馈

教学原则：
- 先评估学习者的基础
- 用类比和例子帮助理解
- 从简单到复杂，循序渐进
- 鼓励提问，引导思考
- 给出实践建议和学习资源

可用工具：知识库检索、创建文件、写入文件、翻译

请用中文回答，讲解要耐心、清晰、有层次。`,
    allowedTools: ['search_knowledge_base', 'create_file', 'write_file', 'translate_text'],
    examples: [
      { input: '什么是响应式编程？', output: '响应式编程是一种编程范式，我来用简单的例子解释...' },
      { input: '帮我制定一个Vue3学习计划', output: '好的，根据你的情况，我制定了以下学习计划...' },
    ],
  },

  // 通用助手（默认）
  {
    id: 'general',
    name: '通用助手',
    description: '全能型助手，支持日常问答、工具调用和多任务处理',
    icon: '🤖',
    triggerKeywords: [],
    systemPrompt: `你是一个智能企业助手，名为"智知"（通用助手 Skill）。

你可以帮助用户处理各种任务，包括：
- 日常问答和信息查询
- 文件操作和管理
- 数学计算和数据处理
- 多轮对话和上下文理解

回答要简洁、准确、有条理。需要时主动调用工具。

请用中文回答。`,
    allowedTools: [], // 空表示全部工具可用
    examples: [],
  },
];

// ==================== Skill 管理器 ====================

export class SkillManager {
  private skills: Map<string, SkillDefinition> = new Map();
  private activeSkillId: string = 'general';

  constructor() {
    // 注册内置 Skill
    for (const skill of BUILTIN_SKILLS) {
      this.skills.set(skill.id, skill);
    }
  }

  // 获取所有 Skill
  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  // 获取当前激活的 Skill
  getActiveSkill(): SkillDefinition {
    return this.skills.get(this.activeSkillId) || this.skills.get('general')!;
  }

  // 设置激活的 Skill
  setActiveSkill(skillId: string): boolean {
    if (this.skills.has(skillId)) {
      this.activeSkillId = skillId;
      return true;
    }
    return false;
  }

  // 根据用户输入自动匹配 Skill
  matchSkill(userInput: string): SkillDefinition {
    const input = userInput.toLowerCase();
    
    // 按触发关键词匹配（关键词多的优先）
    let bestMatch: SkillDefinition | null = null;
    let bestScore = 0;

    for (const skill of this.skills.values()) {
      if (skill.id === 'general') continue;
      
      let score = 0;
      for (const keyword of skill.triggerKeywords) {
        if (input.includes(keyword.toLowerCase())) {
          score++;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = skill;
      }
    }

    return bestMatch || this.skills.get('general')!;
  }

  // 获取 Skill 可用的工具
  getSkillTools(skillId: string): typeof tools {
    const skill = this.skills.get(skillId);
    if (!skill || skill.allowedTools.length === 0) {
      return tools; // 全部工具
    }
    return tools.filter(t => skill.allowedTools.includes(t.name));
  }

  // 使用 Skill 执行对话
  async executeWithSkill(
    skillId: string,
    userMessage: string,
    chatHistory: Array<{ role: string; content: string }> = []
  ): Promise<{ answer: string; skill: SkillDefinition }> {
    const skill = this.skills.get(skillId) || this.skills.get('general')!;
    const skillTools = this.getSkillTools(skillId);
    const llm = getLLM();

    // 构建工具描述
    const toolsDesc = skillTools.map(t => `- ${t.name}: ${t.description}`).join('\n');

    const messages: any[] = [
      new SystemMessage(skill.systemPrompt + `\n\n当前可用工具：\n${toolsDesc}\n\n需要时请调用工具。`),
      ...chatHistory.slice(-6).map(m =>
        m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
      ),
      new HumanMessage(userMessage),
    ];

    // 简单执行（最多3轮工具调用）
    let answer = '';
    for (let i = 0; i < 3; i++) {
      const response = await llm.invoke(messages, {
        tools: skillTools.map(t => ({ type: 'function', function: t })),
      } as any);

      const message = response as any;
      const toolCalls = message?.additional_kwargs?.tool_calls 
        || message?.tool_calls 
        || message?.message_tool_calls 
        || (message?.function_call ? [message.function_call] : []);

      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          // 支持多种工具调用格式
          const toolName = toolCall.function?.name 
            || toolCall.name 
            || toolCall.function_call?.name 
            || toolCall.tool_name;
          
          let toolArgs: Record<string, any> = {};
          try {
            const argsStr = toolCall.function?.arguments 
              || toolCall.arguments 
              || toolCall.function_call?.arguments 
              || toolCall.parameters 
              || '{}';
            toolArgs = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
          } catch { /* ignore */ }

          if (!toolName) {
            console.warn('[Skill] 无法解析工具名称:', JSON.stringify(toolCall).substring(0, 300));
            continue;
          }

          // 实际调用工具执行
          const toolResult = await executeTool(toolName, toolArgs);
          
          // 构建标准格式
          const standardToolCall: any = {
            id: toolCall.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs)
            }
          };
          messages.push(new AIMessage({ content: '', tool_calls: [standardToolCall] }));
          messages.push(new ToolMessage({
            tool_call_id: standardToolCall.id,
            content: toolResult,
          }));
        }
      } else {
        answer = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content);
        break;
      }
    }

    return { answer: answer || '抱歉，处理超时', skill };
  }
}

// 全局 Skill 管理器实例
export const skillManager = new SkillManager();
