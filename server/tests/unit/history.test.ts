import { describe, it, expect } from 'vitest';
import { truncateHistoryForEdit } from '../../src/services/history';

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
