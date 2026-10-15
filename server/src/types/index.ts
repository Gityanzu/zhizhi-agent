// 消息类型
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode?: string;
  timestamp?: string;
  sources?: any[];
  toolCalls?: any[];
  thinking?: string;
  plan?: any;
  agentTrace?: any[];
  tokenUsage?: any;
  parentId?: string;
  branchId?: string;
  /** 本轮执行耗时（毫秒），前端「已完成 Xs」展示用 */
  durationMs?: number;
  /** 本轮产出的文件/链接（消息末尾文件卡片的数据源） */
  artifacts?: MessageArtifact[];
}

/**
 * 消息产物：Agent 在本轮真正落盘的文件（或产出给用户的链接）。
 *
 * 为什么不用工具结果文本反推：`tool_calls.arguments` 里只有模型传的相对路径/目录名，
 * 真实落点要经过输出根目录解析与审批回写，只有工具执行处才拿得到最终绝对路径。
 * 因此由文件工具在写入成功后登记（见 agent.ts 的 recordArtifact），随 SSE 下发并落库。
 */
export interface MessageArtifact {
  /** 本地文件绝对路径；kind='url' 时是 http(s) 链接 */
  path: string;
  name: string;
  /** 字节数（本地文件）；链接不存在 */
  size?: number;
  /** file=本地产物；url=外链 */
  kind: 'file' | 'url';
  /** 产出它的工具名，便于排查是哪个工具写的 */
  source?: string;
}

// 工具调用结果
export interface ToolCallResult {
  tool: string;
  args: Record<string, any>;
  result: string;
}

// Agent 执行步骤
export interface AgentStep {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'final_answer' | 'planning' | 'step_start' | 'step_done' | 'review' | 'qa';
  content: string;
  toolCall?: {
    name: string;
    arguments: Record<string, any>;
  };
}

// 文档信息
export interface DocumentInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadTime: string;
  chunkCount: number;
  collectionId?: string | null;
}

// 检索结果
export interface RetrievalResult {
  content: string;
  source: string;
  score: number;
  metadata: Record<string, any>;
  // 功能9：溯源展示优化
  chunkIndex?: number;
  page?: number;
  highlightedContent?: string;
  retrievalMethod?: 'vector' | 'bm25' | 'hybrid' | 'rerank';
}

// 知识库集合
export interface CollectionInfo {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  createdAt?: string;
  updatedAt?: string;
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
  collectionIds?: string[]; // 功能8：关联的知识库集合
  mode?: string; // 会话使用的模式：qa/agent/plan/multi
  model?: string | null; // 会话使用的模型ID
  userId?: string | null; // 归属用户 ID（NULL = 未登录/存量匿名），用于多用户隔离
}

// 文件夹信息
export interface Folder {
  id: string;
  name: string;
  icon?: string;
  sortOrder?: number;
  createdAt?: string;
  userId?: string | null; // 归属用户 ID，用于多用户隔离
}

// 分支信息
export interface BranchInfo {
  branchId: string;
  rootMessageId?: string;
  createdAt: string;
  messageCount: number;
  preview: string;
}
