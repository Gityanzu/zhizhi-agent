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
}

const PERSIST_DIR = path.resolve(__dirname, '../../data');
const AGENTS_FILE = path.join(PERSIST_DIR, 'agents.json');

if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

let agentsMap = new Map<string, CustomAgent>();
let loaded = false;

function loadFromFile(): void {
  if (loaded) return;
  if (fs.existsSync(AGENTS_FILE)) {
    try {
      const raw = fs.readFileSync(AGENTS_FILE, 'utf-8');
      const data = JSON.parse(raw) as CustomAgent[];
      for (const a of data) agentsMap.set(a.id, a);
      console.log(`自定义Agent已加载: ${agentsMap.size} 个`);
    } catch (e) {
      console.warn('加载自定义Agent失败:', e);
    }
  }
  loaded = true;
}

function saveToFile(): void {
  try {
    fs.writeFileSync(AGENTS_FILE, JSON.stringify(Array.from(agentsMap.values()), null, 2), 'utf-8');
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
  const agent: CustomAgent = {
    id,
    name: data.name || '未命名Agent',
    avatar: data.avatar || '🤖',
    description: data.description || '',
    systemPrompt: data.systemPrompt || '',
    model: data.model || '',
    tools: data.tools || [],
    temperature: data.temperature ?? 0.7,
    createdAt: now,
    updatedAt: now,
  };

  if (usePostgres) {
    await query(
      `INSERT INTO agents (id, name, avatar, description, system_prompt, model, tools, temperature, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, agent.name, agent.avatar, agent.description, agent.systemPrompt, agent.model,
       JSON.stringify(agent.tools), agent.temperature, now, now]
    );
  } else {
    loadFromFile();
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

  const updated: CustomAgent = { ...existing, ...data, id, updatedAt: new Date().toISOString() };

  if (usePostgres) {
    await query(
      `UPDATE agents SET name=$1, avatar=$2, description=$3, system_prompt=$4, model=$5, tools=$6, temperature=$7, updated_at=$8 WHERE id=$9`,
      [updated.name, updated.avatar, updated.description, updated.systemPrompt, updated.model,
       JSON.stringify(updated.tools), updated.temperature, updated.updatedAt, id]
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
