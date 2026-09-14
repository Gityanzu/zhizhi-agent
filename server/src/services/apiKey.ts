import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { usePostgres, query } from '../db';

// ===== 功能20：对外 API Key =====

export interface ApiKeyRecord {
  id: string;
  keyPrefix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const PERSIST_DIR = path.resolve(__dirname, '../../data');
const APIKEYS_FILE = path.join(PERSIST_DIR, 'api_keys.json');

if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

// JSON 模式存储：{ record, keyHash }
interface ApiKeyStored extends ApiKeyRecord {
  keyHash: string;
}

const store = new Map<string, ApiKeyStored>();
let loaded = false;

function loadFromFile(): void {
  if (loaded) return;
  if (fs.existsSync(APIKEYS_FILE)) {
    try {
      const raw = fs.readFileSync(APIKEYS_FILE, 'utf-8');
      const arr = JSON.parse(raw) as ApiKeyStored[];
      for (const k of arr) store.set(k.id, k);
      console.log(`API Key 已加载: ${store.size} 条`);
    } catch (e) {
      console.warn('加载 API Key 失败:', e);
    }
  }
  loaded = true;
}

function saveToFile(): void {
  try {
    fs.writeFileSync(APIKEYS_FILE, JSON.stringify(Array.from(store.values()), null, 2), 'utf-8');
  } catch (e) {
    console.error('保存 API Key 失败:', e);
  }
}

loadFromFile();

export function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// 生成新的 API Key（前缀 zza_）
export function generateKey(): string {
  return 'zza_' + crypto.randomBytes(24).toString('hex');
}

// 创建 API Key，返回完整 key（仅本次可见）
export async function createApiKey(name: string): Promise<{ record: ApiKeyRecord; fullKey: string }> {
  const id = uuidv4();
  const fullKey = generateKey();
  const keyHash = hashKey(fullKey);
  const keyPrefix = fullKey.slice(0, 12);
  const now = new Date().toISOString();

  if (usePostgres) {
    await query(
      'INSERT INTO api_keys (id, key_hash, key_prefix, name, created_at, last_used_at) VALUES ($1, $2, $3, $4, $5, NULL)',
      [id, keyHash, keyPrefix, name, now]
    );
  } else {
    store.set(id, { id, keyHash, keyPrefix, name, createdAt: now, lastUsedAt: null });
    saveToFile();
  }
  return {
    record: { id, keyPrefix, name, createdAt: now, lastUsedAt: null },
    fullKey,
  };
}

// 验证 API Key 是否有效，成功则更新 last_used_at
export async function validateApiKey(key: string): Promise<ApiKeyRecord | null> {
  const keyHash = hashKey(key);
  const now = new Date().toISOString();
  if (usePostgres) {
    const result = await query(
      'UPDATE api_keys SET last_used_at = $1 WHERE key_hash = $2 RETURNING id, key_prefix, name, created_at, last_used_at',
      [now, keyHash]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      keyPrefix: row.key_prefix,
      name: row.name,
      createdAt: new Date(row.created_at).toISOString(),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    };
  } else {
    const found = Array.from(store.values()).find(k => k.keyHash === keyHash);
    if (!found) return null;
    found.lastUsedAt = now;
    saveToFile();
    return {
      id: found.id,
      keyPrefix: found.keyPrefix,
      name: found.name,
      createdAt: found.createdAt,
      lastUsedAt: found.lastUsedAt,
    };
  }
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  if (usePostgres) {
    const result = await query(
      'SELECT id, key_prefix, name, created_at, last_used_at FROM api_keys ORDER BY created_at DESC'
    );
    return result.rows.map(r => ({
      id: r.id,
      keyPrefix: r.key_prefix,
      name: r.name,
      createdAt: new Date(r.created_at).toISOString(),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    }));
  } else {
    return Array.from(store.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(k => ({
        id: k.id,
        keyPrefix: k.keyPrefix,
        name: k.name,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      }));
  }
}

export async function deleteApiKey(id: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query('DELETE FROM api_keys WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  } else {
    const existed = store.delete(id);
    if (existed) saveToFile();
    return existed;
  }
}
