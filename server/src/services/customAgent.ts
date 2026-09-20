import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { usePostgres, query } from '../db';

export interface CustomAgent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  model: string;
  tools: string[];
  temperature: number;
  createdAt: string;
  updatedAt: string;
  // 搜索相关字段
  category?: string;
  tags?: string[];
  rating?: number;
  ratingCount?: number;
  viewCount?: number;
  templateCount?: number;
}

const PERSIST_DIR = path.resolve(__dirname, '../../data');
const AGENTS_FILE = path.join(PERSIST_DIR, 'agents.json');

if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

let agentsMap = new Map<string, CustomAgent>();
let loaded = false;
// 添加缓存大小限制
const MAX_CACHE_SIZE = 100; // 最多缓存100个Agent

function loadFromFile(): void {
  if (loaded) return;
  if (fs.existsSync(AGENTS_FILE)) {
    try {
      const raw = fs.readFileSync(AGENTS_FILE, 'utf-8');
      const data = JSON.parse(raw) as CustomAgent[];

      // 清理和重新加载
      agentsMap.clear();
      for (const a of data) {
        agentsMap.set(a.id, a);
      }
      console.log(`自定义Agent已加载: ${agentsMap.size} 个`);
    } catch (e) {
      console.warn('加载自定义Agent失败:', e);
    }
  }
  loaded = true;
}

function saveToFile(): void {
  try {
    // 确保只保存有效的Agent数据
    const agentsToSave = Array.from(agentsMap.values()).map(agent => ({
      ...agent,
      // 确保所有必需字段都存在
      id: agent.id,
      name: agent.name || '未命名Agent',
      avatar: agent.avatar || '🤖',
      description: agent.description || '',
      systemPrompt: agent.systemPrompt || '',
      model: agent.model || '',
      tools: Array.isArray(agent.tools) ? agent.tools : [],
      temperature: agent.temperature ?? 0.7,
      category: agent.category,
      tags: agent.tags,
      rating: agent.rating,
      ratingCount: agent.ratingCount,
      viewCount: agent.viewCount,
      templateCount: agent.templateCount,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    }));

    fs.writeFileSync(AGENTS_FILE, JSON.stringify(agentsToSave, null, 2), 'utf-8');
    console.log(`自定义Agent已保存: ${agentsToSave.length} 个`);
  } catch (e) {
    console.error('保存自定义Agent失败:', e);
  }
}

function mapRow(row: any): CustomAgent {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || '🤖',
    description: row.description || '',
    systemPrompt: row.system_prompt || '',
    model: row.model || '',
    tools: Array.isArray(row.tools) ? row.tools : [],
    temperature: row.temperature ?? 0.7,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAgent(data: Partial<CustomAgent>): Promise<CustomAgent> {
  const id = uuidv4();
  const now = new Date().toISOString();

  // 创建完整的Agent对象，确保所有字段都有值
  const agent: CustomAgent = {
    id,
    name: data.name || '未命名Agent',
    avatar: data.avatar || '🤖',
    description: data.description || '',
    systemPrompt: data.systemPrompt || '',
    model: data.model || '',
    tools: Array.isArray(data.tools) ? data.tools : [],
    temperature: data.temperature ?? 0.7,
    category: data.category,
    tags: Array.isArray(data.tags) ? data.tags : undefined,
    rating: data.rating,
    ratingCount: data.ratingCount || 0,
    viewCount: data.viewCount || 0,
    templateCount: data.templateCount || 0,
    createdAt: now,
    updatedAt: now,
  };

  if (usePostgres) {
    await query(
      `INSERT INTO agents (id, name, avatar, description, system_prompt, model, tools, temperature, category, tags, rating, rating_count, view_count, template_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id, agent.name, agent.avatar, agent.description, agent.systemPrompt, agent.model,
        JSON.stringify(agent.tools), agent.temperature,
        agent.category, JSON.stringify(agent.tags), agent.rating, agent.ratingCount,
        agent.viewCount, agent.templateCount, now, now
      ]
    );
  } else {
    loadFromFile();
    // 添加到缓存
    agentsMap.set(id, agent);
    saveToFile();
  }
  return agent;
}

export async function getAgent(id: string): Promise<CustomAgent | null> {
  if (usePostgres) {
    const result = await query('SELECT * FROM agents WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  } else {
    loadFromFile();
    return agentsMap.get(id) || null;
  }
}

export async function getAllAgents(): Promise<CustomAgent[]> {
  if (usePostgres) {
    const result = await query('SELECT * FROM agents ORDER BY created_at DESC');
    return result.rows.map(mapRow);
  } else {
    loadFromFile();
    return Array.from(agentsMap.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export async function updateAgent(id: string, data: Partial<CustomAgent>): Promise<CustomAgent | null> {
  const existing = await getAgent(id);
  if (!existing) return null;

  // 确保只更新提供的字段，不丢失其他字段
  const now = new Date().toISOString();
  const updated: CustomAgent = {
    ...existing,
    // 只更新非空字段
    name: data.name !== undefined ? data.name : existing.name,
    avatar: data.avatar !== undefined ? data.avatar : existing.avatar,
    description: data.description !== undefined ? data.description : existing.description,
    systemPrompt: data.systemPrompt !== undefined ? data.systemPrompt : existing.systemPrompt,
    model: data.model !== undefined ? data.model : existing.model,
    tools: data.tools !== undefined ? data.tools : existing.tools,
    temperature: data.temperature !== undefined ? data.temperature : existing.temperature,
    category: data.category !== undefined ? data.category : existing.category,
    tags: data.tags !== undefined ? data.tags : existing.tags,
    rating: data.rating !== undefined ? data.rating : existing.rating,
    ratingCount: data.ratingCount !== undefined ? data.ratingCount : existing.ratingCount,
    viewCount: data.viewCount !== undefined ? data.viewCount : existing.viewCount,
    templateCount: data.templateCount !== undefined ? data.templateCount : existing.templateCount,
    updatedAt: now,
  };

  if (usePostgres) {
    await query(
      `UPDATE agents SET name=$1, avatar=$2, description=$3, system_prompt=$4, model=$5, tools=$6, temperature=$7, category=$8, tags=$9, rating=$10, rating_count=$11, view_count=$12, template_count=$13, updated_at=$14 WHERE id=$15`,
      [
        updated.name, updated.avatar, updated.description, updated.systemPrompt, updated.model,
        JSON.stringify(updated.tools), updated.temperature,
        updated.category, JSON.stringify(updated.tags), updated.rating, updated.ratingCount,
        updated.viewCount, updated.templateCount, updated.updatedAt, id
      ]
    );
  } else {
    loadFromFile();
    agentsMap.set(id, updated);
    saveToFile();
  }
  return updated;
}

export async function deleteAgent(id: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query('DELETE FROM agents WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  } else {
    loadFromFile();
    const result = agentsMap.delete(id);
    if (result) saveToFile();
    return result;
  }
}
