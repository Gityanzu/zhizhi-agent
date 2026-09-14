import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getEmbeddings } from './llm';
import { config } from '../config';
import { RetrievalResult } from '../types';
import { query, usePostgres } from '../db';

// ==================== 分词与 BM25（纯内存，无外部依赖） ====================

// 中文按字符级分词，英文/数字按词分词
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
interface VectorData {
  id: string;
  content: string;
  vector: number[];
  metadata: Record<string, any>;
}

// 简单的本地向量存储（内存 + PG/JSON 文件持久化）
class LocalVectorStore {
  private data: VectorData[] = [];
  private persistPath: string;
  private initialized = false;
  private pgVectorChecked = false;
  private usePgVector = false;

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
  private persist(): void {
    if (usePostgres) return; // PG 模式下在 addTexts/deleteBySource 中直接操作数据库
    // 使用紧凑格式减少文件体积，异步写入避免阻塞
    const data = JSON.stringify(this.data);
    fs.writeFile(this.persistPath, data, 'utf-8', (err) => {
      if (err) console.error('向量存储持久化失败:', err);
    });
  }

  // 添加文本
  async addTexts(texts: string[], metadatas: Record<string, any>[]): Promise<void> {
    const embeddings = getEmbeddings();
    
    // 批量向量化
    const vectors = await embeddings.embedDocuments(texts);
    
    for (let i = 0; i < texts.length; i++) {
      const id = uuidv4();
      const item: VectorData = {
        id,
        content: texts[i],
        vector: vectors[i],
        metadata: metadatas[i] || {},
      };
      this.data.push(item);
      
      // PG 模式下写入数据库
      if (usePostgres) {
        try {
          // 检测是否有 embedding 列（pgvector）
          if (!this.pgVectorChecked) {
            const colCheck = await query(`
              SELECT column_name FROM information_schema.columns 
              WHERE table_name = 'vectors' AND column_name = 'embedding'
            `);
            this.usePgVector = colCheck.rows.length > 0;
            this.pgVectorChecked = true;
          }
          
          if (this.usePgVector) {
            const vectorStr = `[${vectors[i].join(',')}]`;
            await query(
              'INSERT INTO vectors (id, content, embedding, metadata) VALUES ($1, $2, $3::vector, $4)',
              [id, texts[i], vectorStr, JSON.stringify(metadatas[i] || {})]
            );
          } else {
            await query(
              'INSERT INTO vectors (id, content, vector, metadata) VALUES ($1, $2, $3, $4)',
              [id, texts[i], JSON.stringify(vectors[i]), JSON.stringify(metadatas[i] || {})]
            );
          }
        } catch (err) {
          console.error('向量写入 PG 失败:', err);
        }
      }
    }
    
    this.persist();
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

  // 相似度检索（向量召回）
  async similaritySearch(
    queryText: string,
    topK: number = 5,
    collectionIds?: string[]
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
          // 多知识库过滤：metadata->>'collectionId' IN (...)
          let filterSql = '';
          const params: any[] = [vectorStr];
          if (collectionIds && collectionIds.length > 0) {
            params.push(collectionIds);
            filterSql = ` WHERE metadata->>'collectionId' = ANY($${params.length}::text[])`;
          }
          params.push(topK);
          const result = await query(
            `SELECT content, metadata, 1 - (embedding <=> $1::vector) as score
             FROM vectors${filterSql} ORDER BY embedding <=> $1::vector LIMIT $${params.length}`,
            params
          );
          return result.rows.map((row: any) => this.buildRetrievalResult(row.content, row.score, row.metadata, queryText, 'vector'));
        }
      } catch (err) {
        console.warn('pgvector 搜索失败，回退到内存计算:', err);
      }
    }

    // 内存计算相似度（应用知识库过滤）
    const pool = this.data.filter(item => inCollectionScope(item.metadata, collectionIds));
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
    retrievalMethod: 'vector' | 'bm25' | 'hybrid'
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

  // BM25 检索（纯内存，中文按字 + 英文按词）
  bm25Search(
    queryText: string,
    topK: number = 5,
    collectionIds?: string[]
  ): RetrievalResult[] {
    if (this.data.length === 0) return [];

    const k1 = config.rag.bm25K1;
    const b = config.rag.bm25B;

    // 应用知识库过滤，构建待检索文档池
    const pool = this.data.filter(item => inCollectionScope(item.metadata, collectionIds));
    if (pool.length === 0) return [];

    // 预分词所有文档
    const docTokens: string[][] = pool.map(item => tokenize(item.content));
    const docLen = docTokens.map(t => t.length);
    const avgLen = docLen.reduce((a, c) => a + c, 0) / (pool.length || 1);

    // 文档频率：df[term] = 包含 term 的文档数
    const df = new Map<string, number>();
    for (const tokens of docTokens) {
      const seen = new Set(tokens);
      for (const term of seen) {
        df.set(term, (df.get(term) || 0) + 1);
      }
    }

    const N = pool.length;
    const queryTerms = tokenize(queryText);
    if (queryTerms.length === 0) return [];

    // 对每个文档计算 BM25 分数
    const scores: number[] = new Array(N).fill(0);
    for (const term of queryTerms) {
      const n = df.get(term) || 0;
      if (n === 0) continue;
      // IDF（标准 BM25，加 1 避免负值）
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      for (let i = 0; i < N; i++) {
        // term 在文档 i 中的 tf
        let tf = 0;
        for (const t of docTokens[i]) {
          if (t === term) tf++;
        }
        if (tf === 0) continue;
        const dl = docLen[i] || 0;
        const denom = tf + k1 * (1 - b + b * (dl / (avgLen || 1)));
        scores[i] += idf * (tf * (k1 + 1)) / (denom || 1);
      }
    }

    // 排序取 TopK
    const ranked = pool
      .map((item, i) => ({ item, score: scores[i] }))
      .filter(r => r.score > 0)
      .sort((a, b2) => b2.score - a.score);

    return ranked.slice(0, topK).map(({ item, score }) =>
      this.buildRetrievalResult(item.content, score, item.metadata, queryText, 'bm25')
    );
  }

  // 混合检索：向量 + BM25，RRF 融合
  async hybridSearch(
    queryText: string,
    topK: number = 5,
    collectionIds?: string[]
  ): Promise<RetrievalResult[]> {
    if (this.data.length === 0) return [];

    const rrfK = config.rag.rrfK;

    // 召回数放大：两路各取 topK*3 再融合
    const recallK = Math.max(topK * 3, 10);

    const [vectorResults, bm25Results] = await Promise.all([
      config.rag.useHybridSearch
        ? this.similaritySearch(queryText, recallK, collectionIds).catch(() => [] as RetrievalResult[])
        : Promise.resolve([] as RetrievalResult[]),
      config.rag.useHybridSearch
        ? Promise.resolve(this.bm25Search(queryText, recallK, collectionIds))
        : Promise.resolve([] as RetrievalResult[]),
    ]);

    // 非混合模式：直接走向量
    if (!config.rag.useHybridSearch) {
      return vectorResults;
    }

    // RRF 融合：score = sum(1 / (rrfK + rank))
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
      .slice(0, topK)
      .map(({ rrfScore, item }) => ({
        ...item,
        score: rrfScore,
        retrievalMethod: 'hybrid' as const,
      }));

    return merged;
  }

  // 按来源删除
  async deleteBySource(source: string): Promise<void> {
    const before = this.data.length;
    const toDelete = this.data.filter(item => item.metadata?.source === source);
    this.data = this.data.filter(item => item.metadata?.source !== source);
    const deleted = before - this.data.length;
    
    // PG 模式下从数据库删除
    if (usePostgres && toDelete.length > 0) {
      for (const item of toDelete) {
        await query('DELETE FROM vectors WHERE id = $1', [item.id])
          .catch(err => console.error('从 PG 删除向量失败:', err));
      }
    }
    
    if (deleted > 0) {
      this.persist();
    }
  }

  // 获取数量
  count(): number {
    return this.data.length;
  }

  // 清除指定知识库集合的向量关联（删除集合时调用）
  clearCollectionAssociation(collectionId: string): void {
    for (const item of this.data) {
      if (item.metadata?.collectionId === collectionId) {
        delete item.metadata.collectionId;
      }
    }
    this.persist();
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
  collectionIds?: string[]
): Promise<RetrievalResult[]> {
  const s = getVectorStore();
  return s.similaritySearch(query, topK, collectionIds);
}

// 功能7：混合检索（向量 + BM25，RRF 融合）
export async function hybridSearch(
  query: string,
  topK: number = config.rag.topK,
  collectionIds?: string[]
): Promise<RetrievalResult[]> {
  const s = getVectorStore();
  return s.hybridSearch(query, topK, collectionIds);
}

export async function deleteDocumentsBySource(source: string): Promise<void> {
  const s = getVectorStore();
  await s.deleteBySource(source);
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
