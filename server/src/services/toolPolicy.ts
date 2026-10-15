/**
 * toolPolicy.ts — 工具执行沙箱策略（进程内 L1 网关）
 *
 * 为「规划 → 执行任务 → 调用工具」链路提供统一的工具分类与审批判定：
 *   - safe    纯计算/无副作用 → 放行
 *   - read    只读（知识库/列目录/检索/读文件/解析文档）→ 放行
 *   - write   文件与仓库写入 → 交由 filePermission + ensureFileAccess 审批（此处不重复把关）
 *   - exec    本地命令/代码执行（run_shell / code_interpreter）→ 必须审批
 *   - network 浏览器导航 / 自定义 HTTP 外联 → 必须审批（SSRF/外联风险）
 *   - db      外部数据库查询（text_to_sql）→ 必须审批
 *
 * 默认策略（兼容优先）：默认允许，仅对 exec/network/db 强制 HITL 审批；
 * 若调用方未提供审批通道（如 workflow/skill/MCP 等无交互场景），这些危险工具
 * 一律 fail-closed 安全拒绝，绝不静默执行。
 */
import { randomUUID } from 'crypto';
import type { ApprovalRequest } from './agent';
import { isFullAccess } from './permissionMode';

export type ToolKind = 'safe' | 'read' | 'write' | 'exec' | 'network' | 'db';

export interface ToolPolicy {
  kind: ToolKind;
  requiresApproval: boolean;
}

const POLICY: Record<string, ToolPolicy> = {
  // 知识/计算
  search_knowledge_base: { kind: 'read', requiresApproval: false },
  calculate: { kind: 'safe', requiresApproval: false },
  get_current_time: { kind: 'safe', requiresApproval: false },
  translate_text: { kind: 'safe', requiresApproval: false },
  summarize_text: { kind: 'safe', requiresApproval: false },
  // 文件与代码库
  create_file: { kind: 'write', requiresApproval: false },
  write_file: { kind: 'write', requiresApproval: false },
  append_file: { kind: 'write', requiresApproval: false },
  read_file: { kind: 'read', requiresApproval: false },
  list_files: { kind: 'read', requiresApproval: false },
  search_files: { kind: 'read', requiresApproval: false },
  parse_document: { kind: 'read', requiresApproval: false },
  index_codebase: { kind: 'read', requiresApproval: false },
  search_codebase: { kind: 'read', requiresApproval: false },
  // git：写子命令已在 executeGit 内部审批，此处不再重复
  git: { kind: 'write', requiresApproval: false },
  // 网络：web_search 由服务端构造目标 URL，放行；浏览器与自定义 HTTP 需审批
  web_search: { kind: 'network', requiresApproval: false },
  web_navigate: { kind: 'network', requiresApproval: true },
  web_click: { kind: 'network', requiresApproval: true },
  web_type: { kind: 'network', requiresApproval: true },
  web_screenshot: { kind: 'network', requiresApproval: true },
  web_extract_text: { kind: 'network', requiresApproval: true },
  // 本地执行
  run_shell: { kind: 'exec', requiresApproval: true },
  code_interpreter: { kind: 'exec', requiresApproval: true },
  // 外部数据库
  text_to_sql: { kind: 'db', requiresApproval: true },
};

/** 未登记的工具（自定义 HTTP 工具等）默认按"外联"处理并要求审批 */
const DEFAULT_POLICY: ToolPolicy = { kind: 'network', requiresApproval: true };

export function getToolPolicy(toolName: string): ToolPolicy {
  return POLICY[toolName] ?? DEFAULT_POLICY;
}

/** 需要审批的工具清单（供测试与文档） */
export function getApprovalRequiredTools(): string[] {
  return Object.entries(POLICY)
    .filter(([, p]) => p.requiresApproval)
    .map(([name]) => name);
}

/**
 * 统一网关判定：放行返回 null；拒绝返回原因字符串。
 */
export async function gateToolExecution(
  toolName: string,
  context?: { requestApproval?: (req: ApprovalRequest) => Promise<boolean> }
): Promise<string | null> {
  const policy = getToolPolicy(toolName);
  if (!policy.requiresApproval) return null;

  // 完全访问：用户已明确把本机交给 Agent，不再逐次弹确认。
  // 与 filePermission 同一条件、同一来源（permissionMode.ts 按服务端能力裁决），
  // 保证"文件放行"和"命令放行"不会出现一个开一个没开的状态。
  // 注意这里只放开审批，不触碰敏感文件底线 —— 那一条在 filePermission 里硬拒绝。
  if (isFullAccess()) return null;

  if (!context?.requestApproval) {
    return `已安全拒绝：工具「${toolName}」（${policy.kind} 类）当前环境无审批通道，禁止执行`;
  }

  const approved = await context.requestApproval({
    requestId: randomUUID(),
    kind: policy.kind as ApprovalRequest['kind'],
    path: `tool:${toolName}`,
    inRoot: false,
    description: `Agent 请求执行「${toolName}」（${policy.kind}）`,
  });
  // 这个布尔值区分不了"用户点了拒绝"和"等待超时被自动拒绝"，
  // 所以文案不能武断写成"用户已拒绝"，否则模型会据此做出错误判断
  // （比如认定用户不想要这个工具，直接放弃整条路径）
  return approved ? null : `工具「${toolName}」未获批准（用户拒绝或等待审批超时），本次未执行`;
}
