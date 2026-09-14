import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { config } from '../config';
import {
  getLLMForProvider,
  getAllModels,
  getCurrentModelInfo,
  setModel as providerSetModel,
  getCurrentProvider,
} from './llmProvider';

// 模型可调参数（第一阶段功能2）
export interface ModelParams {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

let llmInstance: ChatOpenAI | null = null;
let embeddingsInstance: OpenAIEmbeddings | null = null;

// 请求级参数覆盖（流式请求期间临时生效，避免改动全部调用点）
let requestParamsOverride: ModelParams | null = null;

// 设置本次请求的模型参数覆盖（用完务必调用 setRequestParams(null) 清除）
export function setRequestParams(params: ModelParams | null): void {
  requestParamsOverride = params;
  // 参数覆盖时清除缓存实例，确保下次 getLLM 使用新参数
  if (params) {
    llmInstance = null;
  }
}

// 兼容旧导出：可用模型列表改为从 llmProvider 动态获取（含 Ollama 本地模型）。
// 旧代码无其他文件直接引用本常量，统一使用 getAvailableModels() 获取最新列表。
export function getAvailableModelsList() {
  return getAllModels();
}
// 保留命名导出（不保证实时性，仅作兼容占位）
export const AVAILABLE_MODELS: any[] = [];

// 获取当前模型信息
export function getCurrentModel() {
  return getCurrentModelInfo();
}

// 获取可用模型列表（扁平数组）
export function getAvailableModels() {
  return getAllModels();
}

// 切换模型（兼容旧调用：仅传模型名时自动查找所属 provider）
export function setModel(modelName: string, providerId?: string): boolean {
  const ok = providerSetModel(modelName, providerId);
  if (ok) {
    llmInstance = null; // 重置实例，下次获取时使用新模型
  }
  return ok;
}

// 根据参数构建当前 provider + model 的 ChatOpenAI 实例
function buildLLM(params?: ModelParams): ChatOpenAI {
  const info = getCurrentModelInfo();
  return getLLMForProvider(info.providerId, info.id, params);
}

// 获取大模型实例（默认走缓存单例；若本次请求设置了参数覆盖则返回带参数的临时实例）
export function getLLM(): ChatOpenAI {
  if (requestParamsOverride) {
    return buildLLM(requestParamsOverride);
  }
  if (!llmInstance) {
    llmInstance = buildLLM();
  }
  return llmInstance;
}

// 使用自定义参数获取大模型实例（每次新建，不影响单例）
export function getLLMWithParams(params: ModelParams): ChatOpenAI {
  return buildLLM(params);
}

// 获取 Embedding 实例（Embedding 仍走默认百炼配置）
export function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddingsInstance) {
    embeddingsInstance = new OpenAIEmbeddings({
      openAIApiKey: config.llm.apiKey,
      configuration: {
        baseURL: config.llm.baseUrl,
      },
      modelName: config.llm.embeddingModelName,
    });
  }
  return embeddingsInstance;
}

// 检查 API Key 是否配置
export function isLLMConfigured(): boolean {
  return !!config.llm.apiKey && config.llm.apiKey !== 'your_api_key_here';
}
