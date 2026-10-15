import { taskManager } from './taskManager';
import { config } from '../config';
import { agentRunStream, type CustomAgentConfig, type ApprovalRequest } from './agent';
import { generatePlanOnly, executePlan } from './plan';
import { multiAgentRun } from './multiAgent';
import { getSessionMessages, addMessage } from './session';
import { recordUsage } from './usage';
import { getCurrentModel, getLLM, setRequestParams, getRequestUserCredential, getResolvedProviderAndModel } from './llm';
import { humanizeTaskError } from './taskError';
import { getAgent } from './customAgent';
import { getRelevantMemories } from './memory';
import { getActiveTemplate } from './prompt';
import { runWithAgentOutputDir, getSessionChatOutputDir } from './agentOutput';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export interface RunTaskInput {
  taskId: string;
  sessionId: string;
  userId?: string | null;
  message: string;
  mode: string;
  agentId?: string;
  collectionIds?: string[];
  enableThinking?: boolean;
  parentId?: string;
  branchId?: string;
  modelParams?: Record<string, number>;
  isEdit?: boolean;
  editMessageId?: string;
  userMessageId?: string;
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
    ...buildHistoryMessages(history, 6),
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
import { truncateHistoryForEdit, buildHistoryMessages } from './history';

export async function runTaskInBackground(input: RunTaskInput): Promise<void> {
  const { taskId, sessionId, message, mode } = input;
  if (input.modelParams) setRequestParams(input.modelParams);

  // 用户凭据由调用方（routes/task.ts）用 runWithUserCredential 注入本次异步调用链。
  // 这里绝不能写成进程级状态：任务并发执行，进程级变量会被其他用户覆盖（A 的任务带 B 的 Key）。
  const credential = getRequestUserCredential();
  if (credential?.providerId) {
    console.log(`[Task ${taskId.slice(0, 8)}] 使用用户凭据，厂商=${credential.providerId}`);
  }

  taskManager.setStatus(taskId, 'running');

  // HITL 审批回调：挂起任务直到前端调 /api/tasks/:id/approve
  const requestApproval = (areq: ApprovalRequest): Promise<boolean> => {
    if (taskManager.isCancelled(taskId)) return Promise.resolve(false);
    if (taskManager.isRemembered(input.sessionId, areq.kind)) return Promise.resolve(true);
    return taskManager.requestApproval(taskId, areq);
  };

  const isDesktop = config.isDesktop;
  const allMessages = await getSessionMessages(sessionId);
  const history = truncateHistoryForEdit(allMessages, input.isEdit ? input.editMessageId : undefined);
  // 记账必须用「本次真正调用的模型」：用户凭据可能把厂商/模型收敛到 DeepSeek，
  // 用全局 getCurrentModel() 会把用量记到其他厂商的模型名下。
  const resolved = getResolvedProviderAndModel();
  const modelInfo = {
    ...getCurrentModel(),
    id: resolved.modelName,
    name: resolved.modelName,
    providerId: resolved.providerId,
  };

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
    const runStartMs = Date.now(); // 本轮执行耗时（消息元数据 durationMs，前端「已完成 Xs」展示用）
    // 把本轮产物 narrowing 到「总目录/chats/会话创建日期」。
    // 同一会话无论横跨多少天、后续何时再次打开修改，文件始终落在该日期目录。
    const sessionChatDir = await getSessionChatOutputDir(sessionId);
    await runWithAgentOutputDir(sessionChatDir, async () => {
      if (mode === 'qa') {
        let full = '';
        let usage: any = null;
        for await (const chunk of runQAStream(message, history, input.enableThinking || false)) {
          if (taskManager.isCancelled(taskId)) break;
          taskManager.emitEvent(taskId, chunk.type, chunk);
          if (chunk.type === 'token') full += chunk.content;
          if (chunk.type === 'done') usage = chunk.tokenUsage;
        }
        await addMessage(sessionId, 'assistant', full, 'qa', { tokenUsage: usage, branchId: input.branchId, parentId: input.userMessageId || input.editMessageId });
        if (usage)
          recordUsage(sessionId, undefined, modelInfo.name, usage.promptTokens, usage.completionTokens, usage.totalTokens).catch(() => {});
        taskManager.setResult(taskId, full, { tokenUsage: usage });
      } else if (mode === 'plan') {
        // Plan 模式：先生成计划并请求用户前置确认（HITL），确认后再执行。
        const planSteps = await generatePlanOnly(message, history);
        const decision = await taskManager.requestPlanConfirm(taskId, planSteps);
        if (!decision.confirmed) {
          taskManager.emitEvent(taskId, 'token', { content: '已取消执行计划。', sources: [] });
          await addMessage(sessionId, 'assistant', '已取消执行计划。', 'plan', {
            plan: planSteps,
            tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            branchId: input.branchId,
            parentId: input.userMessageId || input.editMessageId,
          });
          taskManager.setStatus(taskId, 'completed', { plan: planSteps });
        } else {
          const finalSteps = decision.feedback
            ? [...planSteps, { id: planSteps.length + 1, title: '附加约束', description: decision.feedback, status: 'pending' as const }]
            : planSteps;
          const exec = await executePlan(finalSteps, message, history);
          for (const s of exec.steps) taskManager.emitEvent(taskId, s.type || 'plan_step', s);
          taskManager.emitEvent(taskId, 'token', { content: exec.finalAnswer, sources: [] });
          await addMessage(sessionId, 'assistant', exec.finalAnswer, 'plan', {
            plan: finalSteps,
            tokenUsage: exec.tokenUsage,
            branchId: input.branchId,
            parentId: input.userMessageId || input.editMessageId,
          });
          if (exec.tokenUsage)
            recordUsage(sessionId, undefined, modelInfo.name, exec.tokenUsage.promptTokens, exec.tokenUsage.completionTokens, exec.tokenUsage.totalTokens).catch(() => {});
          taskManager.setResult(taskId, exec.finalAnswer, {
            plan: finalSteps,
            tokenUsage: exec.tokenUsage,
          });
        }
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
          branchId: input.branchId,
          parentId: input.userMessageId || input.editMessageId,
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
          userId: input.userId,
          requestApproval,
        });
        let full = '';
        const toolCalls: any[] = [];
        // 本轮生成的文件：从 tool_result 事件里收集，落库后消息末尾才能渲染文件卡片
        const artifacts: any[] = [];
        let usage: any = null;
        let incompleteReason: string | null = null;
        for await (const chunk of stream) {
          if (taskManager.isCancelled(taskId)) break;
          taskManager.emitEvent(taskId, chunk.type, chunk);
          if (chunk.type === 'token') full += chunk.content;
          if (chunk.type === 'tool_call') toolCalls.push(chunk.toolCall);
          if (chunk.type === 'tool_result' && (chunk as any).artifacts?.length) {
            for (const a of (chunk as any).artifacts) {
              if (!artifacts.some((x) => x.path === a.path)) artifacts.push(a);
            }
          }
          if (chunk.type === 'done') {
            if (chunk.tokenUsage) usage = chunk.tokenUsage;
            // done 事件现在也携带完整 artifacts（含输出目录扫描补齐的文件）
            if ((chunk as any).artifacts?.length) {
              for (const a of (chunk as any).artifacts) {
                if (!artifacts.some((x) => x.path === a.path)) artifacts.push(a);
              }
            }
            // done.content 只在"轮次用尽、任务被截断"时才有值：必须并入结果，
            // 否则这句话只存在于 SSE 流里，落库的只剩半截中间话术。
            if (chunk.content) {
              full += full ? `\n\n${chunk.content}` : chunk.content;
              if ((chunk as any).incomplete) incompleteReason = chunk.content;
            }
          }
        }
        // 审批超时这类提示由 taskManager 直接产生、不经过生成器，这里取回来并入正文，
        // 否则它只在流式过程中闪一下，刷新页面就消失了
        const notices = taskManager.drainNotices(taskId);
        if (notices.length) {
          full += full ? `\n\n${notices.map((n) => `> ${n}`).join('\n\n')}` : notices.map((n) => `> ${n}`).join('\n\n');
        }
        // durationMs 并入 tokenUsage JSON（messages 表无通用元数据列，tokenUsage 为 JSONB 可携带）
        const usageWithDur: any = { ...(usage || {}), durationMs: Date.now() - runStartMs };
        await addMessage(sessionId, 'assistant', full, 'agent', { toolCalls, tokenUsage: usageWithDur, artifacts, branchId: input.branchId, parentId: input.userMessageId || input.editMessageId });
        if (usage)
          recordUsage(sessionId, undefined, modelInfo.name, usage.promptTokens, usage.completionTokens, usage.totalTokens).catch(() => {});
        if (taskManager.isCancelled(taskId)) {
          taskManager.setStatus(taskId, 'cancelled');
        } else if (incompleteReason) {
          // 不能标 completed：任务确实没做完，标成功会让用户以为结果已经产出。
          // 同时保留已产出的部分内容，便于用户判断进度。
          taskManager.setStatus(taskId, 'failed', { error: incompleteReason, result: full, tokenUsage: usage });
        } else {
          taskManager.setResult(taskId, full, { tokenUsage: usage });
        }
      }
    });
  } catch (error) {
    const message = humanizeTaskError(error instanceof Error ? error.message : String(error));
    if (taskManager.isCancelled(taskId)) {
      taskManager.setStatus(taskId, 'cancelled', { error: '已取消' });
    } else {
      // setError 只广播一条 status 事件；前端若不处理 status，用户就完全看不到原因，
      // 只会看到一个空白气泡（表现为"消息发出去就没了"）。先补发一条 error 事件，
      // 前端已有 case 'error'，会把原因写进气泡正文。
      taskManager.emitEvent(taskId, 'error', { type: 'error', content: message });
      taskManager.setError(taskId, message);
    }
  } finally {
    setRequestParams(null);
  }
}
