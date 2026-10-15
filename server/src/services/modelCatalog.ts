import { createHash } from 'crypto';
import type { ProviderModel } from './llmProvider';

/**
 * 厂商模型目录：向 OpenAI 兼容的 `GET {baseUrl}/models` 拉取真实模型清单，并做进程内缓存。
 *
 * 为什么需要它：内置的 BAILIAN_MODELS / DEEPSEEK_MODELS 是写死的静态清单，厂商上新模型
 * 必须改代码。这里让"能拉到就用拉到的"，拉不到就降级回内置清单，保证不因网络问题不可用。
 *
 * 缓存粒度只按 providerId：同一厂商的模型清单与用谁的 Key 无关，按 Key 分桶会导致
 * 用户自己拉的清单无法回流到全局列表（getProviders 是同步读缓存的）。
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

interface CacheEntry {
  models: ProviderModel[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * 明显不是对话/推理模型的 id。
 * 动态清单只做"补充不删除"，所以即使误伤（如 qwen3.5-ocr），静态清单里的条目依然保留。
 */
const NON_CHAT_PATTERN =
  /embedding|rerank|\btts\b|\basr\b|audio|speech|voice|\bocr\b|image|video|wanx|paraformer|sambert|cosyvoice|stable-|flux/i;

/** 把厂商返回的 id 列表清洗成可用的对话模型清单 */
export function filterChatModels(ids: unknown[]): ProviderModel[] {
  const seen = new Set<string>();
  const result: ProviderModel[] = [];
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    if (NON_CHAT_PATTERN.test(id)) continue;
    seen.add(id);
    result.push({ id, name: id, description: '由厂商接口动态获取' });
  }
  return result;
}

/** 同步读缓存（供 getProviders 这类同步路径使用）；过期或未拉取过返回 null */
export function getCachedModels(providerId: string): ProviderModel[] | null {
  const entry = cache.get(providerId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
  return entry.models;
}

/** 只用于测试：清空缓存 */
export function clearModelCatalogCache(): void {
  cache.clear();
}

/**
 * 拉取指定厂商的模型清单并写入缓存。
 * 失败不抛异常（调用方多为"锦上添花"的场景），返回 error 由上层决定是否提示用户。
 */
export async function fetchProviderModels(
  providerId: string,
  apiKey?: string,
  baseUrl?: string
): Promise<{ models: ProviderModel[]; error?: string }> {
  if (!baseUrl) return { models: [], error: '未配置厂商地址' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;

  try {
    const resp = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    if (!resp.ok) {
      return { models: [], error: `厂商返回 HTTP ${resp.status}` };
    }
    const data: any = await resp.json();
    const ids: unknown[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => m?.id)
      : Array.isArray(data?.models)
        ? data.models.map((m: any) => m?.model ?? m?.name)
        : [];

    const models = filterChatModels(ids);
    if (models.length === 0) {
      return { models: [], error: '厂商未返回可用的对话模型' };
    }
    cache.set(providerId, { models, fetchedAt: Date.now() });
    return { models };
  } catch (e: any) {
    const reason = e?.name === 'AbortError'
      ? `拉取模型列表超时（${FETCH_TIMEOUT_MS / 1000}s）`
      : (e?.message || String(e));
    return { models: [], error: reason };
  } finally {
    clearTimeout(timer);
  }
}

/** 供缓存键使用：Key 指纹（不把明文 Key 写进内存键） */
export function apiKeyFingerprint(apiKey?: string): string {
  if (!apiKey) return 'none';
  return createHash('sha1').update(apiKey).digest('hex').slice(0, 8);
}
