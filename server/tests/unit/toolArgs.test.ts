/**
 * toolArgs.ts 单元测试
 *
 * 覆盖的真实故障：
 *   模型流式返回的工具调用参数被丢掉 → 解析成空对象 → 工具拿着 undefined 执行 →
 *   抛出 Node 内部错误（"The \"data\" argument must be of type string..."）→
 *   模型看不懂 → 反复重试同一个调用 → 连续十几轮空转。
 *
 * 关键回归点是"空数组短路"：`chunk.tool_calls || chunk.additional_kwargs.tool_calls`
 * 在 JS 里是错的 —— 空数组是 truthy，会把真正带参数的字段整个跳过。
 */
import { describe, it, expect } from 'vitest';
import {
  pickToolCallDeltas,
  createToolCallEntry,
  mergeToolCallDelta,
  parseCollectedToolCall,
  missingRequiredArgs,
} from '../../src/services/toolArgs';

describe('pickToolCallDeltas 增量抽取', () => {
  it('空数组不能短路掉真正带参数的字段（本次故障的根因）', () => {
    const chunk = {
      tool_calls: [], // 增量阶段常见：存在但为空
      additional_kwargs: {
        tool_calls: [{ index: 0, function: { name: 'code_interpreter', arguments: '{"code":"' } }],
      },
    };
    const deltas = pickToolCallDeltas(chunk);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].function.name).toBe('code_interpreter');
  });

  it('取 tool_call_chunks（LangChain 增量形态）', () => {
    const deltas = pickToolCallDeltas({
      tool_call_chunks: [{ index: 0, name: 'code_interpreter', args: '{"code":"x"' }],
    });
    expect(deltas[0].args).toBe('{"code":"x"');
  });

  it('什么都没有时返回空数组，不抛错', () => {
    expect(pickToolCallDeltas({ content: '你好' })).toEqual([]);
    expect(pickToolCallDeltas({ tool_calls: [] })).toEqual([]);
    expect(pickToolCallDeltas({})).toEqual([]);
  });

  it('单个 function_call 也能被规整成数组', () => {
    const deltas = pickToolCallDeltas({ function_call: { name: 'web_search', arguments: '{}' } });
    expect(deltas).toHaveLength(1);
    expect(deltas[0].name).toBe('web_search');
  });
});

describe('createToolCallEntry / mergeToolCallDelta 分片累加', () => {
  it('OpenAI 风格：function.arguments 分片拼接后是合法 JSON', () => {
    const entry = createToolCallEntry({
      index: 0,
      id: 'call_1',
      function: { name: 'code_interpreter', arguments: '{"language":"python","code":"' },
    });
    mergeToolCallDelta(entry, { index: 0, function: { arguments: 'print(1)\\n' } });
    mergeToolCallDelta(entry, { index: 0, function: { arguments: '"}' } });

    const { args, error } = parseCollectedToolCall(entry);
    expect(error).toBeNull();
    expect(args).toEqual({ language: 'python', code: 'print(1)\n' });
  });

  it('LangChain 风格：args 分片同样能累加', () => {
    const entry = createToolCallEntry({ index: 0, id: 'c2', name: 'create_file', args: '{"filename":' });
    mergeToolCallDelta(entry, { index: 0, args: '"a.py","content":"hi"}' });

    const { args, error } = parseCollectedToolCall(entry);
    expect(error).toBeNull();
    expect(args).toEqual({ filename: 'a.py', content: 'hi' });
  });

  it('首片参数不会被重复计入（新条目不能直接 {...tc}）', () => {
    const entry = createToolCallEntry({ index: 0, function: { name: 'x', arguments: '{"a":1}' } });
    const { args, error } = parseCollectedToolCall(entry);
    expect(error).toBeNull();
    expect(args).toEqual({ a: 1 });
  });

  it('每次都带完整参数的厂商：解析出的仍是完整对象', () => {
    const entry = createToolCallEntry({ index: 0, name: 'x', args: { a: 1, b: '中文' } });
    const { args, error } = parseCollectedToolCall(entry);
    expect(error).toBeNull();
    expect(args).toEqual({ a: 1, b: '中文' });
  });
});

describe('parseCollectedToolCall 失败必须是显式错误，不能静默变空对象', () => {
  it('参数为空 → 明确报"参数为空"，而不是 {}', () => {
    const { args, error } = parseCollectedToolCall({ __argText: '' });
    expect(args).toEqual({});
    expect(error).toContain('参数为空');
  });

  it('JSON 非法 → 报错并附带长度与开头片段，便于模型照着改', () => {
    const { error } = parseCollectedToolCall({ __argText: '{"code":"print(1)' });
    expect(error).toContain('不是合法 JSON');
    expect(error).toContain('字符');
  });

  it('解析成数组/标量 → 明确拒绝', () => {
    expect(parseCollectedToolCall({ __argText: '[1,2]' }).error).toContain('不是 JSON 对象');
    expect(parseCollectedToolCall({ __argText: '"abc"' }).error).toContain('不是 JSON 对象');
  });
});

describe('missingRequiredArgs 必填校验', () => {
  it('缺字段 / null / 空串都算缺失', () => {
    expect(missingRequiredArgs({ language: 'python' }, ['code', 'language'])).toEqual(['code']);
    expect(missingRequiredArgs({ code: null, language: 'python' }, ['code'])).toEqual(['code']);
    expect(missingRequiredArgs({ code: '   ' }, ['code'])).toEqual([]); // 空白串交给下游判断
    expect(missingRequiredArgs({}, ['code'])).toEqual(['code']); // 必填字段完全缺失
    expect(missingRequiredArgs({}, [])).toEqual([]); // 未声明必填
  });

  it('齐全时不报缺失', () => {
    expect(missingRequiredArgs({ code: 'print(1)', language: 'python' }, ['code', 'language'])).toEqual([]);
  });
});

describe('端到端回归：真实故障的 chunk 序列', () => {
  it('tool_calls 为空 + 增量在 additional_kwargs 时，仍能还原出 code 参数', () => {
    // 复刻出故障时的真实分片：正文先流一段，随后 tool_calls 为空的 chunk
    // 与真正携带参数分片的 additional_kwargs 交替出现
    const chunks = [
      { content: '好的，我来生成简历。', tool_calls: [] },
      { content: '', tool_calls: [], additional_kwargs: { tool_calls: [{ index: 0, id: 'call_x', function: { name: 'code_interpreter', arguments: '' } }] } },
      { content: '', tool_calls: [], additional_kwargs: { tool_calls: [{ index: 0, function: { arguments: '{"language":"python",' } }] } },
      { content: '', tool_calls: [], additional_kwargs: { tool_calls: [{ index: 0, function: { arguments: '"code":"import os\\nprint(os.getcwd())"}' } }] } },
    ];

    const collected: any[] = [];
    for (const chunk of chunks) {
      for (const tc of pickToolCallDeltas(chunk)) {
        const name = tc.function?.name || tc.name;
        const idx = collected.findIndex((c) => (tc.id && c.id === tc.id) || (tc.index !== undefined && c.index === tc.index));
        if (idx >= 0) {
          mergeToolCallDelta(collected[idx], tc);
        } else {
          collected.push(createToolCallEntry(tc));
        }
        if (name && !collected[0].function?.name) collected[0].function.name = name;
      }
    }

    expect(collected).toHaveLength(1);
    const { args, error } = parseCollectedToolCall(collected[0]);
    expect(error).toBeNull();
    // 修复前这里会是空对象，导致 args.code === undefined
    expect(typeof args.code).toBe('string');
    expect(args.code).toContain('os.getcwd()');
    expect(missingRequiredArgs(args, ['code', 'language'])).toEqual([]);
  });
});
