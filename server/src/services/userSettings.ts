import { query } from '../db';
import crypto from 'crypto';
import { resolveSecret } from '../utils/devSecret';
import { setAgentOutputDir } from './agentOutput';
import { resolveUserOutputDir, setUserOutputDir } from './userOutputPreference';
import { resolveUserPermissionMode, setUserPermissionMode } from './userPermissionPreference';
import {
  assertSelectablePermissionMode,
  isFullAccessSupported,
  type PermissionMode,
} from './permissionMode';

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
  agentOutputDir?: string; // 桌面端 Agent 文件输出根目录（仅桌面端可设置）
  permissionMode?: PermissionMode; // Agent 运行权限模式（sandbox / full），按用户隔离
}

export interface LLMKey {
  id: string;
  provider: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
}

// 加密密钥（本地使用，简单加密）
// 生产必须配置 ENCRYPTION_KEY；开发期未配置时生成本机持久化密钥（不硬编码于源码）
const ENCRYPTION_KEY = resolveSecret('ENCRYPTION_KEY', 'enc');

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
export async function getSettings(userId?: string | null) {
  const result = await query('SELECT profile, preferences, llm_keys, updated_at FROM user_settings WHERE id = 1');
  if (result.rows.length === 0) {
    return {
      profile: { nickname: '用户', role: 'AI助手使用者', avatar: '' },
      preferences: { theme: 'dark', defaultModel: 'qwen3.8-flash', defaultMode: 'agent', voiceEnabled: true, ttsEnabled: false, temperature: 0.7, topP: 1.0, maxTokens: 2048 },
      llmKeys: []
    };
  }
  const row = result.rows[0];
  // 输出目录按用户返回：用户自己设过就以自己的为准。
  // 为了兼容「多用户隔离改造前存在单例表里的旧数据」，用户级表没有时回退到单例表的值，
  // 这样老用户升级后不会看到设置"消失"，再点一次保存就会真正落到用户级表。
  const userOutputDir = await resolveUserOutputDir(userId);
  const userPermissionMode = await resolveUserPermissionMode(userId);
  const preferences = userId
    ? {
        ...row.preferences,
        agentOutputDir: userOutputDir || row.preferences?.agentOutputDir || '',
        permissionMode: userPermissionMode || row.preferences?.permissionMode || 'sandbox',
      }
    : row.preferences;
  return {
    profile: row.profile,
    preferences,
    fullAccessSupported: isFullAccessSupported(),
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
export async function updatePreferences(preferences: UserPreferences, userId?: string | null) {
  // 按用户隔离的字段不能写进单例表：permissionMode 尤其如此 ——
  // 写进去就相当于"上一个人开过完全访问"变成了所有人的默认值。
  const { permissionMode, ...shared } = preferences || ({} as UserPreferences);
  await query(
    'UPDATE user_settings SET preferences = $1, updated_at = NOW() WHERE id = 1',
    [shared]
  );
  // 输出目录按用户落库，请求时经 resolveUserOutputDir 进入调用链生效。
  // 不再在这里做全局 setAgentOutputDir —— 那是进程级单例，A 改目录会把 B 的产物也带走。
  if (typeof preferences.agentOutputDir === 'string') {
    if (userId) {
      await setUserOutputDir(userId, preferences.agentOutputDir);
    } else {
      // 无用户身份（未登录/旧调用点）只能退化为全局默认
      setAgentOutputDir(preferences.agentOutputDir);
    }
  }
  // permissionMode 在这里丢弃、也不落库：它走独立端点 updatePermissionMode()。
  // 整包保存时顺带授权是危险的 —— 用户点"保存偏好"的本意不是"再确认一次完全访问"，
  // 而且旧页面里残留的 permissionMode 字段可能把别的环境的合法授权冲掉。
  void permissionMode;
  return preferences;
}

/**
 * 只改 Agent 权限模式（界面上的「本机默认 / 允许全部」下拉）。
 *
 * 为什么不复用 /settings/preferences：那个接口是整包覆盖（还要写单例表），
 * 而权限切换是从输入框上随手点的，只带一个字段过去必然把用户其它偏好清空。
 *
 * 权限必须跟人走：没有用户身份直接拒绝，宁可不改也不能落到全局默认上。
 */
export async function updatePermissionMode(userId: string | null | undefined, value: unknown) {
  if (!userId) throw new Error('需要登录后才能修改权限模式');
  const mode = assertSelectablePermissionMode(value);
  await setUserPermissionMode(userId, mode);
  return { mode, fullAccessSupported: isFullAccessSupported() };
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
          // 校验列名，防止 JSON 键名作为 SQL 标识符注入（如 "x); DROP TABLE users; --"）
          const safeCols = columns.filter((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c));
          if (safeCols.length !== columns.length) continue; // 跳过含非法列名的记录
          const values = safeCols.map((c) => (row as any)[c]);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          await query(
            `INSERT INTO ${table} (${safeCols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
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
