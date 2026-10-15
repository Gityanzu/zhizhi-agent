import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  listUserApiKeys,
  addUserApiKey,
  deleteUserApiKey,
  setDefaultApiKey,
  getActiveApiKey
} from '../services/userApiKey';
import {
  getModelsGroupedByProviders,
  getProviderById,
  getConfigurableProviders,
  providerHasModel,
  normalizeProviderId
} from '../services/llmProvider';
import { fetchProviderModels } from '../services/modelCatalog';
import {
  getUserModelPreference,
  setUserCurrentModel,
  addCustomModel,
  removeCustomModel
} from '../services/userModelPreference';

const router = Router();

// 获取用户的所有API Key
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const keys = await listUserApiKeys(req.userId!);
    res.json({ keys });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '获取API Key列表失败' });
  }
});

/**
 * 可配置 API Key 的厂商清单。
 * 前端"厂商"下拉据此渲染 —— 此前前端写死的 openai 选项后端并无对应 provider，
 * 用户选了必然匹配失败，且失败还是静默的。
 */
router.get('/providers', requireAuth, async (_req: AuthRequest, res) => {
  try {
    res.json({ providers: getConfigurableProviders() });
  } catch (error: any) {
    // 把真实原因打到服务端日志，否则前端只能看到"获取厂商列表失败"，无法定位
    console.error('[UserApiKey] /providers 失败:', error instanceof Error ? error.stack : error);
    res.status(500).json({ error: error.message || '获取厂商列表失败' });
  }
});

/**
 * 当前生效的模型配置（登录后前端据此自动回填）。
 *
 * 返回用户"当前生效 Key"的厂商 + 该厂商下的模型列表，不含 Key 明文。
 * 只返回该厂商的模型，是为了避免下拉里出现用户根本没有 Key 的模型 —— 选了必然报错。
 *
 * matched=false 或 warning 非空时前端必须显式提示用户：否则 Key 配了却悄悄回退到
 * 系统默认模型，用户完全察觉不到。
 * `?refresh=1` 会用该用户的 Key 向厂商拉一次真实模型清单（失败则降级为内置清单）。
 */
router.get('/active', requireAuth, async (req: AuthRequest, res) => {
  try {
    const active = await getActiveApiKey(req.userId!);
    if (!active) {
      return res.json({
        configured: false,
        matched: false,
        provider: null,
        providerId: null,
        providerName: null,
        keyPrefix: null,
        baseUrl: null,
        models: [],
        groups: [],
        currentModel: null,
        customModels: [],
        warning: null,
      });
    }

    const providerId = normalizeProviderId(active.provider);
    const provider = getProviderById(providerId);

    // 厂商匹配不上时绝不静默回退，必须把原因和可选项一起告诉用户
    if (!provider) {
      const supported = getConfigurableProviders().map((p) => `${p.name}(${p.id})`).join('、');
      return res.json({
        configured: true,
        matched: false,
        provider: active.provider,
        providerId,
        providerName: active.provider,
        keyPrefix: active.key_prefix,
        baseUrl: active.base_url || null,
        models: [],
        groups: [],
        warning: `当前 Key 的厂商「${active.provider}」不受支持，已回退到系统默认模型。可选厂商：${supported}`,
        currentModel: null,
        customModels: [],
      });
    }

    let refreshError: string | null = null;
    if (String(req.query.refresh) === '1') {
      const r = await fetchProviderModels(provider.id, active.api_key, active.base_url || provider.baseUrl);
      refreshError = r.error || null;
    }

    const groups = getModelsGroupedByProviders([provider.id]);
    const builtinModels = groups[0]?.models || [];

    // 用户偏好：当前选中的模型 + 自定义模型（厂商清单之外的模型 id）
    let preference = { provider: null as string | null, model: null as string | null, customModels: [] as Array<{ provider: string; id: string }> };
    try {
      preference = await getUserModelPreference(req.userId!);
    } catch (e) {
      console.warn('[UserApiKey] 读取用户模型偏好失败:', e instanceof Error ? e.message : String(e));
    }

    const ownedCustom = preference.customModels.filter(
      (m) => !m.provider || normalizeProviderId(m.provider) === provider.id
    );
    const known = new Set(builtinModels.map((m) => m.id));
    const customEntries = ownedCustom
      .filter((m) => !known.has(m.id))
      .map((m) => ({
        id: m.id,
        name: `${m.id}（自定义）`,
        description: '用户自定义模型',
        free: false,
        providerId: provider.id,
        providerName: provider.name,
      }));

    const models = [...builtinModels, ...customEntries];
    const mergedGroups = groups.length ? [{ ...groups[0], models }] : [];

    const warning = refreshError
      ? `模型列表刷新失败（${refreshError}），当前展示内置清单。`
      : models.length === 0
        ? `厂商「${provider.name}」未返回可用模型，请检查 Key 权限或稍后重试。`
        : null;

    res.json({
      configured: true,
      matched: true,
      provider: provider.id,
      providerId: provider.id,
      providerName: provider.name,
      keyPrefix: active.key_prefix,
      // Key 自带的 base_url 优先（自部署/代理场景），否则回退厂商默认地址
      baseUrl: active.base_url || provider.baseUrl || null,
      models,
      groups: mergedGroups,
      // 用户当前选中的模型（请求级生效），前端据此回填下拉
      currentModel: preference.model || null,
      customModels: ownedCustom,
      warning,
    });
  } catch (error: any) {
    console.error('[UserApiKey] /active 失败:', error instanceof Error ? error.stack : error);
    res.status(500).json({ error: error.message || '获取当前模型配置失败' });
  }
});

/** 用当前用户的 Key 主动刷新一次厂商模型清单（前端"刷新"按钮） */
router.post('/refresh-models', requireAuth, async (req: AuthRequest, res) => {
  try {
    const active = await getActiveApiKey(req.userId!);
    if (!active) {
      return res.status(400).json({ error: '尚未配置 API Key' });
    }
    const provider = getProviderById(normalizeProviderId(active.provider));
    if (!provider) {
      return res.status(400).json({ error: `不支持的厂商：${active.provider}` });
    }

    const r = await fetchProviderModels(provider.id, active.api_key, active.base_url || provider.baseUrl);
    const groups = getModelsGroupedByProviders([provider.id]);
    const models = groups[0]?.models || [];

    res.json({
      success: !r.error,
      error: r.error || null,
      count: models.length,
      models,
      groups,
      message: r.error ? `刷新失败：${r.error}` : `已刷新，共 ${models.length} 个模型`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '刷新模型列表失败' });
  }
});

/**
 * 取该用户持有 Key 的厂商集合。
 * 切模型只能在自己有 Key 的厂商内进行，否则切过去必然 401。
 */
async function ownedProviderIds(userId: string): Promise<Set<string>> {
  const keys = await listUserApiKeys(userId);
  return new Set(
    keys
      .map((k) => normalizeProviderId(k.provider))
      .filter((p): p is string => !!p)
  );
}

/**
 * 设置「用户当前使用的模型」。
 *
 * 这是用户级偏好（存 user_model_preferences），请求时随凭据进入请求上下文 ——
 * 因此 A 切模型不会影响 B。旧的全局 /api/model/switch 做不到这点。
 */
router.post('/current-model', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { modelId, providerId } = req.body || {};
    const id = typeof modelId === 'string' ? modelId.trim() : '';
    if (!id) {
      return res.status(400).json({ error: 'modelId 不能为空' });
    }

    const owned = await ownedProviderIds(req.userId!);
    if (owned.size === 0) {
      return res.status(400).json({ error: '请先配置 API Key' });
    }

    const provider = getProviderById(normalizeProviderId(providerId) || [...owned][0]);
    if (!provider) {
      return res.status(400).json({ error: `不支持的厂商：${providerId}` });
    }
    if (!owned.has(provider.id)) {
      return res.status(400).json({ error: `尚未配置「${provider.name}」的 API Key` });
    }

    const pref = await getUserModelPreference(req.userId!);
    const isCustom = pref.customModels.some((m) => m.id === id);
    if (!providerHasModel(provider.id, id) && !isCustom) {
      return res.status(400).json({
        error: `模型「${id}」不在厂商「${provider.name}」的清单中。如确认可用，请先添加为自定义模型。`,
      });
    }

    await setUserCurrentModel(req.userId!, provider.id, id);
    res.json({ message: `已切换到 ${id}`, providerId: provider.id, modelId: id });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '设置当前模型失败' });
  }
});

/** 添加自定义模型（厂商清单之外的 model id，如带日期的版本号），并顺手切换过去 */
router.post('/custom-models', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { modelId, providerId } = req.body || {};
    const id = typeof modelId === 'string' ? modelId.trim() : '';
    // 严格校验：该值会写入 JSONB 并最终拼进上游请求参数，不能放过奇怪字符
    if (!id || !/^[A-Za-z0-9._:\/-]{1,200}$/.test(id)) {
      return res.status(400).json({
        error: '模型 id 不合法（仅允许字母、数字与 . - _ : / ，且不超过 200 字符）',
      });
    }

    const owned = await ownedProviderIds(req.userId!);
    if (owned.size === 0) {
      return res.status(400).json({ error: '请先配置 API Key' });
    }

    const provider = getProviderById(normalizeProviderId(providerId) || [...owned][0]);
    if (!provider) {
      return res.status(400).json({ error: `不支持的厂商：${providerId}` });
    }
    if (!owned.has(provider.id)) {
      return res.status(400).json({ error: `尚未配置「${provider.name}」的 API Key` });
    }

    const list = await addCustomModel(req.userId!, provider.id, id);
    await setUserCurrentModel(req.userId!, provider.id, id);
    res.json({
      message: `已添加自定义模型 ${id}`,
      providerId: provider.id,
      modelId: id,
      customModels: list.filter((m) => !m.provider || normalizeProviderId(m.provider) === provider.id),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '添加自定义模型失败' });
  }
});

/** 删除自定义模型（两段路径，避免被 DELETE /:id 抢先匹配） */
router.delete('/custom-models/:modelId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const modelId = String(req.params.modelId || '').trim();
    if (!modelId) {
      return res.status(400).json({ error: 'modelId 不能为空' });
    }
    const list = await removeCustomModel(req.userId!, modelId);
    res.json({ message: `已删除 ${modelId}`, customModels: list });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '删除自定义模型失败' });
  }
});

// 添加API Key
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { provider, name, apiKey, baseUrl, isDefault } = req.body;

    if (!provider || !name || !apiKey) {
      return res.status(400).json({ error: '提供商、名称和API Key不能为空' });
    }

    // 厂商必须在内置清单里：否则存进去也匹配不到，用户等于白配一个 Key
    const providerId = normalizeProviderId(provider);
    if (!providerId || !getProviderById(providerId)) {
      const supported = getConfigurableProviders().map((p) => `${p.name}(${p.id})`).join('、');
      return res.status(400).json({ error: `不支持的厂商「${provider}」。可选：${supported}` });
    }

    // 统一存归一化后的 id（界面别名 dashscope → bailian），避免同一厂商存出多种写法
    const key = await addUserApiKey(req.userId!, providerId, name, apiKey, baseUrl, isDefault);
    res.json({ key, message: 'API Key添加成功' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || '添加API Key失败' });
  }
});

// 删除API Key
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const success = await deleteUserApiKey(req.userId!, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'API Key不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '删除失败' });
  }
});

// 设为默认
router.put('/:id/default', requireAuth, async (req: AuthRequest, res) => {
  try {
    const success = await setDefaultApiKey(req.userId!, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'API Key不存在' });
    }
    res.json({ message: '已设为默认' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '操作失败' });
  }
});

export default router;
