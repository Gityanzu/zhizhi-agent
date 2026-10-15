import { describe, it, expect } from 'vitest';
import {
  getProviders,
  getProviderById,
  normalizeProviderId,
  providerHasModel,
  getModelsGroupedByProviders,
} from '../../src/services/llmProvider';

describe('DeepSeek 厂商适配', () => {
  it('DeepSeek 已注册为内置厂商', () => {
    const provider = getProviderById('deepseek');
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe('DeepSeek');
    expect(provider!.baseUrl).toContain('deepseek');
    expect(provider!.models.length).toBeGreaterThan(0);
  });

  it('DeepSeek 走 OpenAI 兼容协议，模型可被识别', () => {
    const provider = getProviderById('deepseek')!;
    expect(provider.type).toBe('openai_compatible');
    expect(provider.models.map((m) => m.id)).toContain('deepseek-chat');
  });

  it('厂商列表包含 DeepSeek，供模型下拉分组使用', () => {
    expect(getProviders().map((p) => p.id)).toContain('deepseek');
  });
});

describe('厂商 id 归一化', () => {
  it('界面别名 dashscope 必须映射到内置 bailian', () => {
    // 不对齐的话，用户配了 Key 也匹配不到厂商，会静默回退到全局 Key
    expect(normalizeProviderId('dashscope')).toBe('bailian');
    expect(normalizeProviderId('DASHSCOPE')).toBe('bailian');
    expect(normalizeProviderId('bailian')).toBe('bailian');
  });

  it('deepseek / ollama 保持自身', () => {
    expect(normalizeProviderId('deepseek')).toBe('deepseek');
    expect(normalizeProviderId(' ollama ')).toBe('ollama');
  });

  it('空值返回 null，不会匹配到任何厂商', () => {
    expect(normalizeProviderId(null)).toBeNull();
    expect(normalizeProviderId(undefined)).toBeNull();
    expect(normalizeProviderId('')).toBeNull();
  });
});

describe('getModelsGroupedByProviders 用户级模型列表', () => {
  it('只返回用户已配置 Key 的厂商', () => {
    const groups = getModelsGroupedByProviders(['deepseek']);
    expect(groups).toHaveLength(1);
    expect(groups[0].providerId).toBe('deepseek');
    expect(groups[0].models.length).toBeGreaterThan(0);
  });

  it('别名同样生效（配的 dashscope 要能拿到百炼模型）', () => {
    const groups = getModelsGroupedByProviders(['dashscope']);
    expect(groups).toHaveLength(1);
    expect(groups[0].providerId).toBe('bailian');
    expect(groups[0].models.length).toBeGreaterThan(0);
  });

  it('未配置任何厂商时返回空列表', () => {
    // 空列表意味着前端回落到全局模型清单，而不是展示一堆选了必然报错的项
    expect(getModelsGroupedByProviders([])).toEqual([]);
    expect(getModelsGroupedByProviders([null, undefined])).toEqual([]);
  });
});

describe('providerHasModel 模型归属校验', () => {
  it('区分不同厂商的同名/异名模型', () => {
    expect(providerHasModel('deepseek', 'deepseek-chat')).toBe(true);
    expect(providerHasModel('deepseek', 'qwen3.8-flash')).toBe(false);
    expect(providerHasModel('dashscope', 'qwen3.8-flash')).toBe(true);
  });
});
