import { taskManager } from './taskManager';
import { config } from '../config';
import { agentRunStream, type CustomAgentConfig, type ApprovalRequest } from './agent';
import { planRun } from './plan';
import { multiAgentRun } from './multiAgent';
import { getSessionMessages, addMessage } from './session';
import { recordUsage } from './usage';
import { getCurrentModel, getLLM } from './llm';
import { getAgent } from './customAgent';
import { getRelevantMemories } from './memory';
import { getActiveTemplate } from './prompt';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

export interface RunTaskInput {
  taskId: string;
  sessionId: string;
  userId?: string | null;
  message: string;
  mode: string;
  agentId?: string;
  collectionIds?: string[];
  enableThinking?: boolean;
}

// QA 流式（复制自 chat.ts simpleQAStream，避免 services 反向依赖 routes）
async function* runQAStream(message: string, history: any[], enableThinking: boolean) {
  const llm = getLLM();
  const memories = await getRelevantMemories(5);
  const memoryContext = memories.length > 0
    ? `\n\n【用户记忆】\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    : '';
  const activeTemplate = await getActiveTemplate();
  const basePrompt =
    activeTemplate?.content ||
    '你是智知，一个专业的企业知识库智能问答助手。请直接回答用户的问题，回答要简洁、准确、有帮助。';
  let systemPrompt = `${basePrompt}${memoryContext}`;
  if (enableThinking) {
    systemPrompt = `${basePrompt}\n在回答用户问题之前，请先在 <think> 标签中写出你的思考过程，然后再给出最终答案。${memoryContext}`;
  }
  const messages = [
    new SystemMessage(systemPrompt),
    ...history.slice(-6).map((m: any) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(message),
  ];
  const stream = await llm.stream(messages);
  let fullContent = '';
  let lastChunk: any = null;
  for await (const chunk of stream) {
    lastChunk = chunk;
    const content = typeof chunk.content === 'string' ? chunk.content : '';
    if (content) {
      fullContent += content;
      yield { type: 'token', content };
    }
  }
  const rm = lastChunk?.response_metadata || {};
  const usage = rm.tokenUsage || rm.estimatedTokenUsage || lastChunk?.usage || {};
  const promptTokens = usage.promptTokens || usage.prompt_tokens || 0;
  const completionTokens = usage.completionTokens || usage.completion_tokens || 0;
  yield {
    type: 'done',
    tokenUsage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
  };
}

// 后台执行任务：复用现有 service 层（agentRunStream / planRun / multiAgentRun / runQAStream）。
// 不在本函数内 await 返回给调用方，由调用方 fire-and-forget；所有进度通过 taskManager 事件广播。
export async function runTaskInBackground(input: RunTaskInput): Promise<void> {
  const { taskId, sessionId, message, mode } = input;
  taskManager.setStatus(taskId, 'running');

  // HITL 审批回调：挂起任务直到前端调 /api/tasks/:id/approve
  const requestApproval = (areq: ApprovalRequest): Promise<boolean> => {
    if (taskManager.isCancelled(taskId)) return Promise.resolve(false);
    return taskManager.requestApproval(taskId, areq);
  };

  const isDesktop = config.isDesktop;
  const history = (await getSessionMessages(sessionId)).slice(-20);
  const modelInfo = getCurrentModel();

  let customAgentConfig: CustomAgentConfig | undefined;
  if (input.agentId) {
    const customAgent = await getAgent(input.agentId);
    if (customAgent) {
      customAgentConfig = {
        systemPrompt: customAgent.systemPrompt,
        tools: customAgent.tools,
        model: customAgent.model || undefined,
        temperature: customAgent.temperature,
      };
    }
  }

  try {
    if (mode === 'qa') {
      let full = '';
      let usage: any = null;
      for await (const chunk of runQAStream(message, history, input.enableThinking || false)) {
        if (taskManager.isCancelled(taskId)) break;
        taskManager.emitEvent(taskId, chunk.type, chunk);
        if (chunk.type === 'token') full += chunk.content;
        if (chunk.type === 'done') usage = chunk.tokenUsage;
      }
      await addMessage(sessionId, 'assistant', full, 'qa', { tokenUsage: usage });
      if (usage)
        recordUsage(sessionId, undefined, modelInfo.name, usage.promptTokens, usage.completionTokens, usage.totalTokens).catch(() => {});
      taskManager.setResult(taskId, full, { tokenUsage: usage });
    } else if (mode === 'plan') {
      const planResult = await planRun(message, history);
      for (const step of planResult.steps) taskManager.emitEvent(taskId, 'plan_step', step);
      taskManager.emitEvent(taskId, 'token', { content: planResult.finalAnswer, sources: [] });
      await addMessage(sessionId, 'assistant', planResult.finalAnswer, 'plan', {
        plan: planResult.plan,
        tokenUsage: planResult.tokenUsage,
      });
      if (planResult.tokenUsage)
        recordUsage(sessionId, undefined, modelInfo.name, planResult.tokenUsage.promptTokens, planResult.tokenUsage.completionTokens, planResult.tokenUsage.totalTokens).catch(() => {});
      taskManager.setResult(taskId, planResult.finalAnswer, {
        plan: planResult.plan,
        tokenUsage: planResult.tokenUsage,
      });
    } else if (mode === 'multi') {
      taskManager.emitEvent(taskId, 'planning', { content: '多Agent协作开始...' });
      const multiResult = await multiAgentRun(message, history, (trace) => {
        taskManager.emitEvent(taskId, 'agent_progress', trace);
      });
      taskManager.emitEvent(taskId, 'agent_trace', { agentTrace: multiResult.agentTrace });
      taskManager.emitEvent(taskId, 'token', { content: multiResult.answer, sources: [] });
      await addMessage(sessionId, 'assistant', multiResult.answer, 'multi', {
        agentTrace: multiResult.agentTrace,
        tokenUsage: multiResult.tokenUsage,
      });
      if (multiResult.tokenUsage)
        recordUsage(sessionId, undefined, modelInfo.name, multiResult.tokenUsage.promptTokens, multiResult.tokenUsage.completionTokens, multiResult.tokenUsage.totalTokens).catch(() => {});
      taskManager.setResult(taskId, multiResult.answer, {
        agentTrace: multiResult.agentTrace,
        tokenUsage: multiResult.tokenUsage,
      });
    } else {
      // agent 模式（默认）
      const stream = agentRunStream(message, history, customAgentConfig, {
        collectionIds: Array.isArray(input.collectionIds) ? input.collectionIds : undefined,
        isDesktop,
        sessionId,
        requestApproval,
      });
      let full = '';
      const toolCalls: any[] = [];
      let usage: any = null;
      for await (const chunk of stream) {
        if (taskManager.isCancelled(taskId)) break;
        taskManager.emitEvent(taskId, chunk.type, chunk);
        if (chunk.type === 'token') full += chunk.content;
        if (chunk.type === 'tool_call') toolCalls.push(chunk.toolCall);
        if (chunk.type === 'done' && chunk.tokenUsage) usage = chunk.tokenUsage;
      }
      await addMessage(sessionId, 'assistant', full, 'agent', { toolCalls, tokenUsage: usage });
      if (usage)
        recordUsage(sessionId, undefined, modelInfo.name, usage.promptTokens, usage.completionTokens, usage.totalTokens).catch(() => {});
      if (taskManager.isCancelled(taskId)) {
        taskManager.setStatus(taskId, 'cancelled');
      } else {
        taskManager.setResult(taskId, full, { tokenUsage: usage });
      }
    }
  } catch (error) {
    if (taskManager.isCancelled(taskId)) {
      taskManager.setStatus(taskId, 'cancelled', { error: '已取消' });
    } else {
      taskManager.setError(taskId, error instanceof Error ? error.message : String(error));
    }
  }
}
