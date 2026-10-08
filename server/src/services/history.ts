// 编辑模式：历史截断到被编辑消息为止（与编辑重生成的截断语义一致）。
// 抽为独立纯函数，便于单测且避免依赖任务编排的整张模块图。
export function truncateHistoryForEdit(
  messages: { id?: string }[] = [],
  editMessageId?: string
): { id?: string }[] {
  if (!editMessageId) return messages;
  const i = messages.findIndex((m) => m.id === editMessageId);
  return i >= 0 ? messages.slice(0, i + 1) : messages;
}
