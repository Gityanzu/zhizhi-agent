import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getEmbeddings } from './llm';
import { config } from '../config';
import { RetrievalResult } from '../types';
import { query, usePostgres } from '../db';
import { rerankDocuments } from './rerank';

// ==================== 分词与 BM25（纯内存，无外部依赖） ====================

// 基础分词：中文按字符级，英文/数字按词
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  if (!text) return tokens;
  // 先按空白切分，再对每段处理：连续英文/数字作为一个 term，每个 CJK 字符单独作为 term
  const segments = text.toLowerCase().split(/[\s\u3000]+/);
  for (const seg of segments) {
    let buf = '';
    for (const ch of seg) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
        if (buf) { tokens.push(buf); buf = ''; }
        tokens.push(ch);
      } else if (/[a-z0-9]/.test(ch)) {
        buf += ch;
      } else {
        // 标点/符号：作为分隔
        if (buf) { tokens.push(buf); buf = ''; }
      }
    }
    if (buf) tokens.push(buf);
  }
  return tokens.filter(t => t.length > 0);
}

// BM25 索引/查询分词：中文单字 + 二元组（bigram）。
// 纯单字匹配噪声大（"配置"命中"设置"类内容），bigram 能表达词组又不需要分词器依赖。
export function tokenizeBigram(text: string): string[] {
  const tokens = tokenize(text);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    out.push(tokens[i]);
    const cur = tokens[i];
    const next = tokens[i + 1];
    // 相邻两个单字 CJK term 组成 bigram（英文整词 term 不参与）
    if (next && cur.length === 1 && next.length === 1) {
      out.push(cur + next);
    }
  }
  return out;
}

// 判断向量数据是否属于指定的集合过滤范围（不传/空数组 = 全部）
function inCollectionScope(metadata: Record<string, any>, collectionIds?: string[]): boolean {
  if (!collectionIds || collectionIds.length === 0) return true;
  const cid = metadata?.collectionId;
  if (!cid) return false;
  return collectionIds.includes(cid);
}

// 用查询关键词对内容生成高亮片段（<mark> 包裹命中词）
export function buildHighlightedContent(content: string, query: string, maxLen = 300): string {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || !content) return content.slice(0, maxLen);

  // 找出第一个命中词的位置，截取上下文片段
  let startIdx = -1;
  for (const tok of queryTokens) {
    const idx = content.toLowerCase().indexOf(tok.toLowerCase());
    if (idx >= 0 && (startIdx === -1 || idx < startIdx)) {
      startIdx = idx;
    }
  }
  let snippet = content;
  if (startIdx >= 0) {
    const half = Math.floor(maxLen / 2);
    const s = Math.max(0, startIdx - half);
    snippet = content.slice(s, s + maxLen);
  } else {
    snippet = content.slice(0, maxLen);
  }

  // 对命中词加 <mark> 高亮（长词优先，避免被短词重复包裹）
  const sortedTokens = [...new Set(queryTokens)].sort((a, b) => b.length - a.length);
  let html = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  for (const tok of sortedTokens) {
    if (!tok) continue;
    const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(escaped, 'gi'), (m) => `<mark>${m}</mark>`);
  }
  return html;
}

// 向量数据结构
export interface VectorData {
  id: string;
  content: string;
  vector: number[];
  metadata: Record<string, any>;
}

// ==================== Embedding 批处理（分批 + 指数退避重试） ====================

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedBatchWithRetry(embeddings: any, texts: string[]): Promise<number[][]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < Math.max(1, config.rag.embedMaxRetries); attempt++) {
    try {
      return await embeddings.embedDocuments(texts);
    } catch (e) {
      lastErr = e;
      if (attempt < config.rag.embedMaxRetries - 1) {
        await sleep(500 * Math.pow(2, attempt)); // 0.5s / 1s / 2s
      }
    }
  }
  throw lastErr;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 简单的本地向量存储（内存 + PG/JSON 文件持久化）
class LocalVectorStore {
  private data: VectorData[] = [];
  private persistPath: string;
  private initialized = false;
  private pgVectorChecked = false;
  private usePgVector = false;

  // 数据版本号：任何增删都会自增，用于使 BM25 倒排缓存失效
  private dataVersion = 0;

  // BM25 倒排缓存：构建一次，查询 O(命中)；数据变更后按版本重建
  private bm25Cache: {
    version: number;
    df: Map<string, number>;
    postings: Map<string, Array<{ idx: number; tf: number }>>;
    docLen: number[];
    avgLen: number;
  } | null = null;

  // 持久化串行链：并发写入排队执行，避免 JSON 全量重写互相覆盖丢数据
  private persistChain: Promise<void> = Promise.resolve();

  constructor(persistDir: string) {
    if (!fs.existsSync(persistDir)) {
      fs.mkdirSync(persistDir, { recursive: true });
    }
    this.persistPath = path.join(persistDir, 'vectors.json');
  }

  // 初始化（从 PG 或文件加载）
  async init(): Promise<void> {
    if (this.initialized) return;

    if (usePostgres) {
      try {
        const result = await query('SELECT id, content, vector, metadata FROM vectors');
        this.data = result.rows.map((row: any) => ({
          id: row.id,
          content: row.content,
          vector: row.vector,
          metadata: row.metadata || {},
        }));
        console.log(`向量存储已从 PG 加载: ${this.data.length} 条向量`);
      } catch (error) {
        console.warn('从 PG 加载向量存储失败，将创建新存储:', error);
        this.data = [];
      }
    } else if (fs.existsSync(this.persistPath)) {
      try {
        const raw = fs.readFileSync(this.persistPath, 'utf-8');
        this.data = JSON.parse(raw);
        console.log(`向量存储已从文件加载: ${this.data.length} 条向量`);
      } catch (error) {
        console.warn('加载向量存储失败，将创建新存储:', error);
        this.data = [];
      }
    }
    this.initialized = true;
  }

  // 持久化（PG 模式写入数据库，否则写文件）
  // 串行化 + 原子替换（tmp + rename）：并发调用排队执行，写一半崩溃不会损坏整个文件
  private persist(): void {
    if (usePostgres) return; // PG 模式下在 addTexts/delete 中直接操作数据库
    this.persistChain = this.persistChain.then(async () => {
      try {
        const tmp = `${this.persistPath}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf-8');
        fs.renameSync(tmp, this.persistPath);
      } catch (err) {
        console.error('向量存储持久化失败:', err);
      }
    });
  }

  // 检查规模护栏（超限直接抛错，防止单文档/全库把内存与 embedding 费用打爆）
  private checkGuardrails(incoming: number, docId?: string): void {
    if (incoming > config.rag.maxChunksPerDoc) {
      throw new Error(`文档分块数 ${incoming} 超过单文档上限 ${config.rag.maxChunksPerDoc}，请拆分文档后上传`);
    }
    if (this.data.length + incoming > config.rag.maxTotalChunks) {
      throw new Error(`知识库总块数将达到 ${this.data.length + incoming}，超过全库上限 ${config.rag.maxTotalChunks}，请清理旧文档`);
    }
    // 重传同名覆盖场景：旧的将被删除，剩余空间按删除后计算
    if (docId) {
      const oldCount = this.getByDocId(docId).length;
      if (oldCount > 0 && this.data.length - oldCount + incoming > config.rag.maxTotalChunks) {
        throw new Error(`替换文档后总块数将超过全库上限 ${config.rag.maxTotalChunks}`);
      }
    }
  }

  // 添加文本（先全部 embedding 成功再入库：任一批失败即整体失败，天然回滚）
  async addTexts(texts: string[], metadatas: Record<string, any>[]): Promise<void> {
    if (texts.length === 0) return;
    const docId = metadatas[0]?.docId as string | undefined;
    this.checkGuardrails(texts.length, docId);
    const embeddings = getEmbeddings();

    // 1. 分批向量化：每批一次 API 调用 + 指数退避重试；全部成功才继续
    const batchSize = Math.max(1, config.rag.embedBatchSize);
    const vectors: number[][] = [];
    for (const batch of chunkArray(texts, batchSize)) {
      const batchVectors = await embedBatchWithRetry(embeddings, batch);
      vectors.push(...batchVectors);
    }

    const items: VectorData[] = texts.map((t, i) => ({
      id: uuidv4(),
      content: t,
      vector: vectors[i],
      metadata: metadatas[i] || {},
    }));

    // 2. PG 批量写入（多值单语句，失败抛错不入内存）
    if (usePostgres) {
      await this.pgInsertBatch(items);
    }

    // 3. 提交到内存并持久化
    this.data.push(...items);
    this.dataVersion++;
    this.bm25Cache = null;
    this.persist();
  }

  // PG 批量插入（每 100 行一条多值 INSERT，避免参数上限）
  private async pgInsertBatch(items: VectorData[]): Promise<void> {
    if (!this.pgVectorChecked) {
      const colCheck = await query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vectors' AND column_name = 'embedding'
      `);
      this.usePgVector = colCheck.rows.length > 0;
      this.pgVectorChecked = true;
    }

    for (const group of chunkArray(items, 100)) {
      const values: string[] = [];
      const params: any[] = [];
      let p = 0;
      for (const item of group) {
        const meta = JSON.stringify(item.metadata || {});
        if (this.usePgVector) {
          params.push(item.id, item.content, `[${item.vector.join(',')}]`, meta);
          values.push(`($${p + 1}, $${p + 2}, $${p + 3}::vector, $${p + 4})`);
        } else {
          params.push(item.id, item.content, JSON.stringify(item.vector), meta);
          values.push(`($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4})`);
        }
        p += 4;
      }
      const sql = `INSERT INTO vectors (id, content, ${this.usePgVector ? 'embedding' : 'vector'}, metadata) VALUES ${values.join(', ')}`;
      try {
        await query(sql, params);
      } catch (err) {
        console.error('向量批量写入 PG 失败:', err);
        throw new Error('向量入库失败（PG 写入错误），文档未入库，请重试');
      }
    }
  }

  // 余弦相似度计算
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // 作用域过滤：集合 + （可选）用户隔离。
  // userId 显式传入或 config.rag.enforceUserIsolation 开启时，强制 metadata.userId 匹配。
  private matchesScope(
    metadata: Record<string, any>,
    collectionIds?: string[],
    userId?: string
  ): boolean {
    if (userId && metadata?.userId !== userId) return false;
    if (config.rag.enforceUserIsolation && !userId) return false; // 强制隔离但调用方未提供归属 → 拒绝（fail-closed）
    return inCollectionScope(metadata, collectionIds);
  }

  // 相似度检索（向量召回）
  async similaritySearch(
    queryText: string,
    topK: number = 5,
    collectionIds?: string[],
    userId?: string
  ): Promise<RetrievalResult[]> {
    if (this.data.length === 0) return [];

    const embeddings = getEmbeddings();
    const queryVector = await embeddings.embedQuery(queryText);

    // 如果使用 PG 且 pgvector 可用，尝试用 PG 做相似度搜索
    if (usePostgres) {
      try {
        // 检测是否有 embedding 列（pgvector）
        const colCheck = await query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'vectors' AND column_name = 'embedding'
        `);
        if (colCheck.rows.length > 0) {
          const vectorStr = `[${queryVector.join(',')}]`;
          // 过滤：集合 + 用户隔离（metadata->>'userId'）
          const conditions: string[] = [];
          const params: any[] = [vectorStr];
          if (collectionIds && collectionIds.length > 0) {
            params.push(collectionIds);
            conditions.push(`metadata->>'collectionId' = ANY($${params.length}::text[])`);
          }
          if (userId) {
            params.push(userId);
            conditions.push(`metadata->>'userId' = $${params.length}`);
          }
          const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
          params.push(topK);
          const result = await query(
            `SELECT content, metadata, 1 - (embedding <=> $1::vector) as score
             FROM vectors${whereSql} ORDER BY embedding <=> $1::vector LIMIT $${params.length}`,
            params
          );
          return result.rows.map((row: any) => this.buildRetrievalResult(row.content, row.score, row.metadata, queryText, 'vector'));
        }
      } catch (err) {
        console.warn('pgvector 搜索失败，回退到内存计算:', err);
      }
    }

    // 内存计算相似度（应用集合 + 用户过滤）
    const pool = this.data.filter(item => this.matchesScope(item.metadata, collectionIds, userId));
    if (pool.length === 0) return [];

    const scored = pool.map(item => ({
      ...item,
      score: this.cosineSimilarity(queryVector, item.vector),
    }));

    // 按相似度降序排序
    scored.sort((a, b) => b.score - a.score);

    // 返回TopK
    return scored.slice(0, topK).map(item =>
      this.buildRetrievalResult(item.content, item.score, item.metadata, queryText, 'vector')
    );
  }

  // 统一构造 RetrievalResult（补齐 chunkIndex / page / highlightedContent / retrievalMethod）
  private buildRetrievalResult(
    content: string,
    score: number,
    metadata: Record<string, any>,
    queryText: string,
    retrievalMethod: 'vector' | 'bm25' | 'hybrid' | 'rerank'
  ): RetrievalResult {
    const chunkIndex = metadata?.chunkIndex !== undefined ? Number(metadata.chunkIndex) : undefined;
    const page = metadata?.page !== undefined ? Number(metadata.page) : undefined;
    return {
      content,
      source: metadata?.source || 'unknown',
      score,
      metadata,
      chunkIndex,
      page,
      highlightedContent: buildHighlightedContent(content, queryText),
      retrievalMethod,
    };
  }

  // ==================== BM25（倒排索引缓存版） ====================

  // 构建倒排索引：df + postings，查询从 O(N×M) 降为 O(查询词的命中集)
  private buildBm25Index(): void {
    const docLen: number[] = new Array(this.data.length);
    const df = new Map<string, number>();
    const postings = new Map<string, Array<{ idx: number; tf: number }>>();

    for (let i = 0; i < this.data.length; i++) {
      const tokens = tokenizeBigram(this.data[i].content);
      docLen[i] = tokens.length;
      const tfMap = new Map<string, number>();
      for (const t of tokens) tfMap.set(t, (tfMap.get(t) || 0) + 1);
      for (const [term, tf] of tfMap) {
        df.set(term, (df.get(term) || 0) + 1);
        let list = postings.get(term);
        if (!list) { list = []; postings.set(term, list); }
        list.push({ idx: i, tf });
      }
    }

    const avgLen = docLen.reduce((a, c) => a + c, 0) / (this.data.length || 1);
    this.bm25Cache = { version: this.dataVersion, df, postings, docLen, avgLen };
  }

  // BM25 检索（倒排索引 + 中文 bigram）
  bm25Search(
    queryText: string,
    topK: number = 5,
    collectionIds?: string[],
    userId?: string
  ): RetrievalResult[] {
    if (this.data.length === 0) return [];

    if (!this.bm25Cache || this.bm25Cache.version !== this.dataVersion) {
      this.buildBm25Index();
    }
    const { df, postings, docLen, avgLen } = this.bm25Cache!;
    const k1 = config.rag.bm25K1;
    const b = config.rag.bm25B;

    const queryTerms = [...new Set(tokenizeBigram(queryText))];
    if (queryTerms.length === 0) return [];

    // 取查询词的命中候选（倒排求并），逐候选打分
    const candidates = new Map<number, number>(); // idx -> score
    const N = this.data.length;
    for (const term of queryTerms) {
      const list = postings.get(term);
      if (!list || list.length === 0) continue;
      const n = df.get(term) || list.length;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      for (const { idx, tf } of list) {
        // 作用域过滤
        const meta = this.data[idx]?.metadata || {};
        if (!this.matchesScope(meta, collectionIds, userId)) continue;
        const dl = docLen[idx] || 0;
        const denom = tf + k1 * (1 - b + b * (dl / (avgLen || 1)));
        const contrib = idf * (tf * (k1 + 1)) / (denom || 1);
        candidates.set(idx, (candidates.get(idx) || 0) + contrib);
      }
    }

    // 排序取 TopK
    const ranked = Array.from(candidates.entries())
      .map(([idx, score]) => ({ item: this.data[idx], score }))
      .filter(r => r.score > 0 && r.item)
      .sort((a, b2) => b2.score - a.score);

    return ranked.slice(0, topK).map(({ item, score }) =>
      this.buildRetrievalResult(item.content, score, item.metadata, queryText, 'bm25')
    );
  }

  // 混合检索：向量 + BM25，RRF 召回融合；（可选）rerank 精排
  async hybridSearch(
    queryText: string,
    topK: number = 5,
    collectionIds?: string[],
    userId?: string
  ): Promise<RetrievalResult[]> {
    if (this.data.length === 0) return [];

    const rrfK = config.rag.rrfK;

    // 召回数放大：rerank 开启时多召回一些给精排，否则按原 topK*3
    const recallMultiplier = config.rag.rerankEnabled ? config.rag.rerankRecallMultiplier : 3;
    const recallK = Math.max(topK * recallMultiplier, 10);

    const [vectorResults, bm25Results] = await Promise.all([
      config.rag.useHybridSearch
        ? this.similaritySearch(queryText, recallK, collectionIds, userId).catch(() => [] as RetrievalResult[])
        : Promise.resolve([] as RetrievalResult[]),
      config.rag.useHybridSearch
        ? Promise.resolve(this.bm25Search(queryText, recallK, collectionIds, userId))
        : Promise.resolve([] as RetrievalResult[]),
    ]);

    // 非混合模式：直接走向量
    if (!config.rag.useHybridSearch) {
      return vectorResults;
    }

    // RRF 召回融合：score = sum(1 / (rrfK + rank))
    // 以 content 前 32 字符作为文档合并键（同一 chunk 可能两路都命中）
    const fuseKey = (r: RetrievalResult) => `${r.source}::${r.metadata?.chunkIndex ?? ''}::${r.content.slice(0, 32)}`;

    const fused = new Map<string, { rrfScore: number; item: RetrievalResult }>();
    const addRanking = (results: RetrievalResult[]) => {
      results.forEach((r, rank) => {
        const key = fuseKey(r);
        const contribution = 1 / (rrfK + rank + 1);
        const existing = fused.get(key);
        if (existing) {
          existing.rrfScore += contribution;
        } else {
          fused.set(key, { rrfScore: contribution, item: r });
        }
      });
    };
    addRanking(vectorResults);
    addRanking(bm25Results);

    const merged = Array.from(fused.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .map(({ rrfScore, item }) => ({
        ...item,
        score: rrfScore,
        retrievalMethod: 'hybrid' as const,
      }));

    // 真实 Rerank 精排：失败自动降级为 RRF 排序，不阻断检索
    if (config.rag.rerankEnabled && merged.length > 0) {
      try {
        const rerankTopN = Math.max(topK * 2, topK);
        const candidates = merged.slice(0, Math.max(rerankTopN, topK));
        const reranked = await rerankDocuments(queryText, candidates, rerankTopN);
        if (reranked.length > 0) {
          return reranked.slice(0, topK);
        }
      } catch (err: any) {
        console.warn('[rag] rerank 失败，降级为 RRF 排序:', err?.message || err);
      }
    }

    return merged.slice(0, topK);
  }

  // 按来源删除（代码库索引用：source = 目录绝对路径）
  async deleteBySource(source: string): Promise<void> {
    const toDelete = this.data.filter(item => item.metadata?.source === source);
    if (toDelete.length === 0) return;
    await this.removeItems(toDelete);
  }

  // 按文档 ID 删除（知识库文档的正确删除键：文件名会撞车，docId 不会）
  async deleteByDocId(docId: string): Promise<number> {
    const toDelete = this.data.filter(item => item.metadata?.docId === docId);
    if (toDelete.length === 0) return 0;
    await this.removeItems(toDelete);
    return toDelete.length;
  }

  // 公共删除实现：内存剔除 + PG 清理 + 持久化 + 版本失效
  private async removeItems(toDelete: VectorData[]): Promise<void> {
    const ids = new Set(toDelete.map(item => item.id));
    this.data = this.data.filter(item => !ids.has(item.id));
    this.dataVersion++;
    this.bm25Cache = null;

    if (usePostgres) {
      // 按主键批量删除（每 100 个一条多值 DELETE）
      for (const group of chunkArray(Array.from(ids), 100)) {
        const placeholders = group.map((_, i) => `$${i + 1}`).join(', ');
        await query(`DELETE FROM vectors WHERE id IN (${placeholders})`, group)
          .catch(err => console.error('从 PG 删除向量失败:', err));
      }
    }

    this.persist();
  }

  // 获取数量
  count(): number {
    return this.data.length;
  }

  // 清除指定知识库集合的向量关联（删除集合时调用）
  clearCollectionAssociation(collectionId: string): void {
    let changed = false;
    for (const item of this.data) {
      if (item.metadata?.collectionId === collectionId) {
        delete item.metadata.collectionId;
        changed = true;
      }
    }
    if (changed) {
      this.dataVersion++;
      this.bm25Cache = null;
      this.persist();
    }
  }

  // 按文档ID获取所有向量块
  getByDocId(docId: string): VectorData[] {
    return this.data.filter(item => item.metadata?.docId === docId);
  }
}

// 单例
let store: LocalVectorStore | null = null;

export function getVectorStore(): LocalVectorStore {
  if (!store) {
    store = new LocalVectorStore(config.chroma.persistDirectory);
  }
  return store;
}

export async function initVectorStore(): Promise<void> {
  const s = getVectorStore();
  await s.init();
}

export async function addDocuments(
  texts: string[],
  metadatas: Record<string, any>[]
): Promise<void> {
  const s = getVectorStore();
  await s.addTexts(texts, metadatas);
}

export async function similaritySearch(
  query: string,
  topK: number = config.rag.topK,
  collectionIds?: string[],
  userId?: string
): Promise<RetrievalResult[]> {
  const s = getVectorStore();
  return s.similaritySearch(query, topK, collectionIds, userId);
}

// 混合检索（向量 + BM25，RRF 召回融合 + 可选 rerank 精排）
export async function hybridSearch(
  query: string,
  topK: number = config.rag.topK,
  collectionIds?: string[],
  userId?: string
): Promise<RetrievalResult[]> {
  const s = getVectorStore();
  return s.hybridSearch(query, topK, collectionIds, userId);
}

export async function deleteDocumentsBySource(source: string): Promise<void> {
  const s = getVectorStore();
  await s.deleteBySource(source);
}

// 按文档 ID 删除向量（知识库文档删除的正确入口）
export async function deleteDocumentsByDocId(docId: string): Promise<number> {
  const s = getVectorStore();
  return s.deleteByDocId(docId);
}

export async function getDocumentCount(): Promise<number> {
  const s = getVectorStore();
  return s.count();
}

// 清除知识库集合的向量关联（删除集合时调用）
export function clearCollectionAssociation(collectionId: string): void {
  const s = getVectorStore();
  s.clearCollectionAssociation(collectionId);
}

export async function searchVectorsByDocId(docId: string): Promise<VectorData[]> {
  const s = getVectorStore();
  return s.getByDocId(docId);
}
