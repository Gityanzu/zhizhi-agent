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

// 注册
export function register(data: RegisterParams) {
  return api.post<LoginResponse>('/auth/register', data);
}

// 登录
export function login(data: LoginParams) {
  return api.post<LoginResponse>('/auth/login', data);
}

// 获取当前用户信息
export function getCurrentUser() {
  return api.get<{ user: User }>('/auth/me');
}

// 更新用户资料
export function updateProfile(data: { nickname?: string; avatar?: string; email?: string }) {
  return api.put<{ user: User; message: string }>('/auth/profile', data);
}

// 验证token
export function verifyToken() {
  return api.get<{ valid: boolean; userId: string; username: string }>('/auth/verify');
}
