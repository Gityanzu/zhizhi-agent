import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { usePostgres, query } from '../db';
import { getCurrentModel } from './llm';

// Token 用量记录
export interface UsageRecord {
  id: string;
  sessionId: string;
  messageId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCents: number;
  createdAt: string;
}

// 从 LLM 响应中提取 token 用量
export function extractTokenUsage(response: any): { promptTokens: number; completionTokens: number; totalTokens: number } {
  // LangChain ChatOpenAI 响应的 responseMetadata.tokenUsage
  const tokenUsage = response?.responseMetadata?.tokenUsage 
    || response?.llmOutput?.tokenUsage
    || response?.usage;
  
  if (tokenUsage) {
    return {
      promptTokens: tokenUsage.promptTokens || tokenUsage.prompt_tokens || 0,
      completionTokens: tokenUsage.completionTokens || tokenUsage.completion_tokens || 0,
      totalTokens: tokenUsage.totalTokens || tokenUsage.total_tokens || 0,
    };
  }
  
  // 通义千问兼容接口可能返回的格式
  const usage = response?.usage;
  if (usage) {
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }
  
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

// 估算费用（分）- 基于模型的大致单价
function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  // 简单估算：免费模型费用为0，其他模型按大致单价
  const freeModels = ['qwen3.8-flash', 'qwen3.7-flash', 'qwen3.7-flash-2026-07-15', 
    'qwen3.8-27b', 'qwen3.8-max', 'qwen3.8-max-0902', 'qwen3.8-2.4t-a95b', 
    'qwen3.5-ocr', 'kimi-k3', 'kimi-k2.7-code', 'deepseek-v4-flash-0731', 'glm-5.2'];
  
  if (freeModels.includes(model)) return 0;
  
  // 其他模型按 0.01元/千token 估算
  const costPerThousand = 0.01; // 分/千token
  return Math.round(((promptTokens + completionTokens) / 1000) * costPerThousand * 100) / 100;
}

// 记录 Token 用量
export async function recordUsage(
  sessionId: string,
  messageId: string | undefined,
  model: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number
): Promise<void> {
  const costCents = estimateCost(model, promptTokens, completionTokens);
  const record: UsageRecord = {
    id: uuidv4(),
    sessionId,
    messageId,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costCents,
    createdAt: new Date().toISOString(),
  };

  if (usePostgres) {
    await query(
      `INSERT INTO usage_stats (id, session_id, message_id, model, prompt_tokens, completion_tokens, total_tokens, cost_cents, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [record.id, sessionId, messageId || null, model, promptTokens, completionTokens, totalTokens, costCents]
    );
    return;
  }

  // JSON 模式（桌面端/本地默认）：落盘到 data/usage.json，徽标与统计弹窗才有数据
  loadUsageFromFile();
  usageRecords.set(record.id, record);
  // 控制文件增长：只保留最近 2 万条（单用户场景足够）
  if (usageRecords.size > 20000) {
    const overflow = [...usageRecords.values()]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, usageRecords.size - 20000);
    for (const r of overflow) usageRecords.delete(r.id);
  }
  persistUsageFile();
}

/* --------------------- JSON 模式用量存储（data/usage.json） --------------------- */

const USAGE_FILE = path.resolve(__dirname, '../../data/usage.json');
const usageRecords = new Map<string, UsageRecord>();
let usageLoaded = false;

function loadUsageFromFile(): void {
  if (usageLoaded) return;
  usageLoaded = true;
  if (!fs.existsSync(USAGE_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8')) as UsageRecord[];
    for (const r of raw) usageRecords.set(r.id, r);
  } catch (error) {
    console.warn('加载用量统计失败（忽略，按空开始）:', error);
  }
}

function persistUsageFile(): void {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify([...usageRecords.values()], null, 2), 'utf-8');
  } catch (error) {
    console.error('保存用量统计失败:', error);
  }
}

function aggregateSession(records: UsageRecord[]) {
  const byModelMap = new Map<string, { totalTokens: number; count: number }>();
  const acc = { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, totalCostCents: 0 };
  for (const r of records) {
    acc.totalPromptTokens += r.promptTokens || 0;
    acc.totalCompletionTokens += r.completionTokens || 0;
    acc.totalTokens += r.totalTokens || 0;
    acc.totalCostCents += r.costCents || 0;
    const m = byModelMap.get(r.model) || { totalTokens: 0, count: 0 };
    m.totalTokens += r.totalTokens || 0;
    m.count += 1;
    byModelMap.set(r.model, m);
  }
  return {
    ...acc,
    messageCount: records.length,
    byModel: [...byModelMap.entries()]
      .map(([model, m]) => ({ model, ...m }))
      .sort((a, b) => b.totalTokens - a.totalTokens),
  };
}

// 获取会话的 Token 用量统计
export async function getSessionUsage(sessionId: string): Promise<{
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostCents: number;
  messageCount: number;
  byModel: Array<{ model: string; totalTokens: number; count: number }>;
}> {
  if (usePostgres) {
    const result = await query(
      `SELECT 
         COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost_cents), 0) as total_cost_cents,
         COUNT(*) as message_count
       FROM usage_stats WHERE session_id = $1`,
      [sessionId]
    );
    
    const modelResult = await query(
      `SELECT model, COALESCE(SUM(total_tokens), 0) as total_tokens, COUNT(*) as count
       FROM usage_stats WHERE session_id = $1
       GROUP BY model ORDER BY total_tokens DESC`,
      [sessionId]
    );
    
    const row = result.rows[0];
    if (!row) {
      return {
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCostCents: 0,
        messageCount: 0,
        byModel: [],
      };
    }
    return {
      totalPromptTokens: parseInt(row.total_prompt_tokens, 10),
      totalCompletionTokens: parseInt(row.total_completion_tokens, 10),
      totalTokens: parseInt(row.total_tokens, 10),
      totalCostCents: parseFloat(row.total_cost_cents),
      messageCount: parseInt(row.message_count, 10),
      byModel: modelResult.rows.map(r => ({
        model: r.model,
        totalTokens: parseInt(r.total_tokens, 10),
        count: parseInt(r.count, 10),
      })),
    };
  }
  
  // JSON 模式
  loadUsageFromFile();
  return aggregateSession([...usageRecords.values()].filter((r) => r.sessionId === sessionId));
}

// 获取全局 Token 用量统计
export async function getGlobalUsage(): Promise<{
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostCents: number;
  sessionCount: number;
  messageCount: number;
}> {
  if (usePostgres) {
    const result = await query(
      `SELECT 
         COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost_cents), 0) as total_cost_cents,
         COUNT(DISTINCT session_id) as session_count,
         COUNT(*) as message_count
       FROM usage_stats`
    );
    
    const row = result.rows[0];
    return {
      totalPromptTokens: parseInt(row.total_prompt_tokens, 10),
      totalCompletionTokens: parseInt(row.total_completion_tokens, 10),
      totalTokens: parseInt(row.total_tokens, 10),
      totalCostCents: parseFloat(row.total_cost_cents),
      sessionCount: parseInt(row.session_count, 10),
      messageCount: parseInt(row.message_count, 10),
    };
  }
  
  // JSON 模式：全局聚合
  loadUsageFromFile();
  const agg = aggregateSession([...usageRecords.values()]);
  return {
    totalPromptTokens: agg.totalPromptTokens,
    totalCompletionTokens: agg.totalCompletionTokens,
    totalTokens: agg.totalTokens,
    totalCostCents: agg.totalCostCents,
    sessionCount: new Set([...usageRecords.values()].map((r) => r.sessionId)).size,
    messageCount: agg.messageCount,
  };
}

// 获取可观测性统计数据
export async function getObservabilityStats(): Promise<{
  overview: {
    totalSessions: number;
    totalMessages: number;
    totalTokens: number;
    totalToolCalls: number;
    avgToolDurationMs: number;
  };
  byModel: Array<{ model: string; count: number; totalTokens: number }>;
  byTool: Array<{ toolName: string; count: number; avgDurationMs: number }>;
  recentMessages: Array<{ id: string; sessionId: string; role: string; content: string; createdAt: string }>;
  recentToolCalls: Array<{ id: string; toolName: string; durationMs: number; createdAt: string }>;
}> {
  const defaultResult = {
    overview: { totalSessions: 0, totalMessages: 0, totalTokens: 0, totalToolCalls: 0, avgToolDurationMs: 0 },
    byModel: [],
    byTool: [],
    recentMessages: [],
    recentToolCalls: [],
  };
  
  if (!usePostgres) {
    // JSON 模式：总览里的 token 合计从本地用量记录取（其余统计暂不支持）
    loadUsageFromFile();
    const records = [...usageRecords.values()];
    return {
      ...defaultResult,
      overview: {
        ...defaultResult.overview,
        totalTokens: records.reduce((sum, r) => sum + (r.totalTokens || 0), 0),
      },
    };
  }
  
  try {
    // 总览统计
    const sessionResult = await query('SELECT COUNT(*) as cnt FROM sessions');
    const messageResult = await query('SELECT COUNT(*) as cnt FROM messages');
    const tokenResult = await query('SELECT COALESCE(SUM(total_tokens), 0) as total FROM usage_stats');
    const toolResult = await query('SELECT COUNT(*) as cnt, COALESCE(AVG(duration_ms), 0) as avg_duration FROM tool_calls');
    
    // 按模型统计
    const modelResult = await query(
      `SELECT model, COUNT(*) as count, COALESCE(SUM(total_tokens), 0) as total_tokens 
       FROM usage_stats GROUP BY model ORDER BY count DESC LIMIT 10`
    );
    
    // 按工具统计
    const toolStatsResult = await query(
      `SELECT tool_name, COUNT(*) as count, COALESCE(AVG(duration_ms), 0) as avg_duration 
       FROM tool_calls GROUP BY tool_name ORDER BY count DESC LIMIT 10`
    );
    
    // 最近消息
    const recentMsgResult = await query(
      `SELECT id, session_id, role, LEFT(content, 100) as content, created_at 
       FROM messages ORDER BY created_at DESC LIMIT 10`
    );
    
    // 最近工具调用
    const recentToolResult = await query(
      `SELECT id, tool_name, duration_ms, created_at 
       FROM tool_calls ORDER BY created_at DESC LIMIT 10`
    );
    
    return {
      overview: {
        totalSessions: parseInt(sessionResult.rows[0].cnt, 10),
        totalMessages: parseInt(messageResult.rows[0].cnt, 10),
        totalTokens: parseInt(tokenResult.rows[0].total, 10),
        totalToolCalls: parseInt(toolResult.rows[0].cnt, 10),
        avgToolDurationMs: parseFloat(toolResult.rows[0].avg_duration),
      },
      byModel: modelResult.rows.map(r => ({
        model: r.model,
        count: parseInt(r.count, 10),
        totalTokens: parseInt(r.total_tokens, 10),
      })),
      byTool: toolStatsResult.rows.map(r => ({
        toolName: r.tool_name,
        count: parseInt(r.count, 10),
        avgDurationMs: parseFloat(r.avg_duration),
      })),
      recentMessages: recentMsgResult.rows.map(r => ({
        id: r.id,
        sessionId: r.session_id,
        role: r.role,
        content: r.content,
        createdAt: r.created_at,
      })),
      recentToolCalls: recentToolResult.rows.map(r => ({
        id: r.id,
        toolName: r.tool_name,
        durationMs: parseInt(r.duration_ms, 10),
        createdAt: r.created_at,
      })),
    };
  } catch (error) {
    console.warn('获取可观测性统计失败:', error);
    return defaultResult;
  }
}

// 记录工具调用
export async function recordToolCall(
  sessionId: string,
  messageId: string | undefined,
  toolName: string,
  toolArgs: any,
  toolResult: string,
  durationMs: number
): Promise<void> {
  if (!usePostgres) return; // JSON 模式下暂不记录
  
  try {
    await query(
      `INSERT INTO tool_calls (id, session_id, message_id, tool_name, arguments, result, duration_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        uuidv4(),
        sessionId,
        messageId || null,
        toolName,
        JSON.stringify(toolArgs || {}),
        toolResult.substring(0, 2000), // 截断结果避免过大
        durationMs
      ]
    );
  } catch (error) {
    console.warn('记录工具调用失败:', error);
  }
}
