// 对话相关类型

/**
 * 消息产物：本轮 Agent 真正落盘的文件（或产出给用户的链接）。
 *
 * 为什么由服务端给出而不是前端从 toolCalls 反推：工具入参里只有模型传的相对路径，
 * 真实落点要经输出根目录解析与审批，只有服务端工具执行处知道最终绝对路径。
 */
export interface MessageArtifact {
  /** 本地文件绝对路径；kind='url' 时是 http(s) 链接 */
  path: string;
  name: string;
  /** 字节数（本地文件） */
  size?: number;
  /** file=本地产物；url=外链 */
  kind: 'file' | 'url';
  /** 产出它的工具名，便于排查 */
  source?: string;
}

// 消息类型
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: SourceInfo[];
  toolCalls?: ToolCallInfo[];
  isStreaming?: boolean;
  mode?: string;
  plan?: PlanStep[];
  executionSteps?: ExecutionStep[];
  agentTrace?: AgentTraceItem[];
  thinking?: string;
  image?: string; // 图片消息的 base64 数据
  parentId?: string; // 父消息id（对话分支）
  branchId?: string; // 所属分支
  pendingApproval?: PendingApproval; // 桌面端文件审批卡（仅流式过程中挂到当前助手消息）
  pendingPlan?: PendingPlan; // Plan 模式前置确认卡（先展示计划，用户确认后再执行）
  artifacts?: MessageArtifact[]; // 本轮生成的文件/链接（消息末尾文件卡片）
}

// 审批类型：
//   read/write      文件读写（path 是真实磁盘路径，inRoot 才有意义）
//   exec/network/db 工具网关（toolPolicy）产生的非文件类审批，
//                   它们的 path 形如 tool:code_interpreter，且不存在
//                   "是否位于输出目录内"的概念（服务端恒传 inRoot=false）。
export type ApprovalKind = 'read' | 'write' | 'exec' | 'network' | 'db';

// 桌面端审批（内联对话卡）
export interface PendingApproval {
  requestId: string;
  kind: ApprovalKind;
  path: string;
  inRoot: boolean;
  oldContent?: string;
  newContent?: string;
  /** 非文件类审批的人类可读说明，例如「Agent 请求执行「code_interpreter」（exec）」 */
  description?: string;
  decided?: boolean; // 用户已点击（禁用按钮，避免重复提交）
  taskId?: string; // 关联的任务ID（任务引擎模式下用于审批）
}

// Plan 模式前置确认（内联对话卡）
export interface PendingPlan {
  requestId: string;
  plan: PlanStep[];
  decided?: boolean; // 用户已点击
  confirmed?: boolean; // 最终是否确认执行
  feedback?: string; // 用户附加的约束/修改
  taskId?: string; // 关联的任务ID（任务引擎模式下用于确认）
}

// 多Agent执行轨迹
export interface AgentTraceItem {
  agent: string;
  action: string;
  content: string;
}

// 规划步骤
export interface PlanStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

// 执行步骤
export interface ExecutionStep {
  type: string;
  content: string;
}

// 来源信息
export interface SourceInfo {
  source: string;
  score: number;
  content?: string;
  chunkIndex?: number;
  page?: number;
  highlightedContent?: string;
  retrievalMethod?: 'vector' | 'bm25' | 'hybrid';
}

// 工具调用信息
export interface ToolCallInfo {
  name: string;
  arguments: Record<string, any>;
  result?: string;
}

// 会话信息
export interface SessionInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  folderId?: string | null;
  isPinned?: boolean;
  tags?: string[];
  currentBranchId?: string | null;
  collectionIds?: string[];
  mode?: string; // 会话使用的模式：qa/agent/plan/multi
  model?: string | null; // 会话使用的模型ID
}

// 文件夹
export interface Folder {
  id: string;
  name: string;
  icon?: string;
  sortOrder?: number;
  createdAt?: string;
}

// 对话分支
export interface BranchInfo {
  branchId: string;
  rootMessageId?: string;
  createdAt: string;
  messageCount: number;
  preview: string;
}

// SSE 流式响应数据
export interface StreamChunk {
  type: 'session_id' | 'thinking' | 'tool_call' | 'tool_result' | 'token' | 'retrieval' | 'done' | 'error' | 'planning' | 'plan_created' | 'step_start' | 'step_done' | 'step_error' | 'summarizing' | 'qa' | 'agent_progress' | 'agent_trace' | 'approval_required' | 'plan_proposed' | 'status';
  content: string;
  // approval_required 事件携带的字段（桌面端审批）
  requestId?: string;
  kind?: ApprovalKind;
  path?: string;
  inRoot?: boolean;
  oldContent?: string;
  newContent?: string;
  /** 非文件类审批的说明，如「Agent 请求执行「code_interpreter」（exec）」 */
  description?: string;
  toolCall?: {
    name: string;
    arguments: Record<string, any>;
  };
  /** tool_result 事件携带：这次工具调用新产出的文件 */
  artifacts?: MessageArtifact[];
  sources?: SourceInfo[];
  plan?: PlanStep[];
  mode?: string;
  branch_id?: string;
  user_message_id?: string;
  taskId?: string; // 关联的任务ID（任务引擎模式下 SSE 事件统一携带）
  data?: any; // 通用附加数据（如 status 事件的 {status, final}）
}
