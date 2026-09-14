import { Router, Request, Response } from 'express';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getLLMForProvider, findModel } from '../services/llmProvider';
import { isLLMConfigured, type ModelParams } from '../services/llm';

const router = Router();

interface CompareTarget {
  model: string;
  providerId?: string;
}

const COMPARE_TIMEOUT_MS = 180000; // 每个模型独立超时 3 分钟

function extractTokenUsage(lastChunk: any) {
  const rm = lastChunk?.response_metadata || {};
  const usage =
    rm.tokenUsage ||
    rm.estimatedTokenUsage ||
    lastChunk?.responseMetadata?.tokenUsage ||
    lastChunk?.responseMetadata?.estimatedTokenUsage ||
    lastChunk?.usage ||
    {};
  const promptTokens = usage.promptTokens || usage.prompt_tokens || 0;
  const completionTokens = usage.completionTokens || usage.completion_tokens || 0;
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

// 单个模型流式生成，逐 token 写入 SSE
async function runOne(
  target: CompareTarget,
  message: string,
  params: ModelParams | undefined,
  res: Response,
  index: number
) {
  const start = Date.now();
  let full = '';
  let lastChunk: any = null;
  try {
    // 解析模型显示名
    const found = findModel(target.model);
    const modelLabel = found?.resolved.name || target.model;

    const llm = getLLMForProvider(target.providerId, target.model, params);
    const messages = [
      new SystemMessage('你是一个专业的助手。请直接回答用户的问题，回答要准确、有帮助。'),
      new HumanMessage(message),
    ];

    // 每个模型独立超时
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('生成超时')), COMPARE_TIMEOUT_MS)
    );

    const streamTask = (async () => {
      const stream = await llm.stream(messages);
      for await (const chunk of stream) {
        lastChunk = chunk;
        const content = typeof chunk.content === 'string' ? chunk.content : '';
        if (content) {
          full += content;
          res.write(
            `data: ${JSON.stringify({
              type: 'compare_token',
              index,
              model: target.model,
              providerId: target.providerId || found?.resolved.providerId || 'bailian',
              modelLabel,
              content,
            })}\n\n`
          );
        }
      }
    })();

    await Promise.race([streamTask, timeoutPromise]);

    const tokenUsage = extractTokenUsage(lastChunk);
    res.write(
      `data: ${JSON.stringify({
        type: 'compare_done',
        index,
        model: target.model,
        providerId: target.providerId || found?.resolved.providerId || 'bailian',
        modelLabel,
        answer: full,
        tokenUsage,
        elapsedMs: Date.now() - start,
      })}\n\n`
    );
  } catch (error: any) {
    res.write(
      `data: ${JSON.stringify({
        type: 'compare_done',
        index,
        model: target.model,
        providerId: target.providerId || 'bailian',
        modelLabel: target.model,
        answer: full,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - start,
      })}\n\n`
    );
  }
}

// 模型对比（SSE 多流并行）
router.post('/compare', async (req: Request, res: Response) => {
  try {
    const { message, models, modelParams } = req.body as {
      message: string;
      models: CompareTarget[];
      modelParams?: ModelParams;
    };

    if (!message || !message.trim()) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }
    if (!Array.isArray(models) || models.length === 0) {
      return res.status(400).json({ error: '请至少选择一个对比模型' });
    }
    if (models.length > 4) {
      return res.status(400).json({ error: '最多同时对比 4 个模型' });
    }
    if (!isLLMConfigured()) {
      return res.status(500).json({ error: 'LLM API Key 未配置' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 下发对比元信息
    res.write(
      `data: ${JSON.stringify({
        type: 'compare_start',
        message,
        targets: models.map((m, i) => ({ index: i, model: m.model, providerId: m.providerId })),
      })}\n\n`
    );

    // 并行执行所有模型
    await Promise.all(
      models.map((target, i) => runOne(target, message, modelParams, res, i))
    );

    res.write(`data: ${JSON.stringify({ type: 'compare_all_done' })}\n\n`);
    res.end();
  } catch (error) {
    console.error('模型对比失败:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: '模型对比失败' });
    }
    res.write(
      `data: ${JSON.stringify({ type: 'error', content: error instanceof Error ? error.message : String(error) })}\n\n`
    );
    res.end();
  }
});

export default router;
