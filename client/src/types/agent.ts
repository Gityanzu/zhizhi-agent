// Agent相关类型

// Skill 技能信息
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  triggerKeywords: string[];
  allowedTools: string[];
  source?: 'builtin' | 'file' | 'custom';
  isActive?: boolean;
}

// 技能详情（SKILL.md 正文 + references 深度文档）
export interface SkillDetail {
  skill: SkillInfo;
  body: string;
  version: string;
  references: Array<{ name: string; content: string }>;
}

// 自定义Agent
export interface CustomAgent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  model: string;
  tools: string[];
  temperature: number;
  createdAt: string;
  updatedAt: string;
}

// 自定义API工具
export interface CustomTool {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  paramsSchema: any;
  bodyTemplate: string;
  createdAt: string;
  updatedAt: string;
}

// 工作流
export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowData {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  inputVariables?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}
