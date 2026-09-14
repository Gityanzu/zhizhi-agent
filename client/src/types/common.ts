// 代码执行相关类型

// 代码执行结果
export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  images: string[];
}

// 数据库连接
export interface DBConnectionData {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'sqlite';
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  createdAt: string;
  updatedAt: string;
}

// 分享结果
export interface ShareResult {
  id: string;
  shareUrl: string;
  password?: string;
  expiresAt?: string;
}

// API Key
export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

// 用户设置
export interface UserSettings {
  nickname: string;
  role: string;
  avatar?: string;
  theme: 'light' | 'dark';
  defaultModel: string;
  defaultMode: string;
  voiceInputEnabled: boolean;
  autoSpeakEnabled: boolean;
}
