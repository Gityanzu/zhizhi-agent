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
  return api.get<{ keys: UserApiKey[] }>('/user-api-keys');
}

// 添加API Key
export function addUserApiKey(data: AddApiKeyParams) {
  return api.post<{ key: UserApiKey; message: string }>('/user-api-keys', data);
}

// 删除API Key
export function deleteUserApiKey(id: string) {
  return api.delete<{ message: string }>(`/user-api-keys/${id}`);
}

// 设为默认
export function setDefaultApiKey(id: string) {
  return api.put<{ message: string }>(`/user-api-keys/${id}/default`);
}
