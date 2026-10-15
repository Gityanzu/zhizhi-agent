/**
 * queryRewrite.ts — 历史感知的检索 Query 改写（对标 LlamaIndex Query Transform）
 *
 * 多轮对话里用户常说「它怎么配置」「那第二种呢」——直接拿原句检索必然失败。
 * 这里用 LLM 把「问题 + 最近对话」改写成一句**独立、自包含**的检索 query；
 * 首轮对话（无历史）直接返回原句，零 LLM 开销。
 *
 * 失败静默降级为原句：改写是锦上添花，绝不能成为检索的故障点。
 */
import { config } from '../config';
import { getLLM } from './llm';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY_TURNS = 4;
const MAX_TURN_CHARS = 400;

export async function rewriteQueryForRetrieval(
  question: string,
  history: HistoryTurn[]
): Promise<string> {
  const recent = (history || [])
    .filter((h) => h.content && h.content.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((h) => `${h.role === 'user' ? '用户' : '助手'}: ${h.content.slice(0, MAX_TURN_CHARS)}`);

  // 首轮对话或无有效历史：原句已是自包含的，直接检索
  if (recent.length === 0) return question;

  const prompt = `你是一个检索查询改写器。根据最近的对话历史，把用户的最新问题改写成一句**独立、自包含、无指代**的检索查询，用于在知识库中做关键词与语义检索。

要求：
1. 补全指代（"它/这个/该方案"替换为其在历史中指代的具体对象）
2. 保留问题中的关键实体、术语、限定词
3. 只输出改写后的查询本身，不要解释、不要加引号
4. 如果问题本身已自包含，原样输出

最近对话：
${recent.join('\n')}

最新问题：${question}

改写后的检索查询：`;

  try {
    const llm = getLLM();
    const response = await llm.invoke([
      new SystemMessage('你是检索查询改写器，只输出改写后的查询本身。'),
      new HumanMessage(prompt),
    ]);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    const rewritten = content.trim().replace(/^["'「『]|["'」』]$/g, '').trim();
    // 防御：空输出或异常长输出（模型跑题）时回退原句
    if (!rewritten || rewritten.length > question.length * 6 || rewritten.length > 500) {
      return question;
    }
    return rewritten || question;
  } catch (err: any) {
    console.warn('[queryRewrite] 改写失败，使用原句检索:', err?.message || err);
    return question;
  }
}
