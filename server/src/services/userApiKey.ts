import { query } from '../db';
import crypto from 'crypto';

// 加密密钥
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'zhizhi-agent-local-encryption-key-2026';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32), iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface UserApiKey {
  id: string;
  user_id: string;
  provider: string;
  name: string;
  key_prefix: string | null;
  base_url: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserApiKeyWithKey extends UserApiKey {
  api_key: string;
}

// 获取用户的所有API Key（不返回明文）
export async function listUserApiKeys(userId: string): Promise<UserApiKey[]> {
  const result = await query(
    `SELECT id, user_id, provider, name, key_prefix, base_url, is_default, created_at, updated_at 
     FROM user_api_keys 
     WHERE user_id = $1 
     ORDER BY is_default DESC, created_at DESC`,
    [userId]
  );
  return result.rows as UserApiKey[];
}

// 添加用户API Key
export async function addUserApiKey(
  userId: string,
  provider: string,
  name: string,
  apiKey: string,
  baseUrl?: string,
  isDefault?: boolean
): Promise<UserApiKey> {
  const encryptedKey = encrypt(apiKey);
  const keyPrefix = apiKey.substring(0, 8) + '...';

  // 如果设为默认，先取消其他默认
  if (isDefault) {
    await query('UPDATE user_api_keys SET is_default = false WHERE user_id = $1', [userId]);
  }

  const result = await query(
    `INSERT INTO user_api_keys (user_id, provider, name, encrypted_key, key_prefix, base_url, is_default) 
     VALUES ($1, $2, $3, $4, $5, $6, $7) 
     RETURNING id, user_id, provider, name, key_prefix, base_url, is_default, created_at, updated_at`,
    [userId, provider, name, encryptedKey, keyPrefix, baseUrl || null, isDefault || false]
  );
  return result.rows[0] as UserApiKey;
}

// 删除用户API Key
export async function deleteUserApiKey(userId: string, keyId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM user_api_keys WHERE id = $1 AND user_id = $2',
    [keyId, userId]
  );
  return (result.rowCount || 0) > 0;
}

// 设为默认API Key
export async function setDefaultApiKey(userId: string, keyId: string): Promise<boolean> {
  await query('UPDATE user_api_keys SET is_default = false WHERE user_id = $1', [userId]);
  const result = await query(
    'UPDATE user_api_keys SET is_default = true WHERE id = $1 AND user_id = $2',
    [keyId, userId]
  );
  return (result.rowCount || 0) > 0;
}

// 获取用户默认API Key（含明文，内部使用）
export async function getDefaultApiKey(userId: string, provider?: string): Promise<UserApiKeyWithKey | null> {
  let sql = `SELECT id, user_id, provider, name, encrypted_key, key_prefix, base_url, is_default, created_at, updated_at 
             FROM user_api_keys 
             WHERE user_id = $1 AND is_default = true`;
  const params: any[] = [userId];

  if (provider) {
    sql += ' AND provider = $2';
    params.push(provider);
  }
  sql += ' LIMIT 1';

  const result = await query(sql, params);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  try {
    return {
      ...row,
      api_key: decrypt(row.encrypted_key)
    };
  } catch {
    return null;
  }
}

// 获取用户指定provider的API Key（含明文，内部使用）
export async function getApiKeyByProvider(userId: string, provider: string): Promise<UserApiKeyWithKey | null> {
  // 优先找默认的
  const defaultKey = await getDefaultApiKey(userId, provider);
  if (defaultKey) return defaultKey;

  // 否则找该provider的第一个
  const result = await query(
    `SELECT id, user_id, provider, name, encrypted_key, key_prefix, base_url, is_default, created_at, updated_at 
     FROM user_api_keys 
     WHERE user_id = $1 AND provider = $2 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [userId, provider]
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  try {
    return {
      ...row,
      api_key: decrypt(row.encrypted_key)
    };
  } catch {
    return null;
  }
}

// 检查用户是否配置了API Key
export async function hasUserApiKey(userId: string): Promise<boolean> {
  const result = await query(
    'SELECT COUNT(*) as count FROM user_api_keys WHERE user_id = $1',
    [userId]
  );
  return parseInt(result.rows[0].count) > 0;
}
