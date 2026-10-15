import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// 编辑模式：历史截断到被编辑消息为止（与编辑重生成的截断语义一致）。
// 抽为独立纯函数，便于单测且避免依赖任务编排的整张模块图。
// 用泛型保留元素类型：此前签名写死为 { id?: string }[]，导致调用方拿到的历史
// 丢失 role/content 等字段，传给 ChatMessage[] 形参时类型不通过。
export function truncateHistoryForEdit<T extends { id?: string }>(
  messages: T[] = [],
  editMessageId?: string
): T[] {
  if (!editMessageId) return messages;
  const i = messages.findIndex((m) => m.id === editMessageId);
  return i >= 0 ? messages.slice(0, i + 1) : messages;
}

// 历史消息记录：工具调用轮的 assistant 消息 content 常为空、信息都在 toolCalls 里
export type HistoryMessage = { role: string; content: string; toolCalls?: any[] };

/* 把落库的历史消息重建成 LangChain 消息。
   此前各处都写成 `m.role === 'user' ? HumanMessage : AIMessage`，会带来两个后果：
   1) 上下文压缩产生的摘要（role=system）被伪装成模型自己的发言；
   2) 工具调用轮的 assistant 消息 content 为空、toolCalls 被丢弃，历史里
      只剩一条空 AI 消息 —— 模型既不知道之前调用过什么工具，也拿不到任何
      可用信息，于是容易重复调用同一个工具或答非所问。

   注意：不能直接把这些 toolCalls 挂回 AIMessage.tool_calls。落库的
   toolCalls 只保存了 { name, arguments }（没有 id、也没有工具结果），补不出
   配对的 ToolMessage，而「声明了 tool_calls 却没有对应 tool 结果」会被模型
   接口直接拒绝。因此这里把工具调用渲染成文本：既不破坏配对约束，又保留了
   "上一轮调用过什么" 的上下文。 */
export function buildHistoryMessages(chatHistory: HistoryMessage[], limit: number): any[] {
  const result: any[] = [];
  for (const m of chatHistory.slice(-limit)) {
    const raw = m.content;
    const text = typeof raw === 'string' ? raw : '';

    // 摘要等系统消息要还原成 SystemMessage，否则模型会以为自己说过这些话
    if (m.role === 'system' || m.role === 'tool') {
      if (text) result.push(new SystemMessage(text));
      continue;
    }

    if (m.role === 'assistant') {
      const calls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
      if (calls.length === 0) {
        // 空内容的 assistant 消息对模型毫无价值，只会稀释上下文
        if (raw === undefined || raw === null || raw === '') continue;
        result.push(new AIMessage(raw));
        continue;
      }
      const callText = calls
        .map((c: any) => {
          const name = c?.name || c?.function?.name || 'unknown';
          const args = c?.arguments ?? c?.function?.arguments ?? {};
          const argStr = typeof args === 'string' ? args : JSON.stringify(args);
          return `[调用工具 ${name}] 参数：${argStr}`;
        })
        .join('\n');
      const merged = [text, callText].filter(Boolean).join('\n');
      result.push(new AIMessage(merged));
      continue;
    }

    // user 及其它未知角色统一按人类消息处理，空内容则跳过
    if (!text) continue;
    result.push(new HumanMessage(text));
  }
  return result;
}
