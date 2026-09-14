import { api } from './request';

// ===== 可观测性统计 =====
export async function getObservabilityStats() {
  const res = await api.get('/stats/observability');
  return res.data;
}

// ===== 用量统计 =====
export async function getGlobalUsage() {
  const res = await api.get('/usage');
  return res.data;
}

export async function getSessionUsage(sessionId: string) {
  const res = await api.get(`/usage/session/${sessionId}`);
  return res.data;
}
