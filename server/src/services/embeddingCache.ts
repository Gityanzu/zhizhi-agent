/**
 * embeddingCache.ts — Embedding 内容缓存
 *
 * sha256(模型名+内容) → 向量。作用：
 *   1. 省钱：同一文档重传/重建索引、重试场景不再重复调 embedding API
 *   2. 提速：重建索引/上传失败重试时命中缓存直接返回
 *
 * 存储：内存 Map + 磁盘 JSON（原子替换，进程重启后仍命中）。
 * 容量上限：超过 MAX_ENTRIES 时整表清空重建（重建成本远小于全量 re-embed）。
 * 注意：缓存键包含模型名——更换 embedding 模型后自动全部失效，不会错配维度。
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { config } from '../config';

const MAX_ENTRIES = 50_000;

const cacheFile = path.join(
  path.dirname(config.chroma.persistDirectory),
  'embedding_cache.json'
);

let cache: Map<string, number[]> | null = null;
let dirty = false;
let persistChain: Promise<void> = Promise.resolve();

function load(): Map<string, number[]> {
  if (cache) return cache;
  cache = new Map();
  try {
    if (fs.existsSync(cacheFile)) {
      const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (raw && typeof raw === 'object' && raw.model && Array.isArray(raw.entries)) {
        // 模型不一致 → 全部失效（维度都可能不同）
        if (raw.model === config.llm.embeddingModelName) {
          for (const [k, v] of raw.entries) cache.set(k, v);
          console.log(`[embeddingCache] 已加载 ${cache.size} 条向量缓存`);
        } else {
          console.log(`[embeddingCache] 模型已更换（${raw.model} → ${config.llm.embeddingModelName}），缓存全量失效`);
        }
      }
    }
  } catch (e) {
    console.warn('[embeddingCache] 加载失败，使用空缓存:', e);
  }
  return cache!;
}

function cacheKey(model: string, text: string): string {
  return createHash('sha256').update(`${model}::${text}`).digest('hex');
}

/** 批量查询缓存：返回 { hits: Map<index, vector>, misses: number[] } */
export function lookupBatch(model: string, texts: string[]): {
  hits: Map<number, number[]>;
  misses: number[];
} {
  const c = load();
  const hits = new Map<number, number[]>();
  const misses: number[] = [];
  texts.forEach((t, i) => {
    const v = c.get(cacheKey(model, t));
    if (v) hits.set(i, v);
    else misses.push(i);
  });
  return { hits, misses };
}

/** 批量写缓存（内存 + 异步落盘） */
export function storeBatch(model: string, texts: string[], vectors: number[][]): void {
  const c = load();
  for (let i = 0; i < texts.length; i++) {
    c.set(cacheKey(model, texts[i]), vectors[i]);
  }
  // 容量兜底：直接清空重建（缓存本就是加速层，丢了只是多花一次 API 费）
  if (c.size > MAX_ENTRIES) {
    console.warn(`[embeddingCache] 超过 ${MAX_ENTRIES} 条上限，清空重建`);
    c.clear();
  }
  dirty = true;
  schedulePersist();
}

function schedulePersist(): void {
  persistChain = persistChain.then(async () => {
    if (!dirty) return;
    dirty = false;
    try {
      const c = load();
      const payload = JSON.stringify({
        model: config.llm.embeddingModelName,
        savedAt: new Date().toISOString(),
        entries: Array.from(c.entries()),
      });
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, payload, 'utf-8');
      fs.renameSync(tmp, cacheFile);
    } catch (e) {
      console.warn('[embeddingCache] 落盘失败:', e);
    }
  });
}
