import { api } from './request';

// ===== 可观测性统计 =====
export async function getObservabilityStats() {
  const res = await api.get('/api/stats/observability');
  return res.data;
}

// ===== 用量统计 =====
export async function getGlobalUsage() {
  const res = await api.get('/api/usage');
  return res.data;
}

export async function getSessionUsage(sessionId: string) {
  // 注意必须带 /api 前缀：Vite 代理只转发 /api/*，缺了会 404 导致徽标无数据
  const res = await api.get(`/api/usage/session/${sessionId}`);
  return res.data;
}
