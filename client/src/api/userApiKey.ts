import { api } from './request';

export interface UserApiKey {
  id: string;
  user_id: string;
  provider: string;
  name: string;
  key_prefix: string | null;
  base_url: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AddApiKeyParams {
  provider: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  isDefault?: boolean;
}

// 获取用户的所有API Key
export function getUserApiKeys() {
  return api.get<{ keys: UserApiKey[] }>('/api/user-api-keys');
}

// 添加API Key
export function addUserApiKey(data: AddApiKeyParams) {
  return api.post<{ key: UserApiKey; message: string }>('/api/user-api-keys', data);
}

// 删除API Key
export function deleteUserApiKey(id: string) {
  return api.delete<{ message: string }>(`/api/user-api-keys/${id}`);
}

// 设为默认
export function setDefaultApiKey(id: string) {
  return api.put<{ message: string }>(`/api/user-api-keys/${id}/default`);
}

// 后端支持的厂商（"厂商"下拉据此渲染，不再前端写死）
export interface ProviderOption {
  id: string;
  name: string;
  type: 'openai_compatible' | 'ollama';
  baseUrl: string;
  requiresKey: boolean;
  modelCount: number;
}

export function getProviderOptions() {
  return api.get<{ providers: ProviderOption[] }>('/api/user-api-keys/providers');
}

// 当前生效的模型配置：登录后据此知道"我配了哪个厂商的 Key、能用哪些模型"
export interface ActiveApiKeyInfo {
  configured: boolean;
  /** Key 的厂商是否匹配到了后端内置厂商；false 时前端必须提示而非静默回退 */
  matched: boolean;
  provider: string | null;
  providerId: string | null;
  providerName: string | null;
  keyPrefix: string | null;
  baseUrl: string | null;
  models: any[];
  groups: any[];
  /** 用户当前选中的模型（用户级，请求级生效） */
  currentModel: string | null;
  /** 用户添加的自定义模型（厂商清单之外的 id） */
  customModels: Array<{ provider: string; id: string }>;
  /** 非空时必须展示给用户（厂商不支持 / 刷新失败 / 无可用模型） */
  warning: string | null;
}

export function getActiveApiKey(refresh = false) {
  return api.get<ActiveApiKeyInfo>(`/api/user-api-keys/active${refresh ? '?refresh=1' : ''}`);
}

// 设置用户当前使用的模型（用户级偏好，随凭据在请求级生效）
export function setCurrentModel(modelId: string, providerId?: string) {
  return api.post<{ message: string; providerId: string; modelId: string }>(
    '/api/user-api-keys/current-model',
    { modelId, providerId }
  );
}

// 添加自定义模型（厂商清单之外的 model id，如带日期的版本号）
export function addCustomModel(modelId: string, providerId?: string) {
  return api.post<{
    message: string;
    modelId: string;
    providerId: string;
    customModels: Array<{ provider: string; id: string }>;
  }>('/api/user-api-keys/custom-models', { modelId, providerId });
}

// 删除自定义模型
export function removeCustomModel(modelId: string) {
  return api.delete<{ message: string; customModels: Array<{ provider: string; id: string }> }>(
    `/api/user-api-keys/custom-models/${encodeURIComponent(modelId)}`
  );
}

// 用当前 Key 向厂商拉取最新模型清单
export function refreshProviderModels() {
  return api.post<{
    success: boolean;
    message: string;
    count: number;
    models: any[];
    groups: any[];
    error: string | null;
  }>('/api/user-api-keys/refresh-models');
}
