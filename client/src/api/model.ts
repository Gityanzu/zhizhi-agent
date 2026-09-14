import { api } from './request';

// ===== 模型相关 =====
export async function getCurrentModel() {
  const res = await api.get('/model/current');
  return res.data;
}

export async function getAvailableModels() {
  const res = await api.get('/model/list');
  return res.data;
}

export async function switchModel(model: string, providerId?: string) {
  const res = await api.post('/model/switch', { model, providerId });
  return res.data;
}

// ===== 多提供商 / Ollama =====
export async function getProviders() {
  const res = await api.get('/model/providers');
  return res.data;
}

export async function refreshOllamaModels() {
  const res = await api.post('/model/refresh-ollama');
  return res.data;
}

// ===== 模型对比（SSE 多流） =====
export async function compareChat(
  message: string,
  models: Array<{ model: string; providerId?: string }>,
  modelParams: Record<string, number> | undefined,
  onChunk: (chunk: any) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/chat/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, models, modelParams }),
    signal,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      try {
        const chunk = JSON.parse(dataStr);
        onChunk(chunk);
      } catch (e) {
        console.warn('解析对比SSE数据失败:', dataStr, e);
      }
    }
  }
}
