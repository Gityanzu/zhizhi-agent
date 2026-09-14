import { getLLM } from './llm';
import { tools, agentRun } from './agent';
import { AgentStep } from '../types';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from '@langchain/core/messages';

// 从 LLM 响应中提取 token 用量（兼容多种属性路径）
function extractTokenUsage(response: any): { promptTokens: number; completionTokens: number; totalTokens: number } {
  const rm = response?.response_metadata || {};
  const usage = rm.tokenUsage 
    || rm.estimatedTokenUsage 
    || response?.responseMetadata?.tokenUsage 
    || response?.responseMetadata?.estimatedTokenUsage
    || response?.kwargs?.response_metadata?.tokenUsage
    || response?.kwargs?.response_metadata?.estimatedTokenUsage
    || response?.usage 
    || {};
  const promptTokens = usage.promptTokens || usage.prompt_tokens || 0;
  const completionTokens = usage.completionTokens || usage.completion_tokens || 0;
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

// ==================== 多Agent协作：Planner-Executor-Reviewer ====================

export interface MultiAgentResult {
  answer: string;
  steps: AgentStep[];
  plan: Array<{ id: number; title: string; description: string; status: string; result?: string }>;
  agentTrace: Array<{ agent: string; action: string; content: string }>;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// Planner Agent：任务规划
const PLANNER_PROMPT = `你是一个任务规划专家（Planner Agent）。你的职责是将用户的复杂任务拆解为清晰、可执行的步骤。

规则：
1. 分析用户需求，判断任务复杂度
2. 简单任务（1步可完成）直接返回单步计划
3. 复杂任务拆解为2-5个步骤
4. 每个步骤要有明确的标题和描述
5. 步骤之间要有逻辑顺序
6. 返回JSON格式：{"steps": [{"id": 1, "title": "步骤标题", "description": "步骤描述"}]}

只返回JSON，不要其他内容。`;

// Executor Agent：任务执行
const EXECUTOR_PROMPT = `你是一个任务执行专家（Executor Agent）。你的职责是按照计划逐步执行任务。

你可以使用以下工具：
{tools_description}

执行规则：
1. 按照给定的步骤依次执行
2. 每步执行时判断是否需要调用工具
3. 需要工具时调用对应工具
4. 不需要工具时直接给出该步骤的结果
5. 每步完成后记录执行结果
6. 确保每步结果准确、完整`;

// Reviewer Agent：结果审查
const REVIEWER_PROMPT = `你是一个质量审查专家（Reviewer Agent）。你的职责是审查任务执行结果是否满足用户需求。

审查标准：
1. 结果是否完整回答了用户的问题
2. 信息是否准确、有无明显错误
3. 格式是否清晰、有条理
4. 是否遗漏了重要内容

返回JSON格式：
{"passed": true/false, "feedback": "审查意见", "suggestion": "改进建议（如果不通过）"}

只返回JSON，不要其他内容。`;

// 构建工具描述
function buildToolsDescription(): string {
  return tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
}

// 解析JSON（容错处理）
function parseJSON(text: string): any {
  try {
    // 尝试直接解析
    return JSON.parse(text);
  } catch {
    try {
      // 尝试提取JSON部分
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {
      // 忽略
    }
  }
  return null;
}

// 多Agent协作执行（带整体超时控制）
export async function multiAgentRun(
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }> = [],
  onProgress?: (trace: { agent: string; action: string; content: string }) => void
): Promise<MultiAgentResult> {
  const steps: AgentStep[] = [];
  const agentTrace: Array<{ agent: string; action: string; content: string }> = [];
  
  // 包装 agentTrace.push，同时调用 onProgress 回调
  const pushTrace = (trace: { agent: string; action: string; content: string }) => {
    agentTrace.push(trace);
    if (onProgress) {
      try { onProgress(trace); } catch (e) { /* 忽略回调错误 */ }
    }
  };
  
  // 整体超时控制（3分钟）
  const timeoutMs = 180000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('多Agent协作超时（3分钟），任务已中断')), timeoutMs);
  });
  
  try {
    return await Promise.race([
      runMultiAgentPipeline(userMessage, chatHistory, steps, agentTrace, pushTrace),
      timeoutPromise,
    ]);
  } catch (error) {
    pushTrace({ agent: 'System', action: 'error', content: error instanceof Error ? error.message : String(error) });
    return {
      answer: `多Agent协作失败：${error instanceof Error ? error.message : String(error)}`,
      steps,
      plan: [],
      agentTrace,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}

// 多Agent协作流水线（内部实现）
async function runMultiAgentPipeline(
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }>,
  steps: AgentStep[],
  agentTrace: Array<{ agent: string; action: string; content: string }>,
  pushTrace: (trace: { agent: string; action: string; content: string }) => void
): Promise<MultiAgentResult> {
  const llm = getLLM();
  
  // 累计 token 用量
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  console.log('\n========== 多Agent协作开始 ==========');
  console.log('用户任务:', userMessage);

  // ========== 阶段1：Planner 规划 ==========
  console.log('\n[Planner Agent] 正在规划任务...');
  pushTrace({ agent: 'Planner', action: 'start_planning', content: userMessage });

  const plannerResponse = await llm.invoke([
    new SystemMessage(PLANNER_PROMPT),
    ...chatHistory.slice(-3).map(m =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(`请规划以下任务：${userMessage}`),
  ]);
  
  const plannerTokens = extractTokenUsage(plannerResponse);
  totalPromptTokens += plannerTokens.promptTokens;
  totalCompletionTokens += plannerTokens.completionTokens;

  const plannerText = typeof plannerResponse.content === 'string' ? plannerResponse.content : JSON.stringify(plannerResponse.content);
  const planData = parseJSON(plannerText);

  let planSteps: Array<{ id: number; title: string; description: string; status: string; result?: string }>;

  if (planData && planData.steps && Array.isArray(planData.steps)) {
    planSteps = planData.steps.map((s: any, i: number) => ({
      id: s.id || i + 1,
      title: s.title || `步骤${i + 1}`,
      description: s.description || '',
      status: 'pending',
    }));
  } else {
    // 解析失败，默认单步
    planSteps = [{ id: 1, title: '直接回答', description: userMessage, status: 'pending' }];
  }

  console.log(`[Planner Agent] 规划完成，共 ${planSteps.length} 步`);
  planSteps.forEach(s => console.log(`  ${s.id}. ${s.title}`));

  pushTrace({ agent: 'Planner', action: 'plan_created', content: `共${planSteps.length}步` });
  steps.push({ type: 'planning', content: `任务已拆解为 ${planSteps.length} 步` });

  // ========== 阶段2：Executor 逐步执行 ==========
  console.log('\n[Executor Agent] 开始执行...');
  pushTrace({ agent: 'Executor', action: 'start_execution', content: `${planSteps.length}个步骤` });

  const executionResults: string[] = [];

  for (let i = 0; i < planSteps.length; i++) {
    const step = planSteps[i];
    step.status = 'running';

    console.log(`\n[Executor] 执行步骤 ${step.id}: ${step.title}`);
    pushTrace({ agent: 'Executor', action: 'step_start', content: `${step.id}. ${step.title}` });
    steps.push({ type: 'step_start', content: `执行步骤 ${step.id}: ${step.title}` });

    // 构建执行上下文
    const context = `
用户原始任务：${userMessage}

当前执行步骤：${step.id}. ${step.title}
步骤描述：${step.description}

已完成步骤的结果：
${executionResults.map((r, idx) => `步骤${idx + 1}：${r.slice(0, 200)}`).join('\n')}

请执行当前步骤，给出结果。`;

    // 调用单Agent执行（带工具）
    const execResult = await agentRun(context, []);
    executionResults.push(execResult.answer);
    step.result = execResult.answer.slice(0, 500);
    step.status = 'completed';
    
    // 累计 Executor 的 token 用量
    if (execResult.tokenUsage) {
      totalPromptTokens += execResult.tokenUsage.promptTokens;
      totalCompletionTokens += execResult.tokenUsage.completionTokens;
    }

    // 记录工具调用步骤
    if (execResult.steps) {
      for (const s of execResult.steps) {
        if (s.type === 'tool_call' || s.type === 'tool_result') {
          steps.push(s);
        }
      }
    }

    console.log(`[Executor] 步骤 ${step.id} 完成`);
    pushTrace({ agent: 'Executor', action: 'step_done', content: `${step.id}. ${step.title}` });
    steps.push({ type: 'step_done', content: `步骤 ${step.id} 完成` });
  }

  // ========== 阶段3：Reviewer 审查 ==========
  console.log('\n[Reviewer Agent] 正在审查结果...');
  pushTrace({ agent: 'Reviewer', action: 'start_review', content: '审查执行结果' });

  const finalResult = executionResults.join('\n\n');

  const reviewerResponse = await llm.invoke([
    new SystemMessage(REVIEWER_PROMPT),
    new HumanMessage(`
用户任务：${userMessage}

执行结果：
${finalResult.slice(0, 2000)}

请审查以上结果是否满足用户需求。`),
  ]);
  
  const reviewerTokens = extractTokenUsage(reviewerResponse);
  totalPromptTokens += reviewerTokens.promptTokens;
  totalCompletionTokens += reviewerTokens.completionTokens;

  const reviewerText = typeof reviewerResponse.content === 'string' ? reviewerResponse.content : JSON.stringify(reviewerResponse.content);
  const reviewData = parseJSON(reviewerText);

  const passed = reviewData?.passed !== false; // 默认通过
  const feedback = reviewData?.feedback || '审查通过';

  console.log(`[Reviewer Agent] 审查结果: ${passed ? '通过' : '不通过'} - ${feedback}`);
  pushTrace({ agent: 'Reviewer', action: 'review_done', content: feedback });
  steps.push({ type: 'review', content: `质量审查：${feedback}` });

  // ========== 阶段4：汇总最终回答 ==========
  console.log('\n[Coordinator] 汇总最终结果...');

  const summaryResponse = await llm.invoke([
    new SystemMessage(`你是一个内容整合专家。请将多个步骤的执行结果整合成一个完整、连贯、有条理的最终回答，直接回答用户的原始问题。不要提及执行过程，只给出最终结果。`),
    new HumanMessage(`
用户原始问题：${userMessage}

各步骤执行结果：
${finalResult}

审查意见：${feedback}

请整合为最终回答。`),
  ]);
  
  const summaryTokens = extractTokenUsage(summaryResponse);
  totalPromptTokens += summaryTokens.promptTokens;
  totalCompletionTokens += summaryTokens.completionTokens;

  const finalAnswer = typeof summaryResponse.content === 'string' ? summaryResponse.content : JSON.stringify(summaryResponse.content);

  console.log('========== 多Agent协作完成 ==========\n');

  return {
    answer: finalAnswer,
    steps,
    plan: planSteps,
    agentTrace,
    tokenUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    },
  };
}
