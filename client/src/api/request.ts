import axios from 'axios';

// Token 存储 key
const TOKEN_KEY = 'zhizhi_agent_token';

// 获取token
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// 保存token
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

// 清除token
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// 后端 API 基础地址（从环境变量读取，默认 localhost:3001）
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// 统一 axios 实例
export const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5分钟，多Agent模式需要较长时间
});

// 请求拦截器：自动带上 Authorization header
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：处理401未授权
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
      // 只有在非登录页时才跳转
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// 健康检查
export async function healthCheck() {
  const res = await api.get('/health');
  return res.data;
}
