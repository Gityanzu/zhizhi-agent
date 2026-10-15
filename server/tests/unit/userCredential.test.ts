import { describe, it, expect } from 'vitest';
import {
  runWithUserCredential,
  runWithRequestContext,
  getRequestUserCredential,
  getEffectiveApiKey,
  setRequestParams,
  getLLM,
  getResolvedProviderAndModel,
} from '../../src/services/llm';

describe('用户凭据上下文（AsyncLocalStorage）', () => {
  it('并发调用链中的凭据互不覆盖', async () => {
    const seen: string[] = [];
    const readAfter = async (delay: number) => {
      await new Promise((r) => setTimeout(r, delay));
      // 交错 await 后再读：模块级变量在这里会被后发起的任务覆盖
      seen.push(getRequestUserCredential()?.apiKey || 'none');
    };

    await Promise.all([
      runWithUserCredential({ apiKey: 'key-A', providerId: 'deepseek' }, () => readAfter(20)),
      runWithUserCredential({ apiKey: 'key-B', providerId: 'bailian' }, () => readAfter(5)),
    ]);

    expect(seen.sort()).toEqual(['key-A', 'key-B']);
  });

  it('嵌套上下文结束后回落到外层凭据', () => {
    runWithUserCredential({ apiKey: 'outer' }, () => {
      expect(getRequestUserCredential()?.apiKey).toBe('outer');
      runWithUserCredential({ apiKey: 'inner' }, () => {
        expect(getRequestUserCredential()?.apiKey).toBe('inner');
      });
      expect(getRequestUserCredential()?.apiKey).toBe('outer');
    });
  });

  it('上下文之外读不到凭据（只会回退全局，绝不会读到他人 Key）', () => {
    expect(getRequestUserCredential()).toBeNull();
    // 无凭据时走全局配置，而不是上一轮请求残留的凭据
    expect(getEffectiveApiKey()).toEqual({
      apiKey: expect.any(String),
      baseUrl: expect.any(String),
    });
  });

  it('凭据不同不会复用同一个 LLM 实例，相同凭据命中缓存', () => {
    const a = runWithUserCredential({ apiKey: 'key-A', providerId: 'deepseek' }, () => getLLM());
    const b = runWithUserCredential({ apiKey: 'key-B', providerId: 'bailian' }, () => getLLM());
    const a2 = runWithUserCredential({ apiKey: 'key-A', providerId: 'deepseek' }, () => getLLM());

    expect(a).not.toBe(b);
    expect(a2).toBe(a);
  });

  it('无凭据的调用不会复用到带凭据的缓存实例', () => {
    const withKey = runWithUserCredential({ apiKey: 'key-A', providerId: 'deepseek' }, () => getLLM());
    const anonymous = runWithUserCredential(null, () => getLLM());
    expect(anonymous).not.toBe(withKey);
  });
});

describe('请求级模型参数上下文隔离', () => {
  it('并发上下文中的 temperature 互不覆盖', async () => {
    const readTemperature = async (delay: number) => {
      await new Promise((r) => setTimeout(r, delay));
      const llm: any = getLLM();
      return llm.temperature;
    };

    const [a, b] = await Promise.all([
      runWithRequestContext({}, () => {
        setRequestParams({ temperature: 0.1 });
        return readTemperature(20);
      }),
      runWithRequestContext({}, () => {
        setRequestParams({ temperature: 0.9 });
        return readTemperature(5);
      }),
    ]);

    // 模块级单例在这里会双双变成 0.9（后写的覆盖前者）
    expect(a).toBeCloseTo(0.1);
    expect(b).toBeCloseTo(0.9);
  });

  it('上下文之外设置参数仍生效（脚本/旧调用点的兜底路径）', () => {
    try {
      setRequestParams({ temperature: 0.42 });
      const llm: any = getLLM();
      expect(llm.temperature).toBeCloseTo(0.42);
    } finally {
      setRequestParams(null);
    }
  });
});

describe('用户级模型选择在请求级生效', () => {
  it('用户选中的内置模型优先于全局当前模型', () => {
    const r = runWithUserCredential(
      { apiKey: 'k', providerId: 'deepseek', modelName: 'deepseek-reasoner' },
      () => getResolvedProviderAndModel()
    );
    expect(r.providerId).toBe('deepseek');
    expect(r.modelName).toBe('deepseek-reasoner');
  });

  it('自定义模型（厂商清单之外）也能被采用', () => {
    // 例如百炼上带日期的版本号 deepseek-v4-flash-0731
    const r = runWithUserCredential(
      {
        apiKey: 'k',
        providerId: 'deepseek',
        modelName: 'deepseek-v4-flash-0731',
        customModels: ['deepseek-v4-flash-0731'],
      },
      () => getResolvedProviderAndModel()
    );
    expect(r.modelName).toBe('deepseek-v4-flash-0731');
  });

  it('既不在清单也未登记为自定义的模型会被拒绝，回退厂商首个模型', () => {
    const r = runWithUserCredential(
      { apiKey: 'k', providerId: 'deepseek', modelName: 'not-exist-model' },
      () => getResolvedProviderAndModel()
    );
    // 不能把任意字符串直传给上游，否则请求必然 404
    expect(r.modelName).not.toBe('not-exist-model');
    expect(r.providerId).toBe('deepseek');
  });
});
