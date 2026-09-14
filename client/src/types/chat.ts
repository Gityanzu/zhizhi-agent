// 对话相关类型

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
  type: 'session_id' | 'thinking' | 'tool_call' | 'tool_result' | 'token' | 'retrieval' | 'done' | 'error' | 'planning' | 'plan_created' | 'step_start' | 'step_done' | 'step_error' | 'summarizing' | 'qa';
  content: string;
  toolCall?: {
    name: string;
    arguments: Record<string, any>;
  };
  sources?: SourceInfo[];
  plan?: PlanStep[];
  mode?: string;
  branch_id?: string;
  user_message_id?: string;
}
