// 知识库相关类型

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

// 知识库集合
export interface Collection {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  createdAt?: string;
  updatedAt?: string;
}

// 记忆
export interface MemoryItem {
  id: string;
  content: string;
  type: 'preference' | 'fact' | 'history';
  source?: string;
  createdAt: string;
  updatedAt: string;
}

// 提示词模板
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
