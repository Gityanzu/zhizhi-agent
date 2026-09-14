import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { agentRunStream, agentRun, type CustomAgentConfig } from '../services/agent';
import { ragQuery, ragQueryStream } from '../services/rag';
import { planRun } from '../services/plan';
import { multiAgentRun } from '../services/multiAgent';
import { getSessionMessages, addMessage, createSession, getSessionInfo } from '../services/session';
import { getRelevantMemories, extractMemories } from '../services/memory';
import { getActiveTemplate } from '../services/prompt';
import { isLLMConfigured, getCurrentModel, setRequestParams, ModelParams } from '../services/llm';
import { getLLM } from '../services/llm';
import { setRequestModelOverride } from '../services/llmProvider';
import { recordUsage } from '../services/usage';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import type { ChatMessage } from '../types';
import { getAgent } from '../services/customAgent';

const router = Router();

// 从模型输出中解析思考内容（<think>...</think> 标签）
function extractThinking(content: string): { thinking: string; answer: string } {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const answer = content.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    return { thinking, answer };
  }
  return { thinking: '', answer: content };
}

// 上下文压缩配置
const CONTEXT_COMPRESS_THRESHOLD = 12; // 超过12条消息触发压缩
const CONTEXT_KEEP_RECENT = 6; // 保留最近6条消息

// 用 LLM 压缩历史消息为摘要
async function compressHistory(history: Array<{ role: string; content: string }>): Promise<string> {
  const llm = getLLM();
  const historyText = history.map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n');
  
  const messages = [
    new SystemMessage('你是一个对话摘要助手。请将以下对话历史压缩成一段简洁的摘要，保留关键信息、用户需求、已完成的任务和重要结论。摘要不超过200字。'),
    new HumanMessage(`请压缩以下对话历史：\n\n${historyText}`),
  ];
  
  try {
    const response = await llm.invoke(messages);
    return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  } catch (error) {
    console.warn('上下文压缩失败，将使用原始历史:', error);
    return '';
  }
}

// 获取并压缩历史消息
async function getCompressedHistory(
  sessionId: string
): Promise<{ history: ChatMessage[]; compressed: boolean }> {
  const allMessages = await getSessionMessages(sessionId);
  
  // 消息数量未超过阈值，直接返回
  if (allMessages.length <= CONTEXT_COMPRESS_THRESHOLD) {
    return { history: allMessages, compressed: false };
  }
  
  // 超过阈值，压缩旧消息
  const splitIndex = allMessages.length - CONTEXT_KEEP_RECENT;
  const oldMessages = allMessages.slice(0, splitIndex);
  const recentMessages = allMessages.slice(splitIndex);
  
  console.log(`[上下文压缩] 会话 ${sessionId}: ${allMessages.length}条消息，压缩前${oldMessages.length}条，保留最近${recentMessages.length}条`);
  
  const summary = await compressHistory(oldMessages);
  
  if (summary) {
    const compressedHistory = [
      { role: 'system' as const, content: `【对话历史摘要】${summary}` },
      ...recentMessages,
    ];
    return { history: compressedHistory, compressed: true };
  }
  
  // 压缩失败，返回最近的消息
  return { history: recentMessages, compressed: false };
}

// 纯智能问答（不使用工具，不检索）
async function simpleQA(
  message: string, 
  history: any[],
  enableThinking: boolean = false
): Promise<{ 
  answer: string; 
  steps: any[]; 
  sources: any[];
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  thinking?: string;
}> {
  const llm = getLLM();
  
  // 获取相关记忆
  const memories = await getRelevantMemories(5);
  const memoryContext = memories.length > 0 
    ? `\n\n【用户记忆】\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    : '';
  
  // 获取激活的提示词模板
  const activeTemplate = await getActiveTemplate();
  const basePrompt = activeTemplate?.content || '你是智知，一个专业的企业知识库智能问答助手。请直接回答用户的问题，回答要简洁、准确、有帮助。';
  
  let systemPrompt = `${basePrompt}${memoryContext}`;
  if (enableThinking) {
    systemPrompt = `${basePrompt}
在回答用户问题之前，请先在 <think> 标签中写出你的思考过程（分析问题、推理步骤、计算过程等），然后再给出最终答案。
格式要求：
<think>
这里写思考过程...
</think>
这里写最终答案...${memoryContext}`;
  }
  
  const messages = [
    new SystemMessage(systemPrompt),
    ...history.slice(-6).map((m: any) => 
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(message),
  ];
  
  const response = await llm.invoke(messages);
  let answer = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  
  // 解析思考内容
  let thinking: string | undefined;
  if (enableThinking) {
    const result = extractThinking(answer);
    thinking = result.thinking;
    answer = result.answer;
  }
  
  // 从 LangChain 响应中提取 token 用量（兼容多种属性路径，通义千问用 estimatedTokenUsage）
  const respAny = response as any;
  const rm = respAny?.response_metadata || {};
  const usage = rm.tokenUsage 
    || rm.estimatedTokenUsage 
    || respAny?.responseMetadata?.tokenUsage 
    || respAny?.responseMetadata?.estimatedTokenUsage
    || respAny?.kwargs?.response_metadata?.tokenUsage
    || respAny?.kwargs?.response_metadata?.estimatedTokenUsage
    || respAny?.usage 
    || {};
  const promptTokens = usage.promptTokens || usage.prompt_tokens || 0;
  const completionTokens = usage.completionTokens || usage.completion_tokens || 0;
  
  return {
    answer,
    steps: [{ type: 'qa', content: '智能问答模式：直接生成回答' }],
    sources: [],
    tokenUsage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    thinking,
  };
}

// 流式智能问答（真流式输出）
async function* simpleQAStream(
  message: string,
  history: any[],
  enableThinking: boolean = false
): AsyncGenerator<{ type: string; content?: string; thinking?: string; tokenUsage?: any }> {
  const llm = getLLM();
  
  // 获取相关记忆
  const memories = await getRelevantMemories(5);
  const memoryContext = memories.length > 0 
    ? `\n\n【用户记忆】\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    : '';
  
  // 获取激活的提示词模板
  const activeTemplate = await getActiveTemplate();
  const basePrompt = activeTemplate?.content || '你是智知，一个专业的企业知识库智能问答助手。请直接回答用户的问题，回答要简洁、准确、有帮助。';
  
  let systemPrompt = `${basePrompt}${memoryContext}`;
  if (enableThinking) {
    systemPrompt = `${basePrompt}
在回答用户问题之前，请先在 <think> 标签中写出你的思考过程（分析问题、推理步骤、计算过程等），然后再给出最终答案。
格式要求：
<think>
这里写思考过程...
</think>
这里写最终答案...${memoryContext}`;
  }
  
  const messages = [
    new SystemMessage(systemPrompt),
    ...history.slice(-6).map((m: any) => 
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(message),
  ];
  
  try {
    // 使用真流式输出
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
    
    // 解析思考内容
    let thinking: string | undefined;
    let answer = fullContent;
    if (enableThinking) {
      const result = extractThinking(fullContent);
      thinking = result.thinking;
      answer = result.answer;
    }
    
    // 提取 token 用量
    const respAny = lastChunk as any;
    const rm = respAny?.response_metadata || {};
    const usage = rm.tokenUsage 
      || rm.estimatedTokenUsage 
      || respAny?.responseMetadata?.tokenUsage 
      || respAny?.responseMetadata?.estimatedTokenUsage
      || respAny?.kwargs?.response_metadata?.tokenUsage
      || respAny?.kwargs?.response_metadata?.estimatedTokenUsage
      || respAny?.usage 
      || {};
    const promptTokens = usage.promptTokens || usage.prompt_tokens || 0;
    const completionTokens = usage.completionTokens || usage.completion_tokens || 0;
    
    if (thinking) {
      yield { type: 'thinking', thinking };
    }
    yield { 
      type: 'done', 
      tokenUsage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } 
    };
  } catch (error) {
    console.error('QA流式生成失败:', error);
    yield { 
      type: 'error', 
      content: error instanceof Error ? error.message : String(error) 
    };
    yield { type: 'done', tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  }
}

// 非流式对话
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { message, sessionId, mode, useAgent, enableThinking, modelParams } = req.body;

    if (!message) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }

    if (!isLLMConfigured()) {
      return res.status(500).json({ error: 'LLM API Key 未配置，请在 .env 文件中设置 LLM_API_KEY' });
    }

    // 应用本次请求的模型参数覆盖
    setRequestParams((modelParams as ModelParams) || null);

    // 兼容旧参数：useAgent=true -> agent, useAgent=false -> qa
    let actualMode = mode || (useAgent ? 'agent' : 'qa');
    if (!['qa', 'agent', 'plan', 'multi'].includes(actualMode)) {
      actualMode = 'agent';
    }

    // 获取或创建会话
    const sid = sessionId || (await createSession()).id;

    // 获取历史消息（自动压缩长对话）
    const { history, compressed } = await getCompressedHistory(sid);

    // 添加用户消息
    const userMessageId = await addMessage(sid, 'user', message, actualMode);
    
    let result;
    const modelInfo = getCurrentModel();
    
    if (actualMode === 'qa') {
      result = await simpleQA(message, history, enableThinking || false);
    } else if (actualMode === 'agent') {
      result = await agentRun(message, history, { sessionId: sid, messageId: userMessageId });
    } else if (actualMode === 'multi') {
      // 多Agent协作模式
      const multiResult = await multiAgentRun(message, history);
      result = {
        answer: multiResult.answer,
        steps: multiResult.steps,
        sources: [],
        plan: multiResult.plan,
        agentTrace: multiResult.agentTrace,
        tokenUsage: multiResult.tokenUsage,
      };
    } else {
      // plan模式
      const planResult = await planRun(message, history);
      result = {
        answer: planResult.finalAnswer,
        steps: planResult.steps,
        sources: [],
        plan: planResult.plan,
        tokenUsage: planResult.tokenUsage,
      };
    }
    
    // 添加助手回复（含复杂字段）
    const assistantMessageId = await addMessage(sid, 'assistant', result.answer, actualMode, {
      toolCalls: (result as any).steps?.filter((s: any) => s.type === 'tool_call').map((s: any) => s.toolCall) || [],
      sources: (result as any).sources || [],
      thinking: (result as any).thinking,
      plan: (result as any).plan,
      agentTrace: (result as any).agentTrace,
      tokenUsage: (result as any).tokenUsage,
    });
    
    // 记录 Token 用量
    const tokenUsage = (result as any).tokenUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    await recordUsage(
      sid,
      assistantMessageId,
      modelInfo.name,
      tokenUsage.promptTokens || 0,
      tokenUsage.completionTokens || 0,
      tokenUsage.totalTokens || 0
    ).catch(err => console.warn('记录Token用量失败:', err));

    setRequestParams(null);
    setRequestModelOverride(null);
    res.json({
      sessionId: sid,
      answer: result.answer,
      steps: result.steps || [],
      sources: (result as any).sources || [],
      plan: (result as any).plan || null,
      agentTrace: (result as any).agentTrace || null,
      mode: actualMode,
      model: modelInfo,
      tokenUsage,
      thinking: (result as any).thinking || null,
      contextCompressed: compressed,
    });
    
    // 异步提取记忆（每5条消息提取一次，不阻塞响应）
    const sessionInfo = await getSessionInfo(sid);
    const msgCount = sessionInfo?.messageCount || 0;
    if (msgCount % 5 === 0) {
      extractMemories([
        { role: 'user', content: message },
        { role: 'assistant', content: result.answer },
      ], sid).catch(err => console.warn('提取记忆失败:', err));
    }
  } catch (error) {
    console.error('对话处理失败:', error);
    setRequestParams(null);
    setRequestModelOverride(null);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({ 
      error: '对话处理失败',
      ...(!isProd && { detail: error instanceof Error ? error.message : String(error) }),
    });
  }
});

// 流式对话（SSE）
router.post('/stream', async (req: Request, res: Response) => {
  try {
    const {
      message,
      sessionId,
      mode,
      useAgent,
      enableThinking: thinkingEnabled,
      parentId,
      branchId: clientBranchId,
      modelParams,
      isEdit,
      editMessageId,
      agentId,
      collectionIds,
      providerId,
      model: modelOverride,
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }

    if (!isLLMConfigured()) {
      return res.status(500).json({ error: 'LLM API Key 未配置' });
    }

    // 应用本次请求的模型参数覆盖（影响内部所有 getLLM() 调用）
    setRequestParams((modelParams as ModelParams) || null);
    // 功能10：按请求切换 provider / 模型（不传则使用当前默认百炼）
    setRequestModelOverride(providerId || modelOverride ? { providerId, modelName: modelOverride } : null);

    let actualMode = mode || (useAgent ? 'agent' : 'qa');
    if (!['qa', 'agent', 'plan', 'multi'].includes(actualMode)) {
      actualMode = 'agent';
    }

    const modelInfo = getCurrentModel();
    const enableThinking = thinkingEnabled || false;

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 获取或创建会话
    const sid = sessionId || (await createSession()).id;

    // 分支标识：优先使用前端传入，否则生成新分支
    const branchId: string = clientBranchId || uuidv4();

    let history: ChatMessage[];
    let userMessageId: string | undefined;

    if (isEdit && editMessageId) {
      // 编辑模式：不新增用户消息，历史截断到被编辑消息为止
      const branchMessages = await getSessionMessages(sid);
      const editIndex = branchMessages.findIndex(m => m.id === editMessageId);
      history = editIndex >= 0 ? branchMessages.slice(0, editIndex + 1) : branchMessages;
      userMessageId = editMessageId;
    } else {
      // 普通模式：获取当前活动分支历史，并写入用户消息
      history = await getSessionMessages(sid);
      userMessageId = await addMessage(sid, 'user', message, actualMode, {
        parentId: parentId || undefined,
        branchId,
      });
    }

    // 发送会话ID、模式、分支信息
    res.write(`data: ${JSON.stringify({ type: 'session_id', content: sid, mode: actualMode, branch_id: branchId, user_message_id: userMessageId })}\n\n`);
    
    if (actualMode === 'plan') {
      // Plan模式：非流式返回完整结果
      const planResult = await planRun(message, history);
      
      for (const step of planResult.steps) {
        res.write(`data: ${JSON.stringify(step)}\n\n`);
      }
      
      // 模拟流式输出最终回答
      const answer = planResult.finalAnswer;
      const chunks = answer.match(/.{1,5}/g) || [answer];
      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify({ type: 'token', content: chunk, sources: [] })}\n\n`);
        await new Promise(r => setTimeout(r, 20));
      }
      
      res.write(`data: ${JSON.stringify({ type: 'done', content: '', plan: planResult.plan })}\n\n`);
      await addMessage(sid, 'assistant', answer, 'plan', {
        plan: planResult.plan,
        tokenUsage: planResult.tokenUsage,
        parentId: userMessageId,
        branchId,
      });
      setRequestParams(null);
    setRequestModelOverride(null);
      setRequestModelOverride(null);
      res.end();
      return;
    }
    
    if (actualMode === 'multi') {
      // 多Agent模式：实时输出执行进度
      res.write(`data: ${JSON.stringify({ type: 'planning', content: '多Agent协作开始...' })}\n\n`);
      
      const multiResult = await multiAgentRun(message, history, (trace) => {
        // 实时输出每个 Agent 的执行进度
        res.write(`data: ${JSON.stringify({ type: 'agent_progress', agent: trace.agent, action: trace.action, content: trace.content })}\n\n`);
      });
      
      // 输出完整轨迹（供前端展示）
      res.write(`data: ${JSON.stringify({ type: 'agent_trace', agentTrace: multiResult.agentTrace })}\n\n`);
      
      // 模拟流式输出最终回答
      const answer = multiResult.answer;
      const chunks = answer.match(/.{1,3}/g) || [answer];
      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify({ type: 'token', content: chunk, sources: [] })}\n\n`);
        await new Promise(r => setTimeout(r, 20));
      }
      
      res.write(`data: ${JSON.stringify({ type: 'done', content: '', agentTrace: multiResult.agentTrace, tokenUsage: multiResult.tokenUsage })}\n\n`);
      await addMessage(sid, 'assistant', answer, 'multi', {
        agentTrace: multiResult.agentTrace,
        tokenUsage: multiResult.tokenUsage,
        parentId: userMessageId,
        branchId,
      });
      
      // 记录 Token 用量
      if (multiResult.tokenUsage) {
        recordUsage(sid, undefined, modelInfo.name, multiResult.tokenUsage.promptTokens, multiResult.tokenUsage.completionTokens, multiResult.tokenUsage.totalTokens).catch(() => {});
      }
      
      setRequestParams(null);
    setRequestModelOverride(null);
      setRequestModelOverride(null);
      res.end();
      return;
    }
    
    if (actualMode === 'qa') {
      // QA模式：真流式输出
      res.write(`data: ${JSON.stringify({ type: 'qa', content: '智能问答模式' })}\n\n`);
      
      const qaStream = simpleQAStream(message, history, enableThinking || false);
      let fullAnswer = '';
      let qaThinking: string | undefined;
      let qaTokenUsage: any = null;
      
      for await (const chunk of qaStream) {
        if (chunk.type === 'token') {
          fullAnswer += chunk.content || '';
        }
        if (chunk.type === 'thinking') {
          qaThinking = chunk.thinking;
        }
        if (chunk.type === 'done') {
          qaTokenUsage = chunk.tokenUsage;
        }
        res.write(`data: ${JSON.stringify({ ...chunk, sources: [] })}\n\n`);
      }
      
      await addMessage(sid, 'assistant', fullAnswer, 'qa', {
        thinking: qaThinking,
        sources: [],
        tokenUsage: qaTokenUsage,
        parentId: userMessageId,
        branchId,
      });
      
      // 记录 Token 用量
      if (qaTokenUsage) {
        recordUsage(sid, undefined, modelInfo.name, qaTokenUsage.promptTokens, qaTokenUsage.completionTokens, qaTokenUsage.totalTokens).catch(() => {});
      }
      
      setRequestParams(null);
    setRequestModelOverride(null);
      setRequestModelOverride(null);
      res.end();
      return;
    }
    
    // Agent模式：使用原有流式
    // 加载自定义Agent配置（如果指定了agentId）
    let customAgentConfig: CustomAgentConfig | undefined;
    if (agentId) {
      const customAgent = await getAgent(agentId);
      if (customAgent) {
        customAgentConfig = {
          systemPrompt: customAgent.systemPrompt,
          tools: customAgent.tools,
          model: customAgent.model || undefined,
          temperature: customAgent.temperature,
        };
      }
    }
    const stream = agentRunStream(message, history, customAgentConfig, { collectionIds: Array.isArray(collectionIds) ? collectionIds : undefined });
    
    let fullAnswer = '';
    let agentTokenUsage: any = null;
    const agentToolCalls: any[] = [];
    
    for await (const chunk of stream) {
      if (chunk.type === 'token') {
        fullAnswer += chunk.content;
      }
      if (chunk.type === 'tool_call') {
        agentToolCalls.push(chunk.toolCall);
      }
      if (chunk.type === 'done' && chunk.tokenUsage) {
        agentTokenUsage = chunk.tokenUsage;
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    
    await addMessage(sid, 'assistant', fullAnswer, 'agent', {
      toolCalls: agentToolCalls,
      tokenUsage: agentTokenUsage,
      parentId: userMessageId,
      branchId,
    });
    
    // 记录 Token 用量
    if (agentTokenUsage) {
      recordUsage(sid, undefined, modelInfo.name, agentTokenUsage.promptTokens, agentTokenUsage.completionTokens, agentTokenUsage.totalTokens).catch(() => {});
    }
    
    setRequestParams(null);
    setRequestModelOverride(null);
    res.end();
  } catch (error) {
    console.error('流式对话失败:', error);
    setRequestParams(null);
    setRequestModelOverride(null);
    res.write(`data: ${JSON.stringify({ type: 'error', content: error instanceof Error ? error.message : String(error) })}\n\n`);
    res.end();
  }
});

// 图片理解接口（多模态，使用 qwen3.5-ocr 模型）
router.post('/vision', async (req: Request, res: Response) => {
  try {
    const { image, question, sessionId } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: '图片数据不能为空' });
    }
    
    // 图片大小限制（5MB）
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const sizeKB = (base64Data.length * 0.75) / 1024;
    if (sizeKB > 5120) {
      return res.status(400).json({ error: '图片大小不能超过5MB' });
    }
    
    if (!isLLMConfigured()) {
      return res.status(500).json({ error: 'LLM API Key 未配置' });
    }
    
    // 使用 qwen3.5-ocr 多模态模型
    const visionLLM = new ChatOpenAI({
      openAIApiKey: process.env.LLM_API_KEY,
      configuration: { baseURL: process.env.LLM_BASE_URL },
      modelName: 'qwen3.5-ocr',
      temperature: 0.1,
      maxTokens: 1024,
    });
    
    // 构建消息内容（文本 + 图片）
    const content = [
      { type: 'text', text: question || '请描述这张图片的内容' },
      { type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/png;base64,${image}` } },
    ];
    
    const response = await visionLLM.invoke([new HumanMessage({ content })]);
    const answer = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    
    // 如果有会话ID，保存到会话历史
    if (sessionId) {
      await addMessage(sessionId, 'user', `[图片] ${question || '描述图片'}`);
      await addMessage(sessionId, 'assistant', answer);
    }
    
    // 提取 token 用量
    const respAny = response as any;
    const rm = respAny?.response_metadata || {};
    const usage = rm.tokenUsage || rm.estimatedTokenUsage || respAny?.usage || {};
    const tokenUsage = {
      promptTokens: usage.promptTokens || usage.prompt_tokens || 0,
      completionTokens: usage.completionTokens || usage.completion_tokens || 0,
      totalTokens: (usage.promptTokens || usage.prompt_tokens || 0) + (usage.completionTokens || usage.completion_tokens || 0),
    };
    
    res.json({
      answer,
      model: 'qwen3.5-ocr',
      tokenUsage,
    });
  } catch (error) {
    console.error('图片理解失败:', error);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: '图片理解失败',
      detail: isProd ? undefined : error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
