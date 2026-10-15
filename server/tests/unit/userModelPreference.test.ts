import { describe, it, expect } from 'vitest';
import { normalizeCustomModels } from '../../src/services/userModelPreference';

describe('normalizeCustomModels 偏好数据容错解析', () => {
  it('解析对象数组', () => {
    expect(normalizeCustomModels([{ provider: 'deepseek', id: 'deepseek-v4-flash-0731' }]))
      .toEqual([{ provider: 'deepseek', id: 'deepseek-v4-flash-0731' }]);
  });

  it('兼容字符串数组（历史写法）', () => {
    expect(normalizeCustomModels(['deepseek-chat'])).toEqual([{ provider: '', id: 'deepseek-chat' }]);
  });

  it('兼容 model 字段名', () => {
    expect(normalizeCustomModels([{ provider: 'bailian', model: 'qwen3-4b' }]))
      .toEqual([{ provider: 'bailian', id: 'qwen3-4b' }]);
  });

  it('去重并剔除空值与脏数据', () => {
    const result = normalizeCustomModels([
      { provider: 'deepseek', id: 'a' },
      { provider: 'deepseek', id: 'a' },
      '',
      null,
      undefined,
      { provider: 'deepseek', id: '   ' },
      42,
      { id: 'b' },
    ]);
    expect(result).toEqual([
      { provider: 'deepseek', id: 'a' },
      { provider: '', id: 'b' },
    ]);
  });

  it('非数组输入返回空清单，不抛异常', () => {
    expect(normalizeCustomModels(null)).toEqual([]);
    expect(normalizeCustomModels('{}')).toEqual([]);
    expect(normalizeCustomModels({ id: 'a' })).toEqual([]);
  });
});
