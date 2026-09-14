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
  retrievalMethod?: 'vector' | 'bm25' | 'hybrid';
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
}

// 文件夹信息
export interface Folder {
  id: string;
  name: string;
  icon?: string;
  sortOrder?: number;
  createdAt?: string;
}

// 分支信息
export interface BranchInfo {
  branchId: string;
  rootMessageId?: string;
  createdAt: string;
  messageCount: number;
  preview: string;
}
