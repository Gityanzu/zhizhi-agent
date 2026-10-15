/**
 * rerank.ts — 真实重排序服务（对标 Dify/QAnything 的「召回 → 精排」两段式）
 *
 * 使用 DashScope gte-rerank-v2（与 LLM 同一 API Key，零新增依赖）：
 *   RRF 召回融合出 topK*2 候选 → rerank 精排 → 取 topK。
 * 调用失败由调用方（vectorStore.hybridSearch）捕获并降级为 RRF 排序，不阻断检索。
 *
 * 端点推导：LLM_BASE_URL 默认 https://dashscope.aliyuncs.com/compatible-mode/v1
 *           → 去掉 /compatible-mode/v1 → https://dashscope.aliyuncs.com/api/v1/services/rerank/...
 * 可用 RAG_RERANK_API_BASE 显式覆盖（接自建 bge-reranker 等兼容服务时用）。
 */
import { config } from '../config';
import type { RetrievalResult } from '../types';

const REQUEST_TIMEOUT_MS = 8000;

function deriveRerankEndpoint(): string {
  if (process.env.RAG_RERANK_API_BASE) {
    return `${process.env.RAG_RERANK_API_BASE.replace(/\/$/, '')}/services/rerank/text-rerank/text-rerank`;
  }
  const base = (config.llm.baseUrl || '').replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/$/, '');
  return `${base}/api/v1/services/rerank/text-rerank/text-rerank`;
}

/**
 * 对召回候选做精排，返回按相关度降序的 RetrievalResult（retrievalMethod='rerank'）。
 * 抛错表示 rerank 服务不可用，调用方应降级。
 */
export async function rerankDocuments(
  query: string,
  candidates: RetrievalResult[],
  topN: number
): Promise<RetrievalResult[]> {
  if (!candidates.length) return [];

  const apiKey = process.env.RAG_RERANK_API_KEY || config.llm.apiKey;
  if (!apiKey) throw new Error('未配置 rerank API Key');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(deriveRerankEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.rag.rerankModel,
        input: {
          query,
          documents: candidates.map((c) => c.content),
        },
        parameters: {
          return_documents: false,
          top_n: Math.min(topN, candidates.length),
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`rerank API HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data: any = await res.json();
    const results: Array<{ index: number; relevance_score: number }> =
      data?.output?.results || data?.results || [];

    return results
      .filter((r) => candidates[r.index])
      .map((r) => ({
        ...candidates[r.index],
        score: r.relevance_score,
        retrievalMethod: 'rerank' as const,
      }));
  } finally {
    clearTimeout(timer);
  }
}
