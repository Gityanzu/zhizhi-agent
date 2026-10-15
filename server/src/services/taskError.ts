/**
 * 任务失败原因的人性化转换。
 *
 * 背景：模型侧报错（额度耗尽 / Key 无效 / 模型不存在）此前只被写成一句原始英文，
 * 而且只存在于 status 事件里 —— 前端不显示，用户看到的就是"发出去、没回复、气泡空白"，
 * 只能反复重发。这里把最常见的三类原因翻成人能看懂的话，并保留原文便于排障。
 *
 * 单独成文件（而不是塞进 taskRunner）：taskRunner 依赖 agent/taskManager 等重模块，
 * 只为测一句文案就拉起整条运行链路不划算。
 */
export function humanizeTaskError(raw: string): string {
  const text = (raw || '').trim() || '未知错误';

  // 不写裸 balance：否则 "load balancer" 之类无关文本也会被判成欠费
  if (/quota|insufficient|arrears|欠费|额度|余额/i.test(text)) {
    return `模型调用被拒绝：账户额度不足或已用尽。请在「设置 → API Key」更换可用的 Key，或为该厂商充值后重试。\n\n原始错误：${text}`;
  }
  if (/401|unauthorized|invalid[_ -]?api[_ -]?key|authentication/i.test(text)) {
    return `模型调用失败：API Key 无效或已失效。请在「设置 → API Key」检查该厂商的 Key 是否正确。\n\n原始错误：${text}`;
  }
  // 收紧：模型不存在必须是「模型」语境。否则任意 "not found"（文件/路由/会话缺失）
  // 都会被误报成"该厂商没有这个模型"，把用户引向无效的自救动作。
  if (/\b404\b|model.{0,20}(not\s+found|does\s+not\s+exist|not\s+exist)/i.test(text)) {
    return `模型调用失败：该厂商下没有这个模型。请在模型下拉中切换到当前厂商提供的模型。\n\n原始错误：${text}`;
  }
  return text;
}
