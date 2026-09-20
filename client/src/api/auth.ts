import { api } from './request';

export interface User {
  id: string;
  username: string;
  email: string | null;
  nickname: string | null;
  avatar: string | null;
  role: string;
  status: string;
  created_at: string;
  loginStats?: any;
}

export interface LoginResponse {
  user: User;
  token: string;
  message: string;
}

export interface RegisterParams {
  username: string;
  password: string;
  email?: string;
}

export interface LoginParams {
  username: string;
  password: string;
}

export interface PasswordValidationResult {
  valid: boolean;
  strength: 'weak' | 'medium' | 'strong';
  errors: string[];
  suggestions: string[];
}

// 注册
export function register(data: RegisterParams) {
  return api.post<LoginResponse>('/api/auth/register', data);
}

// 登录
export function login(data: LoginParams) {
  return api.post<LoginResponse>('/api/auth/login', data);
}

// 获取当前用户信息
export function getCurrentUser() {
  return api.get<{ user: User }>('/api/auth/me');
}

// 更新用户资料
export function updateProfile(data: { nickname?: string; avatar?: string; email?: string }) {
  return api.put<{ user: User; message: string }>('/api/auth/profile', data);
}

// 验证 token
export function verifyToken() {
  return api.get<{ valid: boolean; userId: string; username: string }>('/api/auth/verify');
}

// 请求密码重置
export function forgotPassword(email: string) {
  return api.post('/api/auth/forgot-password', { email });
}

// 重置密码
export function resetPassword(token: string, newPassword: string) {
  return api.post('/api/auth/reset-password', { token, newPassword });
}

// 修改密码
export function changePassword(oldPassword: string, newPassword: string) {
  return api.put('/api/auth/change-password', {
    oldPassword,
    newPassword
  });
}

// 刷新 Token
export function refreshToken(refreshToken: string) {
  return api.post('/api/auth/refresh-token', { refreshToken });
}

// 登出
export function logout() {
  return api.post('/api/auth/logout');
}

// 获取登录统计
export function getLoginStats() {
  return api.get('/api/auth/me/login-stats');
}
