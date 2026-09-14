import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CollectionInfo } from '../types';
import { usePostgres, query } from '../db';

// 持久化文件路径（JSON 模式）
const PERSIST_DIR = path.resolve(__dirname, '../../data');
const COLLECTIONS_FILE = path.join(PERSIST_DIR, 'collections.json');

if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

// 内存集合存储（JSON 模式）
const collectionStore = new Map<string, CollectionInfo>();
let initialized = false;

function loadFromFile(): void {
  if (initialized) return;
  if (fs.existsSync(COLLECTIONS_FILE)) {
    try {
      const raw = fs.readFileSync(COLLECTIONS_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, CollectionInfo>;
      for (const [id, col] of Object.entries(data)) {
        collectionStore.set(id, col);
      }
      console.log(`知识库集合已加载: ${collectionStore.size} 个`);
    } catch (error) {
      console.warn('加载知识库集合失败，将创建新存储:', error);
    }
  }
  initialized = true;
}

function saveToFile(): void {
  try {
    const data: Record<string, CollectionInfo> = {};
    for (const [id, col] of collectionStore.entries()) {
      data[id] = col;
    }
    fs.writeFileSync(COLLECTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('保存知识库集合失败:', error);
  }
}

loadFromFile();

// 创建知识库集合
export async function createCollection(
  name: string,
  description?: string,
  icon?: string
): Promise<CollectionInfo> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const info: CollectionInfo = {
    id,
    name,
    description: description || '',
    icon: icon || '📚',
    createdAt: now,
    updatedAt: now,
  };

  if (usePostgres) {
    await query(
      'INSERT INTO collections (id, name, description, icon, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, name, description || null, icon || '📚', now, now]
    );
  } else {
    collectionStore.set(id, info);
    saveToFile();
  }
  return info;
}

// 获取全部知识库集合
export async function getAllCollections(): Promise<CollectionInfo[]> {
  if (usePostgres) {
    const result = await query(
      'SELECT id, name, description, icon, created_at, updated_at FROM collections ORDER BY created_at ASC'
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      icon: r.icon || '📚',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  } else {
    return Array.from(collectionStore.values()).sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );
  }
}

// 获取单个知识库集合
export async function getCollection(id: string): Promise<CollectionInfo | null> {
  if (usePostgres) {
    const result = await query(
      'SELECT id, name, description, icon, created_at, updated_at FROM collections WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      icon: r.icon || '📚',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  } else {
    return collectionStore.get(id) || null;
  }
}

// 更新知识库集合
export async function updateCollection(
  id: string,
  fields: { name?: string; description?: string; icon?: string }
): Promise<CollectionInfo | null> {
  const now = new Date().toISOString();
  if (usePostgres) {
    const sets: string[] = [`updated_at = $1`];
    const params: any[] = [now];
    if (fields.name !== undefined) { params.push(fields.name); sets.push(`name = $${params.length}`); }
    if (fields.description !== undefined) { params.push(fields.description); sets.push(`description = $${params.length}`); }
    if (fields.icon !== undefined) { params.push(fields.icon); sets.push(`icon = $${params.length}`); }
    params.push(id);
    await query(`UPDATE collections SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    return getCollection(id);
  } else {
    const col = collectionStore.get(id);
    if (!col) return null;
    if (fields.name !== undefined) col.name = fields.name;
    if (fields.description !== undefined) col.description = fields.description;
    if (fields.icon !== undefined) col.icon = fields.icon;
    col.updatedAt = now;
    collectionStore.set(id, col);
    saveToFile();
    return col;
  }
}

// 删除知识库集合：其内文档 collection_id 置空，向量 metadata.collectionId 清除
export async function deleteCollection(id: string): Promise<boolean> {
  // 清除向量侧关联（PG 与 JSON 通用：PG 由下方 SQL 处理，这里兜底清理内存/JSON）
  const { clearCollectionAssociation } = require('./vectorStore');
  if (usePostgres) {
    // 文档归为未分类
    await query('UPDATE documents SET collection_id = NULL WHERE collection_id = $1', [id]);
    // 向量 metadata 清除 collectionId（PG JSONB）
    await query(
      "UPDATE vectors SET metadata = metadata - 'collectionId' WHERE metadata->>'collectionId' = $1",
      [id]
    ).catch(() => { /* vectors 表可能无该列，忽略 */ });
    // 同步清除内存向量关联（PG 模式 data 也在内存中）
    try { clearCollectionAssociation(id); } catch { /* ignore */ }
    const result = await query('DELETE FROM collections WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  } else {
    // JSON 模式：文档表置空 + 向量清理
    try { clearCollectionAssociation(id); } catch { /* ignore */ }
    const existed = collectionStore.delete(id);
    if (existed) saveToFile();
    return existed;
  }
}
