// 模型相关类型

// 模型信息（store中使用）
export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  provider: string;
  free?: boolean;
  providerId?: string;
  providerName?: string;
}

// 模型生成参数
export interface ModelParams {
  temperature: number;
  top_p: number;
  max_tokens: number;
  presence_penalty: number;
  frequency_penalty: number;
}

// 多提供商
export interface Provider {
  id: string;
  name: string;
  type: 'openai_compatible' | 'ollama';
  baseUrl: string;
  modelCount: number;
  available: boolean;
  error?: string;
}

export interface ProviderGroup {
  providerId: string;
  providerName: string;
  type: 'openai_compatible' | 'ollama';
  available: boolean;
  error?: string;
  models: ModelEntry[];
}

export interface ModelEntry {
  id: string;
  name: string;
  description: string;
  provider: string;
  free: boolean;
  providerId: string;
  providerName: string;
}

// 模型对比
export interface CompareTarget {
  model: string;
  providerId?: string;
}

export interface CompareResult {
  index: number;
  model: string;
  providerId: string;
  modelLabel: string;
  answer: string;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  elapsedMs?: number;
  error?: string;
  done: boolean;
}
