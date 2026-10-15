import { api } from './request';

/**
 * 用户设置相关接口。
 *
 * 约定：所有 HTTP 调用统一走本目录，组件内不得直接 import axios 或调用 fetch ——
 * 否则 token 注入、401 跳转、baseURL 这些公共逻辑会被绕过（此前 UserSettings.vue /
 * Sidebar.vue 直接 axios.get + 拼接 API_BASE 就是这类问题）。
 */

export interface UserProfile {
  nickname: string;
  role: string;
  avatar: string;
  [key: string]: any;
}

export interface UserPreferences {
  theme?: string;
  defaultModel?: string;
  defaultMode?: string;
  voiceEnabled?: boolean;
  ttsEnabled?: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  /** 桌面端 Agent 文件输出根目录（留空 = 用默认目录） */
  agentOutputDir?: string;
  [key: string]: any;
}

export interface UserSettingsPayload {
  profile: UserProfile;
  preferences: UserPreferences;
  /** 服务端是否支持「完全访问」（Web 托管后端恒为 false，前端据此隐藏开关） */
  fullAccessSupported?: boolean;
  /** 旧版（单用户）API Key，兼容字段 */
  llmKeys?: any[];
  updatedAt?: string;
}

/** 读取用户设置（资料 / 偏好 / 旧版 API Key） */
export async function getUserSettings(): Promise<UserSettingsPayload> {
  const res = await api.get<UserSettingsPayload>('/api/user/settings');
  return res.data;
}

/** 保存资料 */
export async function updateUserProfile(profile: Partial<UserProfile>): Promise<void> {
  await api.put('/api/user/settings/profile', profile);
}

/** 保存偏好 */
export async function updateUserPreferences(preferences: UserPreferences): Promise<void> {
  await api.put('/api/user/settings/preferences', preferences);
}

/**
 * 保存 Agent 权限模式（本机默认 / 允许全部）。
 * 独立接口而不是塞进 updateUserPreferences：那个是整包覆盖，
 * 而权限切换是从输入框上随手点的，只带一个字段过去会把其它偏好清空。
 */
export async function setPermissionMode(
  mode: 'sandbox' | 'full'
): Promise<{ mode: 'sandbox' | 'full'; fullAccessSupported: boolean }> {
  const res = await api.put<{ mode: 'sandbox' | 'full'; fullAccessSupported: boolean }>(
    '/api/user/settings/permission-mode',
    { mode }
  );
  return res.data;
}

/** 删除旧版（单用户）设置里的 API Key */
export async function deleteUserSettingsApiKey(id: string): Promise<void> {
  await api.delete(`/api/user/settings/api-keys/${encodeURIComponent(id)}`);
}

/** 导出备份数据（返回 Blob 供下载） */
export async function exportUserData(): Promise<Blob> {
  const res = await api.get('/api/user/export', { responseType: 'blob' });
  return res.data as Blob;
}

/** 导入备份数据，返回导入条数 */
export async function importUserData(data: unknown): Promise<{ imported: number }> {
  const res = await api.post<{ imported: number }>('/api/user/import', data);
  return res.data;
}
