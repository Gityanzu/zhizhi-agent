import axios from 'axios';

// 后端 API 基础地址（从环境变量读取，默认 localhost:3001）
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// 统一 axios 实例
export const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5分钟，多Agent模式需要较长时间
});

// 健康检查
export async function healthCheck() {
  const res = await api.get('/health');
  return res.data;
}
