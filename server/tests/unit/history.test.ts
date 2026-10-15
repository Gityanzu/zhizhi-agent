import { describe, it, expect } from 'vitest';
import { truncateHistoryForEdit, buildHistoryMessages } from '../../src/services/history';

describe('truncateHistoryForEdit', () => {
  const msgs = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }];

  it('无 editMessageId 时返回原数组引用', () => {
    expect(truncateHistoryForEdit(msgs)).toBe(msgs);
    expect(truncateHistoryForEdit(msgs, undefined)).toBe(msgs);
  });

  it('截断到被编辑消息（含该消息本身）', () => {
    const r = truncateHistoryForEdit(msgs, 'm3');
    expect(r.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('editMessageId 不存在时返回完整历史', () => {
    const r = truncateHistoryForEdit(msgs, 'nope');
    expect(r).toHaveLength(4);
  });

  it('空消息列表安全返回空', () => {
    expect(truncateHistoryForEdit([], 'm1')).toEqual([]);
  });
});

describe('buildHistoryMessages', () => {
  const typeOf = (m: any) => m._getType();

  it('把 system 摘要还原为 SystemMessage，而不是伪装成 AI 发言', () => {
    const r = buildHistoryMessages([{ role: 'system', content: '【对话历史摘要】用户在做A' }], 6);
    expect(r).toHaveLength(1);
    expect(typeOf(r[0])).toBe('system');
    expect(r[0].content).toBe('【对话历史摘要】用户在做A');
  });

  it('工具调用轮的 assistant 消息保留工具名与参数，且不再是空消息', () => {
    const r = buildHistoryMessages([
      { role: 'assistant', content: '', toolCalls: [{ name: 'read_file', arguments: { path: 'a.txt' } }] },
    ], 6);
    expect(r).toHaveLength(1);
    expect(typeOf(r[0])).toBe('ai');
    expect(r[0].content).toContain('read_file');
    expect(r[0].content).toContain('a.txt');
  });

  it('丢弃空内容的 assistant 消息（避免空 AI 消息污染上下文）', () => {
    const r = buildHistoryMessages([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '' },
    ], 6);
    expect(r).toHaveLength(1);
    expect(typeOf(r[0])).toBe('human');
  });

  it('limit 只保留最近 N 条', () => {
    const r = buildHistoryMessages([
      { role: 'user', content: '1' },
      { role: 'user', content: '2' },
      { role: 'user', content: '3' },
    ], 2);
    expect(r.map((m) => m.content)).toEqual(['2', '3']);
  });

  it('tool 角色的历史结果按系统上下文处理，而非 AI 发言', () => {
    const r = buildHistoryMessages([
      { role: 'tool', content: '工具结果' },
      { role: 'user', content: '继续' },
    ], 6);
    expect(typeOf(r[0])).toBe('system');
    expect(typeOf(r[1])).toBe('human');
  });
});
