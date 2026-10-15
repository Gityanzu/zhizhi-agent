/**
 * agentLimits.ts — Agent 轮次预算相关的纯逻辑
 *
 * 为什么单独成文件：agent.ts 会连带拉起 LLM / 向量库 / 数据库等重依赖，
 * 把这类纯函数留在里面就没法单测（一 import 就等于把整条依赖链拖进测试进程）。
 * 这里不引入任何依赖、不产生任何副作用，可以直接断言。
 */

/**
 * 轮次预算耗尽时的用户可见说明。
 *
 * 必须同时做到三件事，缺任何一件，用户看到的都是"任务没做完却结束了"：
 *   1. 说清是「轮次用尽」，而不是含糊的「超时」——旧文案写的正是"处理超时"，
 *      但根因根本不是超时，用户据此排查会走偏；
 *   2. 明确已有进度没有丢失，用户才知道不必从头再来；
 *   3. 给出可执行的下一步（回复「继续」/ 调大上限），而不是让对话凭空停住。
 *
 * @param rounds 本次运行实际消耗的轮次（= config.agent.maxIterations）
 */
/**
 * 检测到「同一工具 + 完全相同参数」被反复调用时的用户可见说明。
 *
 * 与轮次耗尽不同：那不是预算不够，而是模型卡在同一个失败调用上。
 * 必须说清是"主动收手"，否则用户只会看到对话又一次莫名其妙地停住。
 *
 * @param toolSignature 形如 `code_interpreter:{"language":"python","code":"..."}`
 */
export function buildStuckLoopNotice(toolSignature: string): string {
  const preview = toolSignature.length > 200 ? `${toolSignature.slice(0, 200)}…` : toolSignature;
  return [
    '检测到工具调用陷入重复：同一个工具带着完全相同的参数被反复调用，已主动停止，避免继续空转。',
    `重复的调用：${preview}`,
    '上方已执行的操作与结果都已保留。可以回复「继续」并补充具体要求，我会换个思路重试。',
  ].join('\n\n');
}

export function buildIterationExhaustedNotice(rounds: number): string {
  return [
    `已达到最大工具调用轮次（${rounds} 轮），任务可能尚未完成。`,
    '上方已执行的操作与结果都已保留，未丢失。',
    '可以回复「继续」，我会接着当前进度往下做；也可以在服务端调高环境变量 AGENT_MAX_ITERATIONS 后重试。',
  ].join('\n\n');
}
