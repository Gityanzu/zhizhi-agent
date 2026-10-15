import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  filterChatModels,
  fetchProviderModels,
  getCachedModels,
  clearModelCatalogCache,
} from '../../src/services/modelCatalog';

const okResponse = (ids: string[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ object: 'list', data: ids.map((id) => ({ id, object: 'model' })) }),
});

describe('filterChatModels 模型清洗', () => {
  it('剔除明显不是对话模型的条目', () => {
    const models = filterChatModels([
      'deepseek-chat',
      'text-embedding-v2',
      'wanx-v1',
      'paraformer-realtime-v2',
      'cosyvoice-v1',
      'deepseek-reasoner',
    ]);
    expect(models.map((m) => m.id)).toEqual(['deepseek-chat', 'deepseek-reasoner']);
  });

  it('去重并忽略空值', () => {
    const models = filterChatModels(['qwen3.8-flash', 'qwen3.8-flash', '', null, undefined, '   ']);
    expect(models.map((m) => m.id)).toEqual(['qwen3.8-flash']);
  });
});

describe('fetchProviderModels 动态拉取', () => {
  beforeEach(() => clearModelCatalogCache());
  afterEach(() => vi.unstubAllGlobals());

  it('解析 OpenAI 兼容的 /models 响应并写入缓存', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(['deepseek-chat', 'deepseek-reasoner'])));

    const r = await fetchProviderModels('deepseek', 'sk-test', 'https://api.deepseek.com/v1');

    expect(r.error).toBeUndefined();
    expect(r.models.map((m) => m.id)).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    expect(getCachedModels('deepseek')?.length).toBe(2);
  });

  it('HTTP 失败时不写缓存，并回传原因供上层降级', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));

    const r = await fetchProviderModels('deepseek', 'sk-bad', 'https://api.deepseek.com/v1');

    expect(r.models).toEqual([]);
    expect(r.error).toContain('401');
    // 关键：失败不能污染缓存，否则内置清单会被空列表顶掉
    expect(getCachedModels('deepseek')).toBeNull();
  });

  it('网络异常不抛出，转成 error 让上层降级', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }));

    const r = await fetchProviderModels('ollama', undefined, 'http://localhost:11434/v1');

    expect(r.error).toContain('ECONNREFUSED');
    expect(getCachedModels('ollama')).toBeNull();
  });

  it('厂商未返回可用模型时同样不写缓存', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(['text-embedding-v2'])));

    const r = await fetchProviderModels('bailian', 'sk-test', 'https://dashscope.aliyuncs.com/compatible-mode/v1');

    expect(r.models).toEqual([]);
    expect(r.error).toContain('未返回可用的对话模型');
    expect(getCachedModels('bailian')).toBeNull();
  });

  it('未配置厂商地址时直接返回错误，不发请求', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const r = await fetchProviderModels('deepseek', 'sk-test', '');

    expect(r.error).toContain('未配置厂商地址');
    expect(spy).not.toHaveBeenCalled();
  });
});
