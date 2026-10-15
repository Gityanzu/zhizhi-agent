import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config';
import type { ModelParams } from './llm';
import { getCachedModels } from './modelCatalog';

// ==================== 类型定义 ====================

export type ProviderType = 'openai_compatible' | 'ollama';

export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
  free?: boolean;
  providerLabel?: string;
}

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  models: ProviderModel[];
  // 运行时状态（仅 ollama 使用）
  available?: boolean;
  error?: string;
}

export interface ResolvedModel {
  id: string;
  name: string;
  description: string;
  provider: string;       // 旧字段：模型厂商（如 通义千问 / Ollama）
  free: boolean;
  providerId: string;
  providerName: string;
}

// ==================== 内置百炼模型清单（保留原默认） ====================

const BAILIAN_MODELS: ProviderModel[] = [
  // ===== 免费额度模型（阿里云百炼赠送） =====
  { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash（免费）', description: '快速响应，适合日常问答', free: true },
  { id: 'qwen3.7-flash', name: 'Qwen3.7 Flash（免费）', description: '轻量高效，响应速度快', free: true },
  { id: 'qwen3.7-flash-2026-07-15', name: 'Qwen3.7 Flash 0715（免费）', description: '指定版本，稳定可靠', free: true },
  { id: 'qwen3.8-27b', name: 'Qwen3.8 27B（免费）', description: '27B参数，能力较强', free: true },
  { id: 'qwen3.8-max', name: 'Qwen3.8 Max（免费）', description: '最强能力，适合深度推理', free: true },
  { id: 'qwen3.8-max-0902', name: 'Qwen3.8 Max 0902（免费）', description: '指定版本，最强能力', free: true },
  { id: 'qwen3.8-2.4t-a95b', name: 'Qwen3.8 2.4T A95B（免费）', description: '2.4T长上下文，超大文档处理', free: true },
  { id: 'qwen3.5-ocr', name: 'Qwen3.5 OCR（免费）', description: 'OCR图文识别专用', free: true },
  { id: 'kimi-k3', name: 'Kimi K3（免费）', description: '月之暗面，长上下文能力强', free: true },
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code（免费）', description: '代码专用模型，编程能力强', free: true },
  { id: 'deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash（免费）', description: '深度求索，代码能力强', free: true },
  { id: 'glm-5.2', name: 'GLM 5.2（免费）', description: '智谱AI，综合能力均衡', free: true },
  // ===== 付费模型 =====
  { id: 'qwen-turbo', name: '通义千问 Turbo', description: '快速响应，适合日常问答', free: false },
  { id: 'qwen-plus', name: '通义千问 Plus', description: '均衡性能，适合复杂推理', free: false },
  { id: 'qwen-max', name: '通义千问 Max', description: '最强能力，适合深度分析', free: false },
  { id: 'qwen-long', name: '通义千问 Long', description: '长上下文，支持1000万token', free: false },
  { id: 'qwen3-4b', name: '通义千问3 4B', description: '轻量高效，本地部署友好', free: false },
];

// ==================== DeepSeek 官方模型清单 ====================
// DeepSeek 走用户自带 API Key（user_api_keys.provider = 'deepseek'），
// 因此这里只登记"厂商能提供哪些模型"，key 在请求级由用户凭据覆盖。

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

const DEEPSEEK_MODELS: ProviderModel[] = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', description: '通用对话，响应快、成本低', free: false },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: '深度推理，适合复杂分析与代码', free: false },
];

// ==================== 运行时状态 ====================

const OLLAMA_BASE = 'http://localhost:11434';
const OLLAMA_OPENAI_BASE = 'http://localhost:11434/v1';

let ollamaAvailable = false;
let ollamaModels: ProviderModel[] = [];
let ollamaChecked = false;

let currentProviderId = 'bailian';
let currentModelName: string = config.llm.modelName;

// 这里曾有 requestModelOverride（请求级 model/provider 覆盖），但它只有清理调用、
// 没有任何设置点，等于永远为 null —— 是死代码，已移除。
// "每个用户用哪个模型"改由用户级偏好（user_model_preferences）+ 请求上下文承载，
// 见 llm.ts 的 resolveProviderAndModel 与 userModelPreference.ts。
function effectiveCurrent(): { providerId: string; modelName: string } {
  return { providerId: currentProviderId, modelName: currentModelName };
}

// ==================== Provider 定义 ====================

function buildBailianProvider(): Provider {
  return {
    id: 'bailian',
    name: '百炼',
    type: 'openai_compatible',
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    models: BAILIAN_MODELS,
  };
}

function buildDeepSeekProvider(): Provider {
  return {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai_compatible',
    baseUrl: DEEPSEEK_BASE_URL,
    // 全局兜底 Key：多数场景应为空，实际使用用户自己的 Key（见 llm.ts 的请求级凭据覆盖）
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    models: DEEPSEEK_MODELS,
  };
}

function buildOllamaProvider(): Provider {
  return {
    id: 'ollama',
    name: 'Ollama 本地',
    type: 'ollama',
    baseUrl: OLLAMA_OPENAI_BASE,
    apiKey: 'ollama',
    models: ollamaModels,
    available: ollamaAvailable,
  };
}

/**
 * 动态清单只做「补充」不做删除：
 * 静态清单里的友好名称、"免费"标记、以及 qwen3.5-ocr 这类专业模型都不能被动态结果覆盖掉。
 */
function withDynamicModels(provider: Provider): Provider {
  const dynamic = getCachedModels(provider.id);
  if (!dynamic?.length) return provider;
  const known = new Set(provider.models.map((m) => m.id));
  const extra = dynamic.filter((m) => !known.has(m.id));
  return extra.length ? { ...provider, models: [...provider.models, ...extra] } : provider;
}

/** 返回配置的提供商列表（含运行状态，已并入动态拉取到的模型） */
export function getProviders(): Provider[] {
  const list: Provider[] = [buildBailianProvider(), buildDeepSeekProvider()];
  // Ollama 始终列出，未运行时前端据此显示"未检测到"
  const ollama = buildOllamaProvider();
  if (!ollamaAvailable) {
    ollama.error = 'Ollama未运行';
  }
  list.push(ollama);
  return list.map(withDynamicModels);
}

/**
 * 可配置 API Key 的厂商清单。
 * 前端"厂商"下拉据此渲染，从源头杜绝"选项里有、后端不支持、选了必然静默失败"的问题
 * （此前前端写死的 openai 选项后端就没有对应 provider）。
 */
export function getConfigurableProviders(): Array<{
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  requiresKey: boolean;
  modelCount: number;
}> {
  return getProviders().map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl: p.baseUrl,
    requiresKey: p.type !== 'ollama',
    modelCount: p.models.length,
  }));
}

// ==================== 厂商 id 归一化 ====================

/**
 * user_api_keys.provider 存的是界面上的厂商别名（dashscope / openai / deepseek / ollama），
 * 而内置 provider id 是 bailian / deepseek / ollama —— 两套命名不一致会导致
 * "用户配了 Key 却匹配不到任何厂商"，于是静默回退到全局 Key。
 * 这里统一收敛到内置 id。
 */
const PROVIDER_ALIASES: Record<string, string> = {
  dashscope: 'bailian',
  bailian: 'bailian',
  aliyun: 'bailian',
  'aliyun-bailian': 'bailian',
  qwen: 'bailian',
  deepseek: 'deepseek',
  ollama: 'ollama',
  openai: 'openai',
};

export function normalizeProviderId(raw?: string | null): string | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  return PROVIDER_ALIASES[key] || key;
}

/** 按（可能是别名的）厂商 id 取 provider 定义 */
export function getProviderById(providerId?: string | null): Provider | null {
  const id = normalizeProviderId(providerId);
  if (!id) return null;
  return getProviders().find((p) => p.id === id) || null;
}

/** 该模型 id 是否属于指定厂商 */
export function providerHasModel(providerId: string | null | undefined, modelId: string): boolean {
  const provider = getProviderById(providerId);
  if (!provider) return false;
  return provider.models.some((m) => m.id === modelId);
}

// ==================== Ollama 检测 ====================

/**
 * 检测本地 Ollama 运行状态并拉取模型列表。
 * 3 秒超时，失败返回空数组并标记不可用，不阻塞调用方。
 */
export async function detectOllamaModels(force: boolean = false): Promise<ProviderModel[]> {
  if (ollamaChecked && !force) {
    return ollamaModels;
  }
  ollamaChecked = true;
  ollamaAvailable = false;
  ollamaModels = [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`Ollama 响应状态 ${resp.status}`);
    }
    const data: any = await resp.json();
    const raw: any[] = Array.isArray(data?.models) ? data.models : [];
    ollamaModels = raw.map((m: any) => {
      const name: string = m?.name || m?.model || 'unknown';
      return {
        id: name,
        name: name,
        description: 'Ollama 本地模型',
        free: true,
      } as ProviderModel;
    });
    ollamaAvailable = true;
    return ollamaModels;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      console.warn('[Ollama] 连接超时（3秒），Ollama未运行');
    } else {
      console.warn('[Ollama] 检测失败，Ollama未运行:', e?.message || e);
    }
    ollamaAvailable = false;
    ollamaModels = [];
    return ollamaModels;
  } finally {
    clearTimeout(timer);
  }
}

export function isOllamaAvailable(): boolean {
  return ollamaAvailable;
}

// ==================== 模型合并与查询 ====================

/** 在所有 provider 中按模型 id 查找模型元信息 */
export function findModel(modelId: string): { resolved: ResolvedModel; provider: Provider } | null {
  for (const provider of getProviders()) {
    const m = provider.models.find((mm) => mm.id === modelId);
    if (m) {
      return {
        provider,
        resolved: {
          id: m.id,
          name: m.name,
          description: m.description || '',
          provider: provider.name,
          free: !!m.free,
          providerId: provider.id,
          providerName: provider.name,
        },
      };
    }
  }
  return null;
}

/** 合并所有 provider 的模型，每个模型标注 providerId / providerName */
export function getAllModels(): ResolvedModel[] {
  const result: ResolvedModel[] = [];
  for (const provider of getProviders()) {
    for (const m of provider.models) {
      result.push({
        id: m.id,
        name: m.name,
        description: m.description || '',
        provider: provider.name,
        free: !!m.free,
        providerId: provider.id,
        providerName: provider.name,
      });
    }
  }
  return result;
}

/** 返回按 provider 分组的模型列表 */
export function getModelsGroupedByProvider(): Array<{
  providerId: string;
  providerName: string;
  type: ProviderType;
  available: boolean;
  error?: string;
  models: ResolvedModel[];
}> {
  return getProviders().map((p) => ({
    providerId: p.id,
    providerName: p.name,
    type: p.type,
    available: p.available !== false,
    error: p.error,
    models: p.models.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description || '',
      provider: p.name,
      free: !!m.free,
      providerId: p.id,
      providerName: p.name,
    })),
  }));
}

// ==================== 当前 provider / model 状态 ====================

export function getCurrentProvider(): string {
  return currentProviderId;
}

export function setCurrentProvider(providerId: string): boolean {
  const exists = getProviders().some((p) => p.id === providerId);
  if (!exists) return false;
  currentProviderId = providerId;
  return true;
}

export function getCurrentModelName(): string {
  return currentModelName;
}

/** 获取当前 provider（考虑请求级覆盖） */
export function getCurrentProviderInfo(): Provider {
  const eff = effectiveCurrent();
  return getProviders().find((p) => p.id === eff.providerId) || buildBailianProvider();
}

// ==================== LLM 实例构建 ====================

/**
 * 根据 providerId + modelName 创建 ChatOpenAI 实例。
 * 不传 providerId 时使用当前 provider。
 * 支持传入自定义 apiKey 和 baseUrl（用于用户级 API Key）。
 */
export function getLLMForProvider(
  providerId: string | undefined,
  modelName: string,
  params?: ModelParams,
  customApiKey?: string,
  customBaseUrl?: string
): ChatOpenAI {
  const provider = providerId
    ? getProviders().find((p) => p.id === providerId)
    : getCurrentProviderInfo();

  if (!provider) {
    throw new Error(`未知的模型提供商: ${providerId}`);
  }

  const p = params || {};
  const apiKey = customApiKey || provider.apiKey || 'ollama';
  const baseUrl = customBaseUrl || provider.baseUrl;

  const options: Record<string, any> = {
    openAIApiKey: apiKey,
    configuration: {
      baseURL: baseUrl,
    },
    modelName,
    temperature: p.temperature ?? config.llm.temperature,
    maxTokens: p.max_tokens ?? config.llm.maxTokens,
    streaming: true,
  };
  if (p.top_p !== undefined) options.topP = p.top_p;
  if (p.presence_penalty !== undefined) options.presencePenalty = p.presence_penalty;
  if (p.frequency_penalty !== undefined) options.frequencyPenalty = p.frequency_penalty;
  return new ChatOpenAI(options as any);
}

/**
 * 设置当前使用的模型与 provider。
 * 不传 providerId 时在所有 provider 中按模型 id 查找（向后兼容）。
 */
export function setModel(modelName: string, providerId?: string): boolean {
  let resolvedProviderId = providerId;
  if (!resolvedProviderId) {
    const found = findModel(modelName);
    if (!found) return false;
    resolvedProviderId = found.provider.id;
  } else {
    const provider = getProviders().find((p) => p.id === resolvedProviderId);
    if (!provider) return false;
    const exists = provider.models.some((m) => m.id === modelName);
    if (!exists) return false;
  }
  currentProviderId = resolvedProviderId;
  currentModelName = modelName;
  return true;
}

/** 获取当前模型的完整解析信息（考虑请求级覆盖） */
export function getCurrentModelInfo() {
  const eff = effectiveCurrent();
  const found = findModel(eff.modelName);
  return {
    id: eff.modelName,
    name: found?.resolved.name || eff.modelName,
    description: found?.resolved.description || '',
    provider: found?.resolved.provider || '',
    free: found?.resolved.free || false,
    providerId: found?.resolved.providerId || eff.providerId,
    providerName: found?.resolved.providerName || '',
    baseUrl: found?.provider.baseUrl || config.llm.baseUrl,
  };
}

/**
 * 只返回指定厂商的模型分组。
 * 用途：登录用户按其已配置 API Key 的厂商拉取"我能用哪些模型"，
 * 避免下拉里出现自己根本没有 Key、选了必然报错的模型。
 */
export function getModelsGroupedByProviders(providerIds: Array<string | null | undefined>): Array<{
  providerId: string;
  providerName: string;
  type: ProviderType;
  available: boolean;
  error?: string;
  models: ResolvedModel[];
}> {
  const wanted = new Set(
    providerIds.map((p) => normalizeProviderId(p)).filter((p): p is string => !!p)
  );
  if (wanted.size === 0) return [];
  return getModelsGroupedByProvider().filter((g) => wanted.has(g.providerId));
}
