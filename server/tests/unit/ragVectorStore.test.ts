/**
 * RAG 向量存储单元测试（生产化改造回归）
 *
 * 覆盖：docId 精确删除（同名文件不再互相误删）、BM25 bigram 与倒排缓存失效、
 * 规模护栏、用户隔离过滤。embedding 用假实现（零 API 依赖）。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// 假 embedding：全部返回同一向量（让向量路打平，重点考察 BM25/删除/隔离逻辑）
const fakeEmbeddings = {
  embedDocuments: async (texts: string[]) => texts.map(() => [1, 0, 0]),
  embedQuery: async (_q: string) => [1, 0, 0],
};

vi.mock('../../src/services/llm', () => ({
  getEmbeddings: () => fakeEmbeddings,
}));

vi.mock('../../src/db', () => ({
  usePostgres: false,
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
}));

// 隔离的持久化目录 + 收紧的护栏阈值
// 注意：vi.mock 工厂会被提升到 import 之前执行，临时目录必须在工厂内部创建
vi.mock('../../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config')>();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-vs-'));
  return {
    ...actual,
    config: {
      ...actual.config,
      chroma: { ...actual.config.chroma, persistDirectory: tmpDir },
      rag: { ...actual.config.rag, maxChunksPerDoc: 10, maxTotalChunks: 25 },
    },
  };
});

import { tokenizeBigram, addDocuments, deleteDocumentsByDocId, hybridSearch } from '../../src/services/vectorStore';

describe('tokenizeBigram（中文 bigram）', () => {
  it('连续中文同时产出单字与二元组', () => {
    const tokens = tokenizeBigram('配置数据库');
    expect(tokens).toContain('配');
    expect(tokens).toContain('配置');
    expect(tokens).toContain('数据');
    expect(tokens).toContain('据库');
  });

  it('英文整词不拆分、不产生 bigram', () => {
    const tokens = tokenizeBigram('hello world');
    expect(tokens).toEqual(['hello', 'world']);
  });
});

describe('docId 精确删除（修复同名文件互相误删）', () => {
  it('删除 docA 不影响同名 source 的 docB', async () => {
    await addDocuments(['docA-1', 'docA-2'], [
      { source: 'x.pdf', docId: 'docA', chunkIndex: 0, totalChunks: 2 },
      { source: 'x.pdf', docId: 'docA', chunkIndex: 1, totalChunks: 2 },
    ]);
    await addDocuments(['docB-1'], [
      { source: 'x.pdf', docId: 'docB', chunkIndex: 0, totalChunks: 1 },
    ]);

    const deleted = await deleteDocumentsByDocId('docA');
    expect(deleted).toBe(2);

    // 同名 source 的 docB 仍然完整可检索
    const hits = await hybridSearch('docB-1', 5, undefined);
    expect(hits.some((h) => h.metadata?.docId === 'docB')).toBe(true);
    expect(hits.some((h) => h.metadata?.docId === 'docA')).toBe(false);
  });
});

describe('BM25 bigram 命中与倒排缓存失效', () => {
  it('bigram 命中词组查询（单字分词会大量误命中的场景反而验证精确性）', async () => {
    await addDocuments(['向量数据库配置指南：第一步安装插件'], [
      { source: 'guide.md', docId: 'guide', chunkIndex: 0, totalChunks: 1 },
    ]);
    await addDocuments(['今天天气不错适合户外运动'], [
      { source: 'diary.md', docId: 'diary', chunkIndex: 0, totalChunks: 1 },
    ]);

    // 「数据库配置」作为 bigram 应命中 guide 而非 diary
    const hits = await hybridSearch('数据库配置', 5, undefined);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].metadata?.docId).toBe('guide');
  });

  it('删除后倒排缓存立即失效（已删内容不再命中）', async () => {
    await addDocuments(['独特关键词青苹果'], [
      { source: 'apple.md', docId: 'apple', chunkIndex: 0, totalChunks: 1 },
    ]);
    await deleteDocumentsByDocId('apple');

    const hits = await hybridSearch('青苹果', 5, undefined);
    expect(hits.some((h) => h.metadata?.docId === 'apple')).toBe(false);
  });
});

describe('规模护栏与用户隔离', () => {
  it('单文档分块数超过上限直接抛错（不入库）', async () => {
    const texts = Array.from({ length: 11 }, (_, i) => `chunk-${i}`);
    const metas = texts.map((_, i) => ({ source: 'big.pdf', docId: 'big', chunkIndex: i }));
    await expect(addDocuments(texts, metas)).rejects.toThrow(/单文档上限/);
  });

  it('全库总量超过上限抛错', async () => {
    // 当前已有 ~3 条（前两步用掉），分两批各 10 块（≤单文档上限）填到接近 25 再超
    for (let batch = 0; batch < 2; batch++) {
      const filler = Array.from({ length: 10 }, (_, i) => `filler-${batch}-${i}`);
      const metas = filler.map((_, i) => ({ source: 'filler.md', docId: `f${batch}-${i}`, chunkIndex: i, totalChunks: 10 }));
      await addDocuments(filler, metas);
    }

    const overflow = Array.from({ length: 5 }, (_, i) => `overflow-${i}`);
    const overflowMetas = overflow.map((_, i) => ({ source: 'over.md', docId: `o${i}`, chunkIndex: i }));
    await expect(addDocuments(overflow, overflowMetas)).rejects.toThrow(/全库上限/);
  });

  it('用户隔离过滤：带 userId 检索只返回该用户数据', async () => {
    // 清场：删掉之前留下的（避免干扰断言）
    await addDocuments(['user1-secret-数据'], [
      { source: 'u1.md', docId: 'u1doc', chunkIndex: 0, totalChunks: 1, userId: 'user1' },
    ]);

    const asUser1 = await hybridSearch('user1-secret', 5, undefined, 'user1');
    expect(asUser1.some((h) => h.metadata?.userId === 'user1')).toBe(true);

    const asUser2 = await hybridSearch('user1-secret', 5, undefined, 'user2');
    expect(asUser2).toHaveLength(0);
  });
});
