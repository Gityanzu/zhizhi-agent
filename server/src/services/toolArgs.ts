/**
 * toolArgs.ts — 工具调用参数的解析与校验（纯逻辑）
 *
 * 为什么要单独成文件：agent.ts 一 import 就会把 LLM / 向量库 / 数据库整条依赖链
 * 拖进测试进程，导致这里最容易出错的一段逻辑没法单测。这些函数无副作用、无依赖。
 *
 * 这段逻辑对应一个真实故障：
 *   模型流式返回的工具调用参数被丢掉，解析成空对象 → 工具拿着 undefined 执行 →
 *   抛出 Node 内部错误（"The \"data\" argument must be of type string..."）→
 *   模型看不懂这个报错 → 反复重试同一个调用 → 连续十几轮空转直到轮次上限。
 */

/** 把"可能是数组 / 单个对象 / null"的字段规整成数组 */
export function toArray(v: any): any[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v];
}

/**
 * 从多种模型格式里挑出本轮真正带内容的工具调用增量。
 *
 * 不能用 `||` 简单串联：空数组在 JS 里是 truthy，只要某个字段存在但为空
 * （增量阶段 tool_calls 常为 []），后面真正装着参数的字段就会被整体跳过，
 * 于是参数累积成空串、最终解析出空对象。
 */
export function pickToolCallDeltas(chunk: any): any[] {
  const candidates = [
    chunk?.tool_call_chunks,               // LangChain 增量形态（args 为字符串分片）
    chunk?.tool_calls,                     // LangChain 解析形态，或部分厂商的完整调用
    chunk?.additional_kwargs?.tool_calls,  // OpenAI 原始增量（function.arguments 为字符串分片）
    chunk?.message_tool_calls,
    chunk?.message?.tool_calls,
    chunk?.function_call ? [chunk.function_call] : null,
  ];
  for (const c of candidates) {
    const arr = toArray(c);
    if (arr.length > 0) return arr;
  }
  return [];
}

/**
 * 从一个增量里抽出参数。三个字段名都要看：
 *   function.arguments（OpenAI 原始格式）/ arguments / args（LangChain 增量格式）
 * 流式阶段是字符串分片，某些厂商会直接给解析好的对象。
 */
export function extractArgDelta(tc: any): { text?: string; obj?: Record<string, any> } {
  const raw = tc?.function?.arguments ?? tc?.arguments ?? tc?.args;
  if (raw === undefined || raw === null) return {};
  if (typeof raw === 'string') return { text: raw };
  if (typeof raw === 'object') return { obj: raw as Record<string, any> };
  return {};
}

/** 把一个增量并入已收集的工具调用：名称/id/index 取首次出现的，参数分片累加 */
export function mergeToolCallDelta(existing: any, tc: any): void {
  const { text, obj } = extractArgDelta(tc);
  if (text) existing.__argText = (existing.__argText || '') + text;
  // 已是解析好的完整对象：直接采用（比字符串分片更可信）
  if (obj) existing.__argObj = obj;

  const tcName = tc?.function?.name || tc?.name || tc?.function_call?.name || tc?.tool_name;
  if (tc.id && !existing.id) existing.id = tc.id;
  if (tc.index !== undefined && existing.index === undefined) existing.index = tc.index;
  if (tcName && !existing.function?.name && !existing.name) {
    existing.function = existing.function || {};
    existing.function.name = tcName;
  }
}

/** 新建一个用于收集增量的空壳（不要 `{...tc}`：会把首片参数复制一遍，随后又追加一次） */
export function createToolCallEntry(firstDelta: any): any {
  const entry: any = { __argText: '', __argObj: null, firstDelta };
  mergeToolCallDelta(entry, firstDelta);
  return entry;
}

/**
 * 把收集到的增量还原成可执行参数。
 *
 * 绝不在解析失败时回落成 `{}`：那等于把"参数解析失败"伪装成"参数为空"，
 * 让工具带着 undefined 去执行并抛出与真实原因无关的内部错误。
 */
export function parseCollectedToolCall(tc: any): { args: Record<string, any>; error: string | null } {
  if (tc?.__argObj && typeof tc.__argObj === 'object') {
    return { args: tc.__argObj, error: null };
  }
  const text: string = typeof tc?.__argText === 'string' ? tc.__argText : '';
  return parseArgsText(text);
}

/** 解析参数字符串，失败时给出能照着改的说明 */
export function parseArgsText(text: string): { args: Record<string, any>; error: string | null } {
  if (!text || !text.trim()) {
    return { args: {}, error: '参数为空：模型没有为这次调用提供任何参数（流式增量可能丢失）' };
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { args: {}, error: `参数不是 JSON 对象（收到 ${Array.isArray(parsed) ? 'array' : typeof parsed}）` };
    }
    return { args: parsed as Record<string, any>, error: null };
  } catch (e) {
    const preview = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    return {
      args: {},
      error: `参数不是合法 JSON（${e instanceof Error ? e.message : String(e)}）。收到 ${text.length} 字符，开头为：${preview}`,
    };
  }
}

/**
 * 必填参数校验。required 由调用方从工具 schema 传入，避免手工维护一份会过期的清单。
 * 模型偶发漏参时给一句能照着改的提示，比让它撞 Node 内部错误有效得多。
 */
export function missingRequiredArgs(args: Record<string, any>, required: string[]): string[] {
  return required.filter((k) => args[k] === undefined || args[k] === null || args[k] === '');
}
