import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { usePostgres, query } from '../db';
import type { ToolDefinition } from './agent';

export interface CustomTool {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  paramsSchema: any; // JSON Schema for parameters
  bodyTemplate: string;
  createdAt: string;
  updatedAt: string;
}

const PERSIST_DIR = path.resolve(__dirname, '../../data');
const CUSTOM_TOOLS_FILE = path.join(PERSIST_DIR, 'custom_tools.json');

if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

let toolsMap = new Map<string, CustomTool>();
let loaded = false;

function loadFromFile(): void {
  if (loaded) return;
  if (fs.existsSync(CUSTOM_TOOLS_FILE)) {
    try {
      const raw = fs.readFileSync(CUSTOM_TOOLS_FILE, 'utf-8');
      const data = JSON.parse(raw) as CustomTool[];
      for (const t of data) toolsMap.set(t.id, t);
      console.log(`自定义工具已加载: ${toolsMap.size} 个`);
    } catch (e) {
      console.warn('加载自定义工具失败:', e);
    }
  }
  loaded = true;
}

function saveToFile(): void {
  try {
    fs.writeFileSync(CUSTOM_TOOLS_FILE, JSON.stringify(Array.from(toolsMap.values()), null, 2), 'utf-8');
  } catch (e) {
    console.error('保存自定义工具失败:', e);
  }
}

function mapRow(row: any): CustomTool {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    method: row.method || 'GET',
    url: row.url,
    headers: row.headers || {},
    paramsSchema: row.params_schema || {},
    bodyTemplate: row.body_template || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createCustomTool(data: Partial<CustomTool>): Promise<CustomTool> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const tool: CustomTool = {
    id,
    name: data.name || '未命名工具',
    description: data.description || '',
    method: (data.method || 'GET').toUpperCase(),
    url: data.url || '',
    headers: data.headers || {},
    paramsSchema: data.paramsSchema || { type: 'object', properties: {}, required: [] },
    bodyTemplate: data.bodyTemplate || '',
    createdAt: now,
    updatedAt: now,
  };

  if (usePostgres) {
    await query(
      `INSERT INTO custom_tools (id, name, description, method, url, headers, params_schema, body_template, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, tool.name, tool.description, tool.method, tool.url,
       JSON.stringify(tool.headers), JSON.stringify(tool.paramsSchema), tool.bodyTemplate, now, now]
    );
  } else {
    loadFromFile();
    toolsMap.set(id, tool);
    saveToFile();
  }
  return tool;
}

export async function getCustomTool(id: string): Promise<CustomTool | null> {
  if (usePostgres) {
    const result = await query('SELECT * FROM custom_tools WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  } else {
    loadFromFile();
    return toolsMap.get(id) || null;
  }
}

export async function getAllCustomTools(): Promise<CustomTool[]> {
  if (usePostgres) {
    const result = await query('SELECT * FROM custom_tools ORDER BY created_at DESC');
    return result.rows.map(mapRow);
  } else {
    loadFromFile();
    return Array.from(toolsMap.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export async function updateCustomTool(id: string, data: Partial<CustomTool>): Promise<CustomTool | null> {
  const existing = await getCustomTool(id);
  if (!existing) return null;

  const updated: CustomTool = { ...existing, ...data, id, updatedAt: new Date().toISOString() };

  if (usePostgres) {
    await query(
      `UPDATE custom_tools SET name=$1, description=$2, method=$3, url=$4, headers=$5, params_schema=$6, body_template=$7, updated_at=$8 WHERE id=$9`,
      [updated.name, updated.description, updated.method, updated.url,
       JSON.stringify(updated.headers), JSON.stringify(updated.paramsSchema), updated.bodyTemplate, updated.updatedAt, id]
    );
  } else {
    loadFromFile();
    toolsMap.set(id, updated);
    saveToFile();
  }
  return updated;
}

export async function deleteCustomTool(id: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query('DELETE FROM custom_tools WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  } else {
    loadFromFile();
    const result = toolsMap.delete(id);
    if (result) saveToFile();
    return result;
  }
}

// 加载所有自定义工具并转换为 ToolDefinition
export async function getDynamicTools(): Promise<ToolDefinition[]> {
  const allTools = await getAllCustomTools();
  return allTools.map(t => ({
    name: t.name,
    description: t.description || `自定义API工具: ${t.name}`,
    parameters: t.paramsSchema || { type: 'object', properties: {}, required: [] },
  }));
}

// 根据工具名查找自定义工具
export async function findCustomToolByName(name: string): Promise<CustomTool | null> {
  const allTools = await getAllCustomTools();
  return allTools.find(t => t.name === name) || null;
}

// 执行自定义工具（HTTP请求）
export async function executeCustomTool(toolName: string, args: Record<string, any>): Promise<string> {
  const tool = await findCustomToolByName(toolName);
  if (!tool) {
    return `自定义工具不存在: ${toolName}`;
  }

  try {
    // 替换 URL 中的 {{param}} 占位符
    let url = tool.url;
    for (const [key, value] of Object.entries(args)) {
      url = url.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), encodeURIComponent(String(value)));
    }

    const headers: Record<string, string> = { ...tool.headers };
    const method = tool.method.toUpperCase();
    const options: RequestInit = { method, headers };

    // 处理 body
    if (method !== 'GET' && method !== 'DELETE') {
      let bodyStr = tool.bodyTemplate || '';
      for (const [key, value] of Object.entries(args)) {
        bodyStr = bodyStr.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), JSON.stringify(value));
      }
      if (bodyStr) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        options.body = bodyStr;
      }
    } else {
      // GET: 把未在URL中使用的参数放到 query string
      const usedParams = new Set();
      for (const key of Object.keys(args)) {
        if (url.includes(`{{${key}}}`)) usedParams.add(key);
      }
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(args)) {
        if (!usedParams.has(key)) {
          queryParams.append(key, String(value));
        }
      }
      const qs = queryParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    const text = await response.text();
    const truncated = text.length > 2000 ? text.slice(0, 2000) + '\n...（响应已截断）' : text;

    if (!response.ok) {
      return `工具 "${toolName}" 请求失败: HTTP ${response.status}\n${truncated}`;
    }
    return `工具 "${toolName}" 执行结果:\n${truncated}`;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return `工具 "${toolName}" 执行超时（10秒）`;
    }
    return `工具 "${toolName}" 执行失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}
