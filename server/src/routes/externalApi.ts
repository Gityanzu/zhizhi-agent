import { Router, Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../services/apiKey';
import { getLLM, isLLMConfigured } from '../services/llm';
import { getAvailableModels, getCurrentModel } from '../services/llm';
import { setRequestParams } from '../services/llm';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { ChatMessage } from '../types';

const router = Router();

// ===== 功能20：对外 API（OpenAI 兼容） =====

// API Key 鉴权中间件：Authorization: Bearer <key>
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: { message: '缺少 API Key，请在 Authorization 头中提供 Bearer <key>', type: 'invalid_request_error' } });
  }
  const record = await validateApiKey(match[1].trim());
  if (!record) {
    return res.status(401).json({ error: { message: '无效或已撤销的 API Key', type: 'invalid_request_error' } });
  }
  (req as any).apiKeyInfo = record;
  next();
}

// GET /api/v1/models
router.get('/models', authMiddleware, (req: Request, res: Response) => {
  const models = getAvailableModels() as Array<{ id: string; name: string; description?: string }>;
  const data = models.map(m => ({
    id: m.id,
    object: 'model',
    created: 0,
    owned_by: 'zhizhi-agent',
  }));
  res.json({ object: 'list', data });
});

// 将 OpenAI messages 转为 LangChain 消息
function toLangChainMessages(messages: Array<{ role: string; content: string }>) {
  return messages.map(m => {
    const role = (m.role || 'user').toLowerCase();
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    if (role === 'system') return new SystemMessage(content);
    if (role === 'assistant') return new AIMessage(content);
    return new HumanMessage(content);
  });
}

// POST /api/v1/chat/completions
router.post('/chat/completions', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!isLLMConfigured()) {
      return res.status(503).json({ error: { message: '服务端未配置 LLM，请联系管理员', type: 'server_error' } });
    }
    const { model, messages, stream, temperature, max_tokens } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: { message: 'messages 必须是非空数组', type: 'invalid_request_error' } });
    }

    // 应用请求级参数
    setRequestParams({
      temperature: typeof temperature === 'number' ? temperature : undefined,
      max_tokens: typeof max_tokens === 'number' ? max_tokens : undefined,
    });

    const lcMessages = toLangChainMessages(messages);
    const currentModel = getCurrentModel();
    const modelId = typeof model === 'string' && model ? model : currentModel.id;
    const now = Math.floor(Date.now() / 1000);

    try {
      if (stream) {
        // SSE 流式
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const llm = getLLM();
        const completionsModel = modelId;
        const streamObj = await llm.stream(lcMessages);
        let roleSent = false;
        for await (const chunk of streamObj) {
          const content: string = typeof chunk.content === 'string' ? chunk.content : '';
          const payload = {
            id: `chatcmpl-${now}`,
            object: 'chat.completion.chunk',
            created: now,
            model: completionsModel,
            choices: [
              {
                index: 0,
                delta: roleSent ? { content } : { role: 'assistant', content },
                finish_reason: null,
              },
            ],
          };
          roleSent = true;
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
        res.write(`data: ${JSON.stringify({
          id: `chatcmpl-${now}`,
          object: 'chat.completion.chunk',
          created: now,
          model: completionsModel,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        const llm = getLLM();
        const response = await llm.invoke(lcMessages);
        const content: string = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        res.json({
          id: `chatcmpl-${now}`,
          object: 'chat.completion',
          created: now,
          model: modelId,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            },
          ],
          usage: (response as any).usage_metadata
            ? {
                prompt_tokens: (response as any).usage_metadata.input_tokens || 0,
                completion_tokens: (response as any).usage_metadata.output_tokens || 0,
                total_tokens: (response as any).usage_metadata.total_tokens || 0,
              }
            : undefined,
        });
      }
    } finally {
      setRequestParams(null);
    }
  } catch (error) {
    console.error('对外 API 调用失败:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: error instanceof Error ? error.message : '生成失败', type: 'server_error' } });
    } else {
      try { res.end(); } catch { /* ignore */ }
    }
  }
});

export default router;
