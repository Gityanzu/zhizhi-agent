import { query } from '../db';
import crypto from 'crypto';

export interface UserProfile {
  nickname: string;
  role: string;
  avatar: string;
}

export interface UserPreferences {
  theme: string;
  defaultModel: string;
  defaultMode: string;
  voiceEnabled: boolean;
  ttsEnabled: boolean;
  temperature: number;
  topP: number;
  maxTokens: number;
}

export interface LLMKey {
  id: string;
  provider: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
}

// 加密密钥（本地使用，简单加密）
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

// 获取用户设置
export async function getSettings() {
  const result = await query('SELECT profile, preferences, llm_keys, updated_at FROM user_settings WHERE id = 1');
  if (result.rows.length === 0) {
    return {
      profile: { nickname: '用户', role: 'AI助手使用者', avatar: '' },
      preferences: { theme: 'dark', defaultModel: 'qwen3.8-flash', defaultMode: 'agent', voiceEnabled: true, ttsEnabled: false, temperature: 0.7, topP: 1.0, maxTokens: 2048 },
      llmKeys: []
    };
  }
  const row = result.rows[0];
  return {
    profile: row.profile,
    preferences: row.preferences,
    llmKeys: (row.llm_keys || []).map((k: any) => ({
      id: k.id,
      provider: k.provider,
      name: k.name,
      keyPrefix: k.keyPrefix,
      createdAt: k.createdAt
    }))
  };
}

// 更新用户资料
export async function updateProfile(profile: UserProfile) {
  await query(
    'UPDATE user_settings SET profile = $1, updated_at = NOW() WHERE id = 1',
    [profile]
  );
  return profile;
}

// 更新偏好设置
export async function updatePreferences(preferences: UserPreferences) {
  await query(
    'UPDATE user_settings SET preferences = $1, updated_at = NOW() WHERE id = 1',
    [preferences]
  );
  return preferences;
}

// 添加LLM API Key
export async function addLLMKey(provider: string, name: string, key: string) {
  const settings = await getSettings();
  const keys = settings.llmKeys || [];
  const newKey = {
    id: crypto.randomUUID(),
    provider,
    name,
    encryptedKey: encrypt(key),
    keyPrefix: key.substring(0, 8) + '...',
    createdAt: new Date().toISOString()
  };
  keys.push(newKey);
  await query(
    'UPDATE user_settings SET llm_keys = $1, updated_at = NOW() WHERE id = 1',
    [keys]
  );
  return {
    id: newKey.id,
    provider: newKey.provider,
    name: newKey.name,
    keyPrefix: newKey.keyPrefix,
    createdAt: newKey.createdAt
  };
}

// 删除LLM API Key
export async function deleteLLMKey(id: string) {
  const settings = await getSettings();
  const keys = (settings.llmKeys || []).filter((k: any) => k.id !== id);
  await query(
    'UPDATE user_settings SET llm_keys = $1, updated_at = NOW() WHERE id = 1',
    [keys]
  );
  return true;
}

// 获取解密后的API Key（内部使用）
export async function getDecryptedKey(provider: string): Promise<string | null> {
  const result = await query('SELECT llm_keys FROM user_settings WHERE id = 1');
  if (result.rows.length === 0) return null;
  const keys = result.rows[0].llm_keys || [];
  const key = keys.find((k: any) => k.provider === provider);
  if (!key) return null;
  try {
    return decrypt(key.encryptedKey);
  } catch {
    return null;
  }
}

// 导出所有数据
export async function exportAllData() {
  const tables = ['sessions', 'messages', 'tool_calls', 'usage_stats', 'memories', 'prompt_templates', 'vectors', 'documents', 'collections', 'folders', 'agents', 'custom_tools', 'workflows', 'db_connections', 'shares', 'api_keys'];
  const data: any = {};
  for (const table of tables) {
    try {
      const result = await query(`SELECT * FROM ${table}`);
      data[table] = result.rows;
    } catch (e) {
      data[table] = [];
    }
  }
  const settings = await getSettings();
  data['user_settings'] = settings;
  data['exportedAt'] = new Date().toISOString();
  data['version'] = '1.0';
  return data;
}

// 导入数据
export async function importAllData(data: any) {
  const tables = ['sessions', 'messages', 'tool_calls', 'usage_stats', 'memories', 'prompt_templates', 'vectors', 'documents', 'collections', 'folders', 'agents', 'custom_tools', 'workflows', 'db_connections', 'shares', 'api_keys'];
  let imported = 0;
  for (const table of tables) {
    if (data[table] && Array.isArray(data[table])) {
      for (const row of data[table]) {
        try {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          await query(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
          imported++;
        } catch (e) {
          // 跳过错误行
        }
      }
    }
  }
  return { imported };
}
