import { describe, it, expect } from 'vitest';
import { humanizeTaskError } from '../../src/services/taskError';

describe('humanizeTaskError 失败原因转译', () => {
  it('额度耗尽 → 讲清原因并给出处理入口', () => {
    const msg = humanizeTaskError(
      '403 Free quota exhausted. To continue accessing the model on a paid basis, please recharge.'
    );
    expect(msg).toContain('额度');
    expect(msg).toContain('API Key');
    // 原文必须保留：用户看不懂的英文恰恰是排障依据
    expect(msg).toContain('quota');
  });

  it('Key 无效 → 指向设置页检查 Key', () => {
    const msg = humanizeTaskError('401 Unauthorized: invalid api key');
    expect(msg).toContain('API Key 无效');
    expect(msg).toContain('401');
  });

  it('模型不存在 → 提示切换模型', () => {
    const msg = humanizeTaskError('404 model not found: deepseek-nonexistent');
    expect(msg).toContain('没有这个模型');
  });

  it('未知错误原样返回，不吞掉信息', () => {
    const raw = 'ECONNRESET socket hang up';
    expect(humanizeTaskError(raw)).toBe(raw);
  });

  it('空错误也要有兜底文案（否则气泡又是空白）', () => {
    expect(humanizeTaskError('')).toContain('未知错误');
    expect(humanizeTaskError('   ')).toContain('未知错误');
  });
});
