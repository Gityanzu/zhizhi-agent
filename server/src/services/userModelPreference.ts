import { query } from '../db';

/**
 * 用户级模型偏好：每个用户自己选中的模型 + 自己添加的自定义模型。
 *
 * 为什么单独建表：user_settings 是单例表（id 恒为 1），多用户共用一份；
 * 而"我用哪个模型"必须按用户隔离 —— 否则 A 切模型会把 B 正在用的也改掉。
 *
 * 这些偏好会随凭据一起进入请求上下文（见 resolveUserCredential），
 * 因此请求级就生效，不需要依赖全局的 currentModel。
 */

export interface CustomModel {
  provider: string;
  id: string;
}

export interface UserModelPreference {
  provider: string | null;
  model: string | null;
  customModels: CustomModel[];
}

const EMPTY: UserModelPreference = { provider: null, model: null, customModels: [] };

/** 容错解析 JSONB：兼容字符串数组与对象数组两种历史写法（导出供单测） */
export function normalizeCustomModels(raw: unknown): CustomModel[] {
  if (!Array.isArray(raw)) return [];
  const result: CustomModel[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    let id = '';
    let provider = '';
    if (typeof item === 'string') {
      id = item.trim();
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      id = String(obj.id ?? obj.model ?? '').trim();
      provider = String(obj.provider ?? '').trim();
    }
    if (!id) continue;
    const key = `${provider}|${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ provider, id });
  }
  return result;
}

export async function getUserModelPreference(userId: string): Promise<UserModelPreference> {
  const r = await query(
    'SELECT provider, model, custom_models FROM user_model_preferences WHERE user_id = $1',
    [userId]
  );
  if (r.rows.length === 0) return { ...EMPTY, customModels: [] };

  const row = r.rows[0];
  return {
    provider: row.provider || null,
    model: row.model || null,
    customModels: normalizeCustomModels(row.custom_models),
  };
}

/** 记录用户当前选中的模型（请求级生效：由 resolveUserCredential 带进凭据） */
export async function setUserCurrentModel(
  userId: string,
  provider: string | null,
  model: string | null
): Promise<void> {
  await query(
    `INSERT INTO user_model_preferences (user_id, provider, model, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET provider = EXCLUDED.provider, model = EXCLUDED.model, updated_at = NOW()`,
    [userId, provider, model]
  );
}

async function writeCustomModels(userId: string, models: CustomModel[]): Promise<void> {
  await query(
    `INSERT INTO user_model_preferences (user_id, custom_models, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET custom_models = EXCLUDED.custom_models, updated_at = NOW()`,
    [userId, JSON.stringify(models)]
  );
}

/** 添加自定义模型（厂商清单之外的 model id），返回去重后的完整清单 */
export async function addCustomModel(
  userId: string,
  provider: string,
  modelId: string
): Promise<CustomModel[]> {
  const current = await getUserModelPreference(userId);
  const exists = current.customModels.some((m) => m.id === modelId && m.provider === provider);
  const next = exists ? current.customModels : [...current.customModels, { provider, id: modelId }];
  await writeCustomModels(userId, next);
  return next;
}

/** 删除自定义模型，返回删除后的清单 */
export async function removeCustomModel(userId: string, modelId: string): Promise<CustomModel[]> {
  const current = await getUserModelPreference(userId);
  const next = current.customModels.filter((m) => m.id !== modelId);
  await writeCustomModels(userId, next);
  return next;
}
