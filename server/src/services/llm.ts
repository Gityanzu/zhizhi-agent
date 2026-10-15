import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AsyncLocalStorage } from 'async_hooks';
import { createHash } from 'crypto';
import { config } from '../config';
import {
  getLLMForProvider,
  getAllModels,
  getCurrentModelInfo,
  setModel as providerSetModel,
  getCurrentProvider,
  getProviderById,
  providerHasModel,
} from './llmProvider';

// 模型可调参数（第一阶段功能2）
export interface ModelParams {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

// LLM 实例缓存：必须按「厂商 + 模型 + 凭据 + 参数」键控。
// 只留一个全局单例的话，未配置 Key 的用户会复用上一个用户带 Key 的实例（密钥串用）。
const llmCache = new Map<string, ChatOpenAI>();
const LLM_CACHE_LIMIT = 20;

let embeddingsInstance: OpenAIEmbeddings | null = null;

// 请求级参数覆盖：正常走请求上下文（见下方 LlmRequestContext）；
// fallback 仅供「上下文之外」的调用（脚本、单测、未包上下文的旧调用点）使用。
let fallbackParamsOverride: ModelParams | null = null;

// 请求级用户凭据覆盖（多用户支持，每个用户用自己的 API Key + 厂商）
export interface UserApiCredential {
  apiKey: string;
  baseUrl?: string;
  /** Key 归属的厂商（内置 provider id 或界面别名，内部会归一化） */
  providerId?: string;
  /** 用户当前选中的模型（必须属于 providerId，或在该用户的自定义清单里） */
  modelName?: string;
  /** 用户自定义的模型 id（厂商清单之外），允许在请求级使用 */
  customModels?: string[];
}

/** 请求级 LLM 上下文：用户凭据 + 参数覆盖都放这里 */
export interface LlmRequestContext {
  credential?: UserApiCredential;
  paramsOverride?: ModelParams;
}

// 必须跟随「本次异步调用链」，不能放模块级变量：请求/任务是并发执行的，模块级状态会被
// 别人覆盖（A 的请求带上 B 的 Key、或 B 的 temperature）。AsyncLocalStorage 天然隔离。
// 安全性质：上下文缺失时只会「读不到」→ 回退全局配置，绝不会读到别人的凭据或参数。
const requestContextStore = new AsyncLocalStorage<LlmRequestContext | undefined>();

/** 建立请求上下文；入口处包一层，链内部即可拿到隔离的凭据与参数 */
export function runWithRequestContext<T>(context: LlmRequestContext, fn: () => T): T {
  return requestContextStore.run(context, fn);
}

/** 带用户凭据的上下文（最常用入口） */
export function runWithUserCredential<T>(credential: UserApiCredential | null, fn: () => T): T {
  return runWithRequestContext({ credential: credential ?? undefined }, fn);
}

// 设置本次请求的模型参数覆盖（用完务必调用 setRequestParams(null) 清除）
export function setRequestParams(params: ModelParams | null): void {
  const ctx = requestContextStore.getStore();
  if (ctx) {
    ctx.paramsOverride = params ?? undefined;
  } else {
    fallbackParamsOverride = params ?? null;
  }
  // 参数变化后旧实例不再可用，清空缓存
  if (params) {
    llmCache.clear();
  }
}

/** 当前生效的请求级参数（上下文优先，其次兜底变量） */
export function getRequestParamsOverride(): ModelParams | undefined {
  const ctx = requestContextStore.getStore();
  return ctx ? ctx.paramsOverride : fallbackParamsOverride ?? undefined;
}

export function getRequestUserCredential(): UserApiCredential | null {
  return requestContextStore.getStore()?.credential ?? null;
}

// 获取当前有效的API Key配置（用户凭据优先，回退全局配置）
export function getEffectiveApiKey(): { apiKey: string; baseUrl: string } {
  const cred = getRequestUserCredential();
  if (cred) {
    return {
      apiKey: cred.apiKey,
      baseUrl: cred.baseUrl || config.llm.baseUrl
    };
  }
  return {
    apiKey: config.llm.apiKey,
    baseUrl: config.llm.baseUrl
  };
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
    llmCache.clear(); // 模型变了，旧实例全部失效
  }
  return ok;
}

/**
 * 解析本次请求真正要用的 provider + model。
 *
 * 用户配置的 Key 是绑定厂商的：拿 DeepSeek 的 Key 去请求百炼地址必然 401/404，
 * 所以当用户 Key 的厂商与"当前全局模型"所属厂商不一致时，自动把模型收敛到
 * 该厂商下的可用模型（优先用户指定 → 当前模型同名 → 厂商首个模型）。
 */
function resolveProviderAndModel(): { providerId: string; modelName: string } {
  const info = getCurrentModelInfo();
  const cred = getRequestUserCredential();
  if (!cred?.providerId) return { providerId: info.providerId, modelName: info.id };

  const provider = getProviderById(cred.providerId);
  if (!provider) return { providerId: info.providerId, modelName: info.id };

  // 用户自定义的模型 id 也视为可用（厂商清单之外，如百炼上的带日期版本号）
  const usable = (id: string): boolean =>
    providerHasModel(provider.id, id) || (cred.customModels || []).includes(id);

  const modelName =
    (cred.modelName && usable(cred.modelName) ? cred.modelName : null)
    || (usable(info.id) ? info.id : null)
    || provider.models[0]?.id
    || info.id;

  return { providerId: provider.id, modelName };
}

// 根据参数构建当前 provider + model 的 ChatOpenAI 实例
function buildLLM(params?: ModelParams): ChatOpenAI {
  const { providerId, modelName } = resolveProviderAndModel();
  const cred = getRequestUserCredential();
  return getLLMForProvider(
    providerId,
    modelName,
    params,
    cred?.apiKey,
    cred?.baseUrl
  );
}

/** 对外暴露解析结果：前端/日志需要知道"这次到底用的哪个厂商的哪个模型" */
export function getResolvedProviderAndModel(): { providerId: string; modelName: string } {
  return resolveProviderAndModel();
}

/** 缓存键：厂商 + 模型 + 凭据 + 参数，任一不同都不得复用实例 */
function llmCacheKey(params?: ModelParams): string {
  const cred = getRequestUserCredential();
  const { providerId, modelName } = resolveProviderAndModel();
  // 只取 Key 的指纹入键，避免明文 Key 出现在内存字符串里
  const keyId = cred?.apiKey
    ? createHash('sha1').update(cred.apiKey).digest('hex').slice(0, 8)
    : 'global';
  return [providerId, modelName, keyId, cred?.baseUrl || '', JSON.stringify(params || {})].join('|');
}

// 获取大模型实例（按 凭据 + 参数 键控缓存；凭据不同绝不复用）
export function getLLM(): ChatOpenAI {
  const params = getRequestParamsOverride();
  const key = llmCacheKey(params);
  const cached = llmCache.get(key);
  if (cached) return cached;

  const instance = buildLLM(params);
  // 容量兜底：只保留最近若干实例，避免随用户数无限增长
  if (llmCache.size >= LLM_CACHE_LIMIT) llmCache.clear();
  llmCache.set(key, instance);
  return instance;
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
