import { getLLM } from './llm';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

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
import type { ChatMessage } from '../types';

// 规划步骤类型
export interface PlanStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

// 规划结果
export interface PlanResult {
  plan: PlanStep[];
  finalAnswer: string;
  steps: Array<{ type: string; content: string }>;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const PLAN_SYSTEM_PROMPT = `你是一个专业的任务规划助手。当用户提出一个复杂问题或任务时，你需要：
1. 分析用户需求，将任务拆解为清晰的执行步骤
2. 每个步骤应该是可独立执行的子任务
3. 步骤之间应该有逻辑顺序
4. 最后给出汇总的回答

请严格按照以下JSON格式输出规划结果：
{
  "steps": [
    {"id": 1, "title": "步骤标题", "description": "步骤详细描述"},
    {"id": 2, "title": "步骤标题", "description": "步骤详细描述"}
  ],
  "summary": "对整体任务的简要说明"
}`;

const EXECUTE_SYSTEM_PROMPT = `你是一个执行助手。根据规划的步骤和已有的执行结果，完成当前步骤的任务。
请直接给出该步骤的执行结果，不要重复规划内容。`;

// 生成任务规划
async function generatePlan(userMessage: string, chatHistory: ChatMessage[]): Promise<{ steps: PlanStep[]; summary: string; tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const llm = getLLM();
  
  const messages = [
    new SystemMessage(PLAN_SYSTEM_PROMPT),
    ...chatHistory.slice(-4).map(m => 
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(`请为以下任务制定执行计划：\n\n${userMessage}`),
  ];
  
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const tokenUsage = extractTokenUsage(response);
  
  // 尝试解析JSON
  try {
    // 提取JSON部分（可能被markdown代码块包裹）
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    const parsed = JSON.parse(jsonStr);
    const steps: PlanStep[] = (parsed.steps || []).map((s: any, i: number) => ({
      id: s.id || i + 1,
      title: s.title || `步骤 ${i + 1}`,
      description: s.description || '',
      status: 'pending' as const,
    }));
    return { steps, summary: parsed.summary || '', tokenUsage };
  } catch {
    // 解析失败，返回单步规划
    return {
      steps: [{ id: 1, title: '直接回答', description: userMessage, status: 'pending' }],
      summary: content,
      tokenUsage,
    };
  }
}

// 执行单个步骤
async function executeStep(step: PlanStep, context: string): Promise<{ result: string; tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const llm = getLLM();
  
  const messages = [
    new SystemMessage(EXECUTE_SYSTEM_PROMPT),
    new HumanMessage(`已完成的上下文：\n${context}\n\n当前步骤：${step.title}\n${step.description}\n\n请执行该步骤并给出结果。`),
  ];
  
  const response = await llm.invoke(messages);
  const result = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  return { result, tokenUsage: extractTokenUsage(response) };
}

// 生成最终汇总回答
async function generateFinalAnswer(userMessage: string, plan: PlanStep[]): Promise<{ answer: string; tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const llm = getLLM();
  
  const stepsText = plan.map(s => `步骤${s.id}：${s.title}\n结果：${s.result || '未完成'}`).join('\n\n');
  
  const messages = [
    new SystemMessage('你是一个总结助手。根据任务规划和各步骤的执行结果，给用户一个完整、清晰的最终回答。'),
    new HumanMessage(`用户问题：${userMessage}\n\n执行过程：\n${stepsText}\n\n请给出最终汇总回答。`),
  ];
  
  const response = await llm.invoke(messages);
  const answer = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  return { answer, tokenUsage: extractTokenUsage(response) };
}

// Plan模式主函数（带整体超时控制）
export async function planRun(userMessage: string, chatHistory: ChatMessage[]): Promise<PlanResult> {
  const steps: Array<{ type: string; content: string }> = [];
  
  // 整体超时控制（2分钟）
  const timeoutMs = 120000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Plan模式执行超时（2分钟），任务已中断')), timeoutMs);
  });
  
  try {
    return await Promise.race([
      runPlanPipeline(userMessage, chatHistory, steps),
      timeoutPromise,
    ]);
  } catch (error) {
    steps.push({ type: 'error', content: error instanceof Error ? error.message : String(error) });
    return {
      plan: [],
      finalAnswer: `任务执行失败：${error instanceof Error ? error.message : String(error)}`,
      steps,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}

// Plan模式流水线（内部实现）
async function runPlanPipeline(
  userMessage: string,
  chatHistory: ChatMessage[],
  steps: Array<{ type: string; content: string }>
): Promise<PlanResult> {
  
  // 累计 token 用量
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  
  // 第一步：生成规划
  steps.push({ type: 'planning', content: '正在分析任务，制定执行计划...' });
  
  const { steps: planSteps, summary, tokenUsage: planTokens } = await generatePlan(userMessage, chatHistory);
  totalPromptTokens += planTokens.promptTokens;
  totalCompletionTokens += planTokens.completionTokens;
  
  steps.push({ 
    type: 'plan_created', 
    content: `已制定 ${planSteps.length} 步执行计划${summary ? '：' + summary : ''}`,
  });
  
  // 第二步：逐步执行
  let context = '';
  for (const step of planSteps) {
    step.status = 'running';
    steps.push({ type: 'step_start', content: `执行步骤 ${step.id}：${step.title}` });
    
    try {
      const { result, tokenUsage: stepTokens } = await executeStep(step, context);
      totalPromptTokens += stepTokens.promptTokens;
      totalCompletionTokens += stepTokens.completionTokens;
      step.result = result;
      step.status = 'completed';
      context += `\n步骤${step.id}结果：${result}\n`;
      steps.push({ type: 'step_done', content: `步骤 ${step.id} 完成` });
    } catch (error) {
      step.status = 'failed';
      step.result = error instanceof Error ? error.message : String(error);
      steps.push({ type: 'step_error', content: `步骤 ${step.id} 失败：${step.result}` });
    }
  }
  
  // 第三步：生成最终回答
  steps.push({ type: 'summarizing', content: '正在汇总结果...' });
  const { answer: finalAnswer, tokenUsage: finalTokens } = await generateFinalAnswer(userMessage, planSteps);
  totalPromptTokens += finalTokens.promptTokens;
  totalCompletionTokens += finalTokens.completionTokens;
  
  return {
    plan: planSteps,
    finalAnswer,
    steps,
    tokenUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    },
  };
}
