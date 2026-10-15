import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getToken } from '@/api/request';
import { useAuthStore } from './auth';
import {
  getActiveApiKey,
  refreshProviderModels,
  setCurrentModel,
  addCustomModel,
  removeCustomModel,
} from '@/api/userApiKey';
import type { ChatMessage, SessionInfo, DocumentInfo, Folder, BranchInfo, ModelParams, CustomAgent, CustomTool, Collection, Provider, ProviderGroup, CompareResult, ModelInfo, SkillInfo } from '@/types';
import { createTask, cancelTask, approveTask, planConfirmTask, sendMessageViaTask } from '@/api/task';
import {
  getSessions,
  createSession,
  deleteSession,
  getDocuments,
  uploadDocument,
  deleteDocument as apiDeleteDocument,
  getCurrentModel,
  getAvailableModels,
  switchModel as apiSwitchModel,
  getProviders as apiGetProviders,
  refreshOllamaModels as apiRefreshOllama,
  compareChat as apiCompareChat,
  getSkills,
  switchSkill as apiSwitchSkill,
  getSessionUsage,
  analyzeImage,
  getSessionDetail,
  getBranches,
  switchBranchApi,
  editMessageApi,
  getFolders,
  createFolderApi,
  updateFolderApi,
  deleteFolderApi,
  moveToFolderApi,
  togglePinApi,
  updateTagsApi,
  updateSessionModelModeApi,
  renameSessionApi,
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  getCustomTools,
  createCustomTool,
  updateCustomTool,
  deleteCustomTool,
  getCollections,
  createCollection as apiCreateCollection,
  updateCollectionApi,
  deleteCollectionApi,
  updateSessionCollectionsApi,
  getWorkflows,
  createWorkflow,
  updateWorkflowApi,
  deleteWorkflowApi,
  executeWorkflowApi,
  getDBConnections,
  createDBConnection,
  updateDBConnectionApi,
  deleteDBConnectionApi,
  testDBConnectionApi,
  getDBSchemaApi,
  queryDBApi,
  createShareApi,
  revokeShareApi,
  importConversationsApi,
  getApiKeysApi,
  createApiKeyApi,
  deleteApiKeyApi,
} from '@/api';

// 默认模型参数
const DEFAULT_MODEL_PARAMS: ModelParams = {
  temperature: 0.7,
  top_p: 1,
  max_tokens: 2048,
  presence_penalty: 0,
  frequency_penalty: 0,
};

// 从 localStorage 读取模型参数
function loadModelParams(): ModelParams {
  try {
    const raw = localStorage.getItem('zhizhi_model_params');
    if (raw) return { ...DEFAULT_MODEL_PARAMS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_MODEL_PARAMS };
}

export const useChatStore = defineStore('chat', () => {
  // 状态
  const sessions = ref<SessionInfo[]>([]);
  const currentSessionId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const documents = ref<DocumentInfo[]>([]);
  const totalChunks = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const abortController = ref<AbortController | null>(null);
  const currentTaskId = ref<string | null>(null); // 当前进行中的任务ID（用于取消/审批关联）
  
  // 任务模式：qa(智能问答) / agent / plan / multi(多Agent协作)
  const mode = ref<'qa' | 'agent' | 'plan' | 'multi'>('agent');
  
  // 思考模式：开启后模型会先输出思考过程再回答
  const enableThinking = ref(false);
  
  // 监听模式变化，自动更新当前会话（切换会话恢复时不触发）
  let isRestoringSession = false;
  watch(mode, (newMode) => {
    if (isRestoringSession) return;
    if (currentSessionId.value) {
      updateSessionModelModeApi(currentSessionId.value, newMode, undefined).catch(() => {});
    }
  });
  
  // 模型相关
  const currentModel = ref<ModelInfo | null>(null);
  const availableModels = ref<ModelInfo[]>([]);
  const isSwitchingModel = ref(false);

  // 功能10：多提供商
  const providers = ref<Provider[]>([]);
  const modelGroups = ref<ProviderGroup[]>([]);
  const ollamaAvailable = ref(false);
  const isRefreshingOllama = ref(false);

  // 功能11：模型对比
  const compareMode = ref(false);
  const compareResults = ref<CompareResult[]>([]);
  const compareRunning = ref(false);
  const compareAbort = ref<AbortController | null>(null);
  
  // Skill 相关
  const skills = ref<SkillInfo[]>([]);
  const activeSkill = ref<SkillInfo | null>(null);
  const isSwitchingSkill = ref(false);
  
  // Token 用量统计
  const lastTokenUsage = ref<{ promptTokens: number; completionTokens: number; totalTokens: number } | null>(null);
  const sessionUsage = ref<{
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCostCents: number;
    messageCount: number;
    byModel: Array<{ model: string; totalTokens: number; count: number }>;
  } | null>(null);

  // ===== 功能1：对话分支 =====
  const currentBranchId = ref<string | null>(null);
  const branches = ref<BranchInfo[]>([]);

  // ===== 功能2：模型参数 =====
  const modelParams = ref<ModelParams>(loadModelParams());

  // ===== 功能3：文件夹 / 标签 / 置顶 =====
  const folders = ref<Folder[]>([]);
  const activeFolderFilter = ref<string | null>(null); // null=全部, 'none'=未归类, 其他=文件夹id
  const activeTagFilter = ref<string | null>(null);

  // ===== 功能5：自定义Agent =====
  const customAgents = ref<CustomAgent[]>([]);
  const currentAgentId = ref<string | null>(null); // null = 默认助手

  // ===== 功能6：自定义API工具 =====
  const customTools = ref<CustomTool[]>([]);

  // ===== 功能8：知识库集合 =====
  const collections = ref<Collection[]>([]);
  const currentCollectionId = ref<string | null>(null); // 文档面板当前激活的知识库 Tab（null=全部）
  const sessionCollectionIds = ref<string[]>([]); // 当前会话关联的知识库（用于检索过滤）

  // ===== 功能13：语音对话 =====
  const voiceInputEnabled = ref(localStorage.getItem('zhizhi_voice_input') === 'true');
  const autoSpeakEnabled = ref(localStorage.getItem('zhizhi_auto_speak') === 'true');

  function toggleVoiceInput() {
    voiceInputEnabled.value = !voiceInputEnabled.value;
    localStorage.setItem('zhizhi_voice_input', String(voiceInputEnabled.value));
  }
  function toggleAutoSpeak() {
    autoSpeakEnabled.value = !autoSpeakEnabled.value;
    localStorage.setItem('zhizhi_auto_speak', String(autoSpeakEnabled.value));
  }

  // 直接调用浏览器语音合成朗读文本
  function speakText(text: string) {
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (!text || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
      utterance.lang = 'zh-CN';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch { /* ignore */ }
  }

  // ===== 功能12：工作流编排 =====
  const workflows = ref<any[]>([]);

  // ===== 功能15：数据库连接 =====
  const dbConnections = ref<any[]>([]);

  // ===== 功能20：对外 API Key =====
  const apiKeys = ref<any[]>([]);

  // 模型参数变化自动持久化
  watch(modelParams, (val) => {
    localStorage.setItem('zhizhi_model_params', JSON.stringify(val));
  }, { deep: true });

  // 计算属性
  const currentSession = computed(() => 
    sessions.value.find(s => s.id === currentSessionId.value)
  );

  // 过滤后的会话列表（置顶 + 文件夹/标签筛选）
  const filteredSessions = computed(() => {
    let list = sessions.value;
    if (activeFolderFilter.value === 'none') {
      list = list.filter(s => !s.folderId);
    } else if (activeFolderFilter.value) {
      list = list.filter(s => s.folderId === activeFolderFilter.value);
    }
    if (activeTagFilter.value) {
      list = list.filter(s => (s.tags || []).includes(activeTagFilter.value!));
    }
    return list;
  });

  // 全部会话中出现的标签
  const allTags = computed(() => {
    const set = new Set<string>();
    for (const s of sessions.value || []) {
      for (const t of (s.tags || [])) set.add(t);
    }
    return Array.from(set);
  });

  // 生成唯一ID
  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 失败提示可能同时来自 error 与 status 两类事件（后端为兼容两种订阅都发了），
  // 这里做幂等，避免同一句错误被追加两遍。
  function appendTaskError(msg: any, reason: string) {
    const text = `[错误] ${reason}`;
    if (!msg.content || !msg.content.includes(text)) {
      msg.content = msg.content ? `${msg.content}\n\n${text}` : text;
    }
    msg.isStreaming = false;
  }

  // 登录用户已配置的厂商信息（来自 /user-api-keys/active）
  const authStore = useAuthStore();
  const userProvider = ref<{
    configured: boolean;
    matched: boolean;
    providerId: string | null;
    providerName: string | null;
    keyPrefix: string | null;
    baseUrl: string | null;
    warning: string | null;
    /** 用户添加的自定义模型（厂商清单之外的 id） */
    customModels: Array<{ provider: string; id: string }>;
  } | null>(null);

  /**
   * 登录后按用户自己的 API Key 收窄模型列表。
   *
   * 用户只配了 DeepSeek 的 Key 时，下拉里就不该再出现百炼模型 —— 选了必然 401。
   * 未登录或未配置 Key 时保持全局列表不变。
   *
   * 收窄失败（厂商不支持 / 无可用模型 / 刷新失败）必须留下 warning 供 UI 展示：
   * 静默回退会让用户以为自己的 Key 已经生效。
   */
  async function applyUserScopedModels() {
    if (!authStore.isAuthenticated) {
      userProvider.value = null;
      return;
    }
    try {
      const res = await getActiveApiKey();
      const info = res.data;
      userProvider.value = {
        configured: !!info.configured,
        matched: info.matched !== false,
        providerId: info.providerId,
        providerName: info.providerName,
        keyPrefix: info.keyPrefix,
        baseUrl: info.baseUrl,
        warning: info.warning || null,
        customModels: info.customModels || [],
      };
      if (!info.configured || info.matched === false || !info.models?.length) {
        if (info.warning) console.warn('[模型] 用户 Key 未能生效:', info.warning);
        return;
      }

      if (info.groups?.length) modelGroups.value = info.groups;
      availableModels.value = info.models;

      // 后端返回的是「该用户真实生效的模型」（用户级偏好 + 自定义模型），
      // 优先用它回填界面，避免下拉显示与真正发出去的模型不一致。
      const preferred = info.currentModel
        ? info.models.find((m: any) => m.id === info.currentModel)
        : null;
      if (preferred) {
        currentModel.value = preferred;
      } else {
        // 只做本地视图收敛：/api/model/switch 改的是服务端进程级全局模型，多用户下
        // A 登录会把 B 正在用的模型一起改掉。真正生效的厂商/模型由请求级凭据在
        // 服务端 resolveProviderAndModel() 里决定，前端不需要（也不应该）写全局状态。
        const currentId = currentModel.value?.id;
        const stillValid = info.models.some((m: any) => m.id === currentId);
        if (!stillValid) {
          currentModel.value = info.models[0];
        }
      }
    } catch (e) {
      console.warn('读取用户模型配置失败，回退全局模型列表:', e);
      userProvider.value = null;
    }
  }

  const isRefreshingModels = ref(false);

  /**
   * 用当前用户的 Key 向厂商拉最新模型清单（下拉里的"刷新"）。
   * 失败时保留原清单，并把原因写进 userProvider.warning —— 让用户看得见，而不是无声无息。
   */
  async function refreshUserProviderModels() {
    if (isRefreshingModels.value) return null;

    // 未登录时保持原有的 Ollama 刷新行为
    if (!authStore.isAuthenticated) {
      await refreshOllama();
      return null;
    }

    isRefreshingModels.value = true;
    try {
      const res = await refreshProviderModels();
      const data = res.data;
      if (data.models?.length) {
        availableModels.value = data.models;
        if (data.groups?.length) modelGroups.value = data.groups;
      }
      if (userProvider.value) userProvider.value.warning = data.error || null;
      return data;
    } finally {
      isRefreshingModels.value = false;
    }
  }

  // 登录/登出后重新解析可用模型：loadModelInfo 只在应用启动时跑一次，
  // 用户"先打开应用、后登录"时若不重算，模型列表会一直停留在全局那份。
  watch(() => authStore.isAuthenticated, (loggedIn) => {
    // 登出也必须重算：loadModelInfo 会先拉回全局清单，已登录时再按用户收窄。
    // 只调 applyUserScopedModels 的话，登出后会残留上一个账号的模型列表。
    if (loggedIn) applyUserScopedModels().catch(() => {});
    else loadModelInfo().catch(() => {});
  });

  // 加载模型信息
  async function loadModelInfo() {
    try {
      const [current, available, prov] = await Promise.all([
        getCurrentModel().catch(() => ({ model: null })),
        getAvailableModels().catch(() => ({ models: [], groups: [] })),
        apiGetProviders().catch(() => ({ providers: [], ollamaAvailable: false })),
      ]);
      
      console.log('🔍 Model info loaded:', { current, available, prov });
      
      currentModel.value = current?.model || null;
      availableModels.value = available?.models || [];
      modelGroups.value = available?.groups || [];
      providers.value = prov.providers || [];
      ollamaAvailable.value = !!prov.ollamaAvailable;
      
      console.log('✅ Models loaded:', {
        current: currentModel.value,
        count: availableModels.value.length,
        groups: modelGroups.value.length
      });

      // 登录用户：按自己的 API Key 收窄可选模型（未登录时保持全局列表）
      await applyUserScopedModels();
    } catch (e) {
      console.error('加载模型信息失败:', e);
    }
  }

  /**
   * 用户级切换：写 user_model_preferences，请求时随凭据在服务端生效。
   * 返回结构对齐全局接口（/api/model/switch），调用方无需区分。
   */
  async function switchUserModel(modelId: string, providerId?: string) {
    await setCurrentModel(modelId, providerId);
    const found = availableModels.value.find((m: any) => m.id === modelId);
    const model = found || {
      id: modelId,
      name: modelId,
      description: '',
      provider: userProvider.value?.providerName || '',
      providerId: providerId || userProvider.value?.providerId || '',
      providerName: userProvider.value?.providerName || '',
      free: false,
    };
    return { success: true, model };
  }

  // 切换模型
  async function switchModel(modelId: string, providerId?: string) {
    if (isSwitchingModel.value) return;
    isSwitchingModel.value = true;
    try {
      // 登录且已配置自己的 Key：走用户级偏好（请求级生效，且不会改到别人的模型）；
      // 否则回退全局 /api/model/switch（未登录 / 单机场景）。
      const userScoped = authStore.isAuthenticated && !!userProvider.value?.configured;
      const result = userScoped
        ? await switchUserModel(modelId, providerId)
        : await apiSwitchModel(modelId, providerId);
      if (result.success) {
        currentModel.value = result.model;
        // 更新当前会话的模型字段
        if (currentSessionId.value) {
          updateSessionModelModeApi(currentSessionId.value, undefined, modelId).catch(() => {});
        }
      }
      return result;
    } catch (e) {
      console.error('切换模型失败:', e);
      throw e;
    } finally {
      isSwitchingModel.value = false;
    }
  }

  /** 添加自定义模型（厂商清单之外的 id）并切换过去 */
  async function addUserCustomModel(modelId: string, providerId?: string) {
    const res = await addCustomModel(modelId, providerId);
    await applyUserScopedModels();
    const hit = availableModels.value.find((m: any) => m.id === res.data.modelId);
    if (hit) currentModel.value = hit;
    return res.data;
  }

  /** 删除自定义模型 */
  async function removeUserCustomModel(modelId: string) {
    const res = await removeCustomModel(modelId);
    await applyUserScopedModels();
    return res.data;
  }

  // 功能10：重新检测 Ollama 模型
  async function refreshOllama() {
    if (isRefreshingOllama.value) return;
    isRefreshingOllama.value = true;
    try {
      const res = await apiRefreshOllama();
      ollamaAvailable.value = !!res.ollamaAvailable;
      // 重新拉取模型列表
      const available = await getAvailableModels().catch(() => null);
      if (available) {
        availableModels.value = available.models;
        modelGroups.value = available.groups || [];
      }
      return res;
    } catch (e) {
      console.error('刷新Ollama失败:', e);
      throw e;
    } finally {
      isRefreshingOllama.value = false;
    }
  }

  // ===== 功能11：模型对比 =====
  function setCompareMode(on: boolean) {
    compareMode.value = on;
    if (!on) stopCompare();
  }

  function resetCompareResults(count: number) {
    compareResults.value = Array.from({ length: count }, (_, i) => ({
      index: i,
      model: '',
      providerId: '',
      modelLabel: '',
      answer: '',
      done: false,
    }));
  }

  async function startCompare(message: string, models: Array<{ model: string; providerId?: string }>) {
    if (!message.trim() || models.length === 0 || compareRunning.value) return;
    compareRunning.value = true;
    resetCompareResults(models.length);

    const controller = new AbortController();
    compareAbort.value = controller;

    try {
      await apiCompareChat(
        message,
        models,
        { ...modelParams.value },
        (chunk) => {
          switch (chunk.type) {
            case 'compare_start':
              // 初始化各栏标签
              (chunk.targets || []).forEach((t: any) => {
                const r = compareResults.value[t.index];
                if (r) {
                  r.model = t.model;
                  r.providerId = t.providerId || 'bailian';
                  r.modelLabel = t.model;
                }
              });
              break;
            case 'compare_token': {
              const r = compareResults.value[chunk.index];
              if (r) {
                r.answer += chunk.content || '';
                if (chunk.modelLabel) r.modelLabel = chunk.modelLabel;
              }
              break;
            }
            case 'compare_done': {
              const r = compareResults.value[chunk.index];
              if (r) {
                r.modelLabel = chunk.modelLabel || r.modelLabel;
                r.providerId = chunk.providerId || r.providerId;
                r.tokenUsage = chunk.tokenUsage;
                r.elapsedMs = chunk.elapsedMs;
                r.error = chunk.error;
                r.done = true;
              }
              break;
            }
            case 'compare_all_done':
              break;
            case 'error':
              console.error('对比出错:', chunk.content);
              break;
          }
        },
        controller.signal
      );
    } catch (e: any) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error('模型对比失败:', e);
      }
    } finally {
      compareRunning.value = false;
      compareAbort.value = null;
    }
  }

  function stopCompare() {
    if (compareAbort.value) {
      compareAbort.value.abort();
      compareAbort.value = null;
    }
    compareRunning.value = false;
  }

  // 采用某栏回答：将其作为助手消息加入当前对话
  function adoptCompareResult(index: number) {
    const r = compareResults.value[index];
    if (!r || !r.answer) return;
    messages.value.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      role: 'assistant',
      content: r.answer,
      timestamp: new Date().toISOString(),
      mode: 'qa',
    });
    compareMode.value = false;
  }

  // 加载 Skill 列表
  async function loadSkills() {
    try {
      const result = await getSkills();
      skills.value = result.skills || [];
      activeSkill.value = result.skills?.find((s: SkillInfo) => s.isActive) || result.skills?.[result.skills.length - 1] || null;
    } catch (e) {
      console.error('加载 Skill 列表失败:', e);
    }
  }

  // 切换 Skill
  async function switchSkill(skillId: string) {
    if (isSwitchingSkill.value) return;
    isSwitchingSkill.value = true;
    try {
      const result = await apiSwitchSkill(skillId);
      if (result.success) {
        activeSkill.value = result.skill;
        // 更新本地列表的激活状态
        skills.value.forEach(s => s.isActive = (s.id === skillId));
      }
      return result;
    } catch (e) {
      console.error('切换Skill失败:', e);
      throw e;
    } finally {
      isSwitchingSkill.value = false;
    }
  }

  // 切换任务模式
  function setMode(newMode: 'qa' | 'agent' | 'plan' | 'multi') {
    mode.value = newMode;
  }

  // 加载会话列表
  async function loadSessions() {
    // 未登录不加载任何历史会话（防御：即使绕过路由也不展示）
    if (!getToken()) {
      sessions.value = [];
      return;
    }
    try {
      sessions.value = await getSessions(activeFolderFilter.value, activeTagFilter.value || undefined);
    } catch (e) {
      console.error('加载会话列表失败:', e);
    }
  }

  // 加载文件夹列表
  async function loadFolders() {
    if (!getToken()) {
      folders.value = [];
      return;
    }
    try {
      const res = await getFolders();
      folders.value = res.folders || [];
    } catch (e) {
      console.error('加载文件夹失败:', e);
    }
  }

  // 新建文件夹
  async function createFolder(name: string, icon?: string) {
    const folder = await createFolderApi(name, icon);
    folders.value.push(folder);
    return folder;
  }

  // 重命名文件夹
  async function renameFolder(folderId: string, name: string) {
    await updateFolderApi(folderId, name);
    const f = folders.value.find(f => f.id === folderId);
    if (f) f.name = name;
  }

  // 重命名会话标题（顶栏内联编辑；同步会话列表与当前会话）
  async function renameSession(sessionId: string, title: string) {
    const clean = title.trim();
    if (!clean) return;
    await renameSessionApi(sessionId, clean);
    const s = sessions.value.find(x => x.id === sessionId);
    if (s) s.title = clean;
  }

  // 删除文件夹
  async function removeFolder(folderId: string) {
    await deleteFolderApi(folderId);
    folders.value = folders.value.filter(f => f.id !== folderId);
    await loadSessions();
  }

  // 移动会话到文件夹
  async function moveToFolder(sessionId: string, folderId: string | null) {
    await moveToFolderApi(sessionId, folderId);
    const s = sessions.value.find(s => s.id === sessionId);
    if (s) s.folderId = folderId;
    await loadSessions();
  }

  // 切换置顶
  async function togglePin(sessionId: string) {
    await togglePinApi(sessionId);
    const s = sessions.value.find(s => s.id === sessionId);
    if (s) s.isPinned = !s.isPinned;
    await loadSessions();
  }

  // 更新会话标签
  async function updateTags(sessionId: string, tags: string[]) {
    await updateTagsApi(sessionId, tags);
    const s = sessions.value.find(s => s.id === sessionId);
    if (s) s.tags = tags;
    await loadSessions();
  }

  // 新建会话
  async function newSession() {
    // 创建会话时存储当前模型和模式，便于切换会话时恢复
    const modelId = currentModel.value?.id || undefined;
    const session = await createSession(undefined, mode.value, modelId);
    sessions.value.unshift(session);
    currentSessionId.value = session.id;
    messages.value = [];
    currentBranchId.value = null;
    branches.value = [];
  }

  // 加载当前会话的分支列表
  async function loadBranches(sessionId: string) {
    try {
      const res = await getBranches(sessionId);
      branches.value = res.branches || [];
    } catch (e) {
      console.error('加载分支列表失败:', e);
    }
  }

  // 切换会话
  async function switchSession(id: string) {
    currentSessionId.value = id;
    messages.value = [];
    lastTokenUsage.value = null;
    currentBranchId.value = null;
    
    // 加载会话历史消息
    try {
      const detail = await getSessionDetail(id);
      if (detail.messages && Array.isArray(detail.messages)) {
        messages.value = detail.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.created_at || m.timestamp,
          sources: m.sources || [],
          toolCalls: m.tool_calls || m.toolCalls || [],
          mode: m.mode,
          thinking: m.thinking,
          plan: m.plan,
          agentTrace: m.agent_trace || m.agentTrace,
          parentId: m.parent_id || m.parentId,
          branchId: m.branch_id || m.branchId,
          artifacts: m.artifacts || [],
        }));
        // 当前分支 = 最后一条消息所属分支
        const last = detail.messages[detail.messages.length - 1];
        currentBranchId.value = last?.branch_id || last?.branchId || null;
      }
      if (detail.branches) branches.value = detail.branches;
      // 加载会话关联的知识库
      sessionCollectionIds.value = (detail.info?.collectionIds || []) as string[];
      
      // 恢复会话对应的模式和模型（设置标志位避免触发watch更新）
      isRestoringSession = true;
      if (detail.info?.mode) {
        mode.value = detail.info.mode as any;
      }
      if (detail.info?.model) {
        const foundModel = availableModels.value.find(m => m.id === detail.info!.model);
        if (foundModel) {
          currentModel.value = foundModel;
        }
      }
      // 下一帧重置标志位
      setTimeout(() => { isRestoringSession = false; }, 0);
    } catch (e: any) {
      console.error('加载会话历史失败:', e);
      ElMessage.error(e?.response?.data?.error || '打开会话失败，请检查网络或刷新重试');
    }

    // 加载会话用量统计
    loadSessionUsage(id).catch(() => {});
  }

  // 切换分支
  async function switchBranch(branchId: string) {
    if (!currentSessionId.value) return;
    try {
      const res = await switchBranchApi(currentSessionId.value, branchId);
      currentBranchId.value = branchId;
      if (res.messages && Array.isArray(res.messages)) {
        messages.value = res.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.created_at || m.timestamp,
          sources: m.sources || [],
          toolCalls: m.tool_calls || m.toolCalls || [],
          mode: m.mode,
          thinking: m.thinking,
          plan: m.plan,
          agentTrace: m.agent_trace || m.agentTrace,
          parentId: m.parent_id || m.parentId,
          branchId: m.branch_id || m.branchId,
          artifacts: m.artifacts || [],
        }));
      }
    } catch (e) {
      console.error('切换分支失败:', e);
    }
  }

  // 编辑消息（用户消息）：更新内容，删除后续消息，生成新分支重新请求回答
  async function editMessage(messageId: string, newContent: string) {
    if (isLoading.value || !currentSessionId.value) return;
    try {
      await editMessageApi(messageId, newContent);
    } catch (e) {
      console.error('编辑消息失败:', e);
      return;
    }
    // 本地：更新该消息内容，删除其后所有消息
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    messages.value[idx].content = newContent;
    messages.value = messages.value.slice(0, idx + 1);
    
    // 添加新的助手消息（占位，用于流式填充）
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      sources: [],
      toolCalls: [],
      mode: mode.value,
    };
    messages.value.push(assistantMessage);
    const assistantIndex = messages.value.length - 1;
    
    // 生成新分支，基于被编辑的用户消息重新请求回答（不新增用户消息）
    const newBranchId = generateId();
    currentBranchId.value = newBranchId;
    lastTokenUsage.value = null;
    isLoading.value = true;
    error.value = null;
    const controller = new AbortController();
    abortController.value = controller;

    try {
      await sendMessageViaTask(
        newContent,
        currentSessionId.value,
        mode.value,
        enableThinking.value,
        (chunk) => {
          const msg = messages.value[assistantIndex];
          if (!msg) return;
          
          switch (chunk.type) {
            case 'session_id':
              if (chunk.branch_id) {
                currentBranchId.value = chunk.branch_id;
                messages.value[idx].branchId = chunk.branch_id;
                msg.branchId = chunk.branch_id;
              }
              break;
            case 'thinking':
              msg.thinking = (msg.thinking || '') + chunk.content;
              break;
            case 'token':
              msg.content += chunk.content;
              break;
            case 'tool_call': {
              // 工具轮次开头会先流一段文字（此刻还不知道这轮会不会调工具），到
              // tool_call 到达时它已经混进正文了。按定义"带工具调用的那轮文字"
              // 只是动作前的说明、不是最终回答，所以整段挪进思考过程（可折叠），
              // 正文只留真正没有工具调用的那一轮。
              // 不搬走的话，多轮前言会一条条堆在正文里 —— 实测堆出四句
              // 「好的，我来为你生成…」，看起来像模型在自言自语、任务没做完。
              const preamble = msg.content;
              if (preamble.trim()) {
                msg.content = '';
                msg.thinking = (msg.thinking || '') + preamble;
              }
              if (chunk.toolCall) {
                msg.toolCalls?.push({
                  name: chunk.toolCall.name,
                  arguments: chunk.toolCall.arguments,
                  result: undefined,
                });
              }
              break;
            }
            case 'tool_result': {
              const toolCalls = msg.toolCalls;
              const lastToolCall = toolCalls?.[toolCalls.length - 1];
              if (lastToolCall) {
                lastToolCall.result = chunk.content;
              }
              // 工具产出文件：挂到本条消息上，正文之后渲染成文件卡片。
              // 按路径去重：同一文件"先创建后追加"只会收到一条。
              if (chunk.artifacts?.length) {
                if (!msg.artifacts) msg.artifacts = [];
                for (const a of chunk.artifacts) {
                  if (!msg.artifacts.some((x) => x.path === a.path)) msg.artifacts.push(a);
                }
              }
              break;
            }
            case 'retrieval':
              if (chunk.sources) {
                msg.sources = chunk.sources;
              }
              break;
            case 'plan_created':
            case 'planning':
              if (chunk.plan) {
                msg.plan = chunk.plan;
              }
              break;
            case 'agent_progress':
              if (!msg.agentTrace) msg.agentTrace = [];
              msg.agentTrace.push({
                agent: (chunk as any).agent,
                action: (chunk as any).action,
                content: (chunk as any).content,
              });
              break;
            case 'approval_required':
              if (chunk.requestId || chunk.taskId) {
                msg.pendingApproval = {
                  requestId: chunk.requestId || chunk.taskId || '',
                  kind: chunk.kind || 'write',
                  path: chunk.path || '',
                  inRoot: chunk.inRoot ?? false,
                  oldContent: chunk.oldContent,
                  newContent: chunk.newContent,
                  description: chunk.description,
                  taskId: chunk.taskId,
                };
              }
              break;

            case 'plan_proposed':
              // Plan 模式前置确认：挂计划卡，任务引擎阻塞等待用户确认
              if (chunk.taskId) {
                msg.pendingPlan = {
                  requestId: chunk.taskId,
                  plan: (chunk as any).plan || [],
                  taskId: chunk.taskId,
                };
              }
              break;
            case 'error':
              // 后端在任务异常时补发的原因（如"额度不足/Key 无效"），必须落到气泡里
              appendTaskError(msg, (chunk as any).content || '任务执行失败');
              error.value = (chunk as any).content || '任务执行失败';
              break;

            case 'status':
              // 任务收尾状态：failed 时原因在 error 字段里。
              // 此前完全没处理 status，于是模型 403（免费额度耗尽）时用户只看到
              // 一个空白气泡、反复重发也没反应 —— 失败必须让用户看见。
              if ((chunk as any).status === 'failed') {
                const reason = (chunk as any).error || '任务失败，请稍后重试';
                appendTaskError(msg, reason);
                error.value = reason;
              } else if ((chunk as any).status === 'cancelled') {
                msg.isStreaming = false;
              }
              break;

            case 'done':
              msg.isStreaming = false;
              // done 只有在「轮次用尽、任务被截断」时才会带 content。
              // 必须显示出来，否则对话会毫无征兆地停住，用户完全不知道原因
              if ((chunk as any).content) {
                msg.content += msg.content ? `\n\n${(chunk as any).content}` : (chunk as any).content;
              }
              if ((chunk as any).tokenUsage) {
                lastTokenUsage.value = (chunk as any).tokenUsage;
              }
              if ((chunk as any).sources) {
                msg.sources = (chunk as any).sources;
              }
              if ((chunk as any).plan) {
                msg.plan = (chunk as any).plan;
              }
              if ((chunk as any).agentTrace) {
                msg.agentTrace = (chunk as any).agentTrace;
              }
              break;
          }
        },
        controller.signal,
        {
          parentId: messageId,
          branchId: newBranchId,
          modelParams: { ...modelParams.value },
          isEdit: true,
          editMessageId: messageId,
          collectionIds: sessionCollectionIds.value.length > 0 ? [...sessionCollectionIds.value] : undefined,
        }
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error('编辑后重新生成失败:', e);
        error.value = '生成失败，请重试';
      }
    } finally {
      isLoading.value = false;
      abortController.value = null;
      if (messages.value[assistantIndex]) {
        messages.value[assistantIndex].isStreaming = false;
      }
    }
    await loadBranches(currentSessionId.value);
    await loadSessions();
  }

  // 桌面端文件审批：用户点击 允许/拒绝/本次会话始终允许 后调用，回调后端并本地标记已决。
  async function respondApproval(messageId: string, approved: boolean, remember: boolean = false) {
    const msg = messages.value.find(m => m.id === messageId);
    if (!msg || !msg.pendingApproval || msg.pendingApproval.decided) return;
    const { taskId } = msg.pendingApproval;
    msg.pendingApproval.decided = true;
    if (!taskId) {
      console.warn('审批缺少 taskId，无法恢复任务');
      return;
    }
    try {
      await approveTask(taskId, approved, remember);
    } catch (e) {
      console.error('审批响应失败:', e);
    }
  }

  // Plan 模式前置确认响应：用户点击 确认/修改后执行/取消 后调用，回调后端并本地标记已决。
  async function respondPlan(messageId: string, confirmed: boolean, feedback?: string) {
    const msg = messages.value.find(m => m.id === messageId);
    if (!msg || !msg.pendingPlan || msg.pendingPlan.decided) return;
    const { taskId } = msg.pendingPlan;
    msg.pendingPlan.decided = true;
    msg.pendingPlan.confirmed = confirmed;
    msg.pendingPlan.feedback = feedback;
    if (!taskId) {
      console.warn('计划确认缺少 taskId，无法恢复任务');
      return;
    }
    try {
      await planConfirmTask(taskId, confirmed, feedback);
    } catch (e) {
      console.error('计划确认响应失败:', e);
    }
  }

  // 删除会话
  async function removeSession(id: string) {
    await deleteSession(id);
    sessions.value = sessions.value.filter(s => s.id !== id);
    if (currentSessionId.value === id) {
      currentSessionId.value = null;
      messages.value = [];
    }
  }

  // 发送消息（流式输出 + 打字机效果）
  async function sendMessage(content: string) {
    if (!content.trim() || isLoading.value) return;

    // 分支：parentId = 当前最后一条消息id
    const parentId = messages.value.length > 0 ? messages.value[messages.value.length - 1].id : undefined;
    // 本次使用的分支：已有分支沿用，新分支由后端生成后通过 SSE 返回
    const branchId = currentBranchId.value || undefined;

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      branchId: branchId || undefined,
    };
    messages.value.push(userMessage);

    // 添加助手消息（占位，用于流式填充）
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      sources: [],
      toolCalls: [],
      mode: mode.value,
    };
    messages.value.push(assistantMessage);
    const assistantIndex = messages.value.length - 1;

    isLoading.value = true;
    error.value = null;
    let sessionCreated = false;

    // 创建 AbortController 用于停止生成
    const controller = new AbortController();
    abortController.value = controller;

    try {
      console.log(`[ChatStore] 发送消息 (${mode.value}模式, 流式):`, content);

      const result = await sendMessageViaTask(
        content,
        currentSessionId.value || undefined,
        mode.value,
        enableThinking.value,
        (chunk) => {
          const msg = messages.value[assistantIndex];
          if (!msg) return;

          switch (chunk.type) {
            case 'session_id':
              if (chunk.content && !currentSessionId.value) {
                currentSessionId.value = chunk.content;
                sessions.value.unshift({
                  id: chunk.content,
                  title: content.slice(0, 30),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  messageCount: 2,
                  mode: mode.value,
                  model: currentModel.value?.id,
                });
                sessionCreated = true;
              }
              // 接收服务端分配的分支id与真实用户消息id
              if (chunk.branch_id) {
                currentBranchId.value = chunk.branch_id;
                userMessage.branchId = chunk.branch_id;
                assistantMessage.branchId = chunk.branch_id;
              }
              if ((chunk as any).user_message_id) {
                userMessage.id = (chunk as any).user_message_id;
              }
              break;

            case 'thinking':
              msg.thinking = (msg.thinking || '') + chunk.content;
              break;

            case 'token':
              // 打字机效果：逐字追加
              msg.content += chunk.content;
              break;

            case 'tool_call': {
              // 同另一处流式处理：带工具调用的那轮文字只是动作前的说明，
              // 整段挪进思考过程，避免多轮前言堆成一条自言自语的消息
              const preamble = msg.content;
              if (preamble.trim()) {
                msg.content = '';
                msg.thinking = (msg.thinking || '') + preamble;
              }
              if (chunk.toolCall) {
                msg.toolCalls?.push({
                  name: chunk.toolCall.name,
                  arguments: chunk.toolCall.arguments,
                  result: undefined,
                });
              }
              break;
            }

            case 'tool_result': {
              const toolCalls = msg.toolCalls;
              const lastToolCall = toolCalls?.[toolCalls.length - 1];
              if (lastToolCall) {
                lastToolCall.result = chunk.content;
              }
              // 工具产出文件：挂到本条消息上，正文之后渲染成文件卡片。
              // 按路径去重：同一文件"先创建后追加"只会收到一条。
              if (chunk.artifacts?.length) {
                if (!msg.artifacts) msg.artifacts = [];
                for (const a of chunk.artifacts) {
                  if (!msg.artifacts.some((x) => x.path === a.path)) msg.artifacts.push(a);
                }
              }
              break;
            }

            case 'retrieval':
              if (chunk.sources) {
                msg.sources = chunk.sources;
              }
              break;

            case 'plan_created':
            case 'planning':
              if (chunk.plan) {
                msg.plan = chunk.plan;
              }
              break;

            case 'step_start':
            case 'step_done':
            case 'step_error':
              // Plan 模式步骤更新
              if (msg.plan && chunk.content) {
                // 可以在这里更新步骤状态
              }
              break;

            case 'agent_progress':
              // 多Agent实时进度
              if (!msg.agentTrace) msg.agentTrace = [];
              msg.agentTrace.push({
                agent: (chunk as any).agent,
                action: (chunk as any).action,
                content: (chunk as any).content,
              });
              break;

            case 'approval_required':
              // 桌面端文件审批：在当前助手消息上挂审批卡，任务引擎阻塞等待用户点击
              if (chunk.requestId || chunk.taskId) {
                msg.pendingApproval = {
                  requestId: chunk.requestId || chunk.taskId || '',
                  kind: chunk.kind || 'write',
                  path: chunk.path || '',
                  inRoot: chunk.inRoot ?? false,
                  oldContent: chunk.oldContent,
                  newContent: chunk.newContent,
                  description: chunk.description,
                  taskId: chunk.taskId,
                };
              }
              break;

            case 'plan_proposed':
              // Plan 模式前置确认：挂计划卡，任务引擎阻塞等待用户确认
              if (chunk.taskId) {
                msg.pendingPlan = {
                  requestId: chunk.taskId,
                  plan: (chunk as any).plan || [],
                  taskId: chunk.taskId,
                };
              }
              break;

            case 'done':
              msg.isStreaming = false;
              // 处理 done 事件中的额外数据
              // content 仅出现在「轮次用尽、任务被截断」时，必须呈现给用户
              if ((chunk as any).content) {
                msg.content += msg.content ? `\n\n${(chunk as any).content}` : (chunk as any).content;
              }
              if ((chunk as any).tokenUsage) {
                lastTokenUsage.value = (chunk as any).tokenUsage;
              }
              if ((chunk as any).sources) {
                msg.sources = (chunk as any).sources;
              }
              if ((chunk as any).plan) {
                msg.plan = (chunk as any).plan;
              }
              if ((chunk as any).agentTrace) {
                msg.agentTrace = (chunk as any).agentTrace;
              }
              // 功能13：自动播报回答
              if (autoSpeakEnabled.value && msg.content) {
                speakText(msg.content);
              }
              break;

            case 'error':
              appendTaskError(msg, chunk.content || '任务执行失败');
              error.value = chunk.content || '任务执行失败';
              break;

            case 'status':
              // 同 sendMessage：failed 的成因必须落到气泡里，否则用户看到空白对话
              if ((chunk as any).status === 'failed') {
                const reason = (chunk as any).error || '任务失败，请稍后重试';
                appendTaskError(msg, reason);
                error.value = reason;
              } else if ((chunk as any).status === 'cancelled') {
                msg.isStreaming = false;
              }
              break;
          }
        },
        controller.signal,
        {
          parentId,
          branchId,
          modelParams: { ...modelParams.value },
          agentId: currentAgentId.value || undefined,
          collectionIds: sessionCollectionIds.value.length > 0 ? [...sessionCollectionIds.value] : undefined,
        }
      );

      currentTaskId.value = result.taskId;

      // 确保最终状态
      messages.value[assistantIndex].isStreaming = false;

      // 刷新会话用量统计
      if (currentSessionId.value) {
        loadSessionUsage(currentSessionId.value).catch(() => {});
      }

      // 刷新会话列表（更新时间）
      if (!sessionCreated) {
        loadSessions().catch(() => {});
      }

      // 刷新分支列表
      if (currentSessionId.value) {
        loadBranches(currentSessionId.value).catch(() => {});
      }

      console.log('[ChatStore] 流式回答完成');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        console.log('[ChatStore] 用户停止生成');
        messages.value[assistantIndex].content += '\n\n[已停止]';
      } else {
        console.error('[ChatStore] 发送失败:', e);
        error.value = e instanceof Error ? e.message : String(e);
        messages.value[assistantIndex].content += `\n\n[错误] ${error.value}`;
      }
      messages.value[assistantIndex].isStreaming = false;
    } finally {
      // 确保最终状态总是被重置
      isLoading.value = false;
      abortController.value = null;
      if (messages.value[assistantIndex]) {
        messages.value[assistantIndex].isStreaming = false;
      }
    }
  }

  // 停止生成
  function stopGeneration() {
    if (currentTaskId.value) {
      cancelTask(currentTaskId.value).catch(() => {});
    }
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
  }

  // 重新生成最后一条回答（创建新分支）
  async function regenerate() {
    if (isLoading.value) return;
    // 找到最后一条用户消息
    const lastUserMsg = [...messages.value].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    // 删除最后一条助手消息
    const lastAssistantIndex = messages.value.map(m => m.role).lastIndexOf('assistant');
    if (lastAssistantIndex > -1) {
      messages.value.splice(lastAssistantIndex, 1);
    }
    // 生成新分支
    currentBranchId.value = generateId();
    // 重新发送
    await sendMessage(lastUserMsg.content);
  }

  // 发送图片消息（多模态）
  async function sendImageMessage(imageBase64: string, question: string) {
    if (isLoading.value) return;

    // 添加用户消息（含图片）
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: question,
      image: imageBase64,
      timestamp: new Date().toISOString(),
    };
    messages.value.push(userMessage);

    // 添加助手消息（占位）
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      sources: [],
      toolCalls: [],
      mode: 'qa',
    };
    messages.value.push(assistantMessage);
    const assistantIndex = messages.value.length - 1;

    isLoading.value = true;
    error.value = null;

    try {
      const result = await analyzeImage(
        imageBase64,
        question,
        currentSessionId.value || undefined
      );

      // 设置会话ID
      if (result.sessionId && !currentSessionId.value) {
        currentSessionId.value = result.sessionId;
        sessions.value.unshift({
          id: result.sessionId,
          title: question.slice(0, 30),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 2,
        });
      }

      // 填充回答
      messages.value[assistantIndex].content = result.answer || '';
      messages.value[assistantIndex].isStreaming = false;

      // 更新 Token 用量
      if (result.tokenUsage) {
        lastTokenUsage.value = result.tokenUsage;
      }
      if (currentSessionId.value) {
        loadSessionUsage(currentSessionId.value).catch(() => {});
      }

      isLoading.value = false;
    } catch (e) {
      console.error('[ChatStore] 图片理解失败:', e);
      error.value = e instanceof Error ? e.message : String(e);
      messages.value[assistantIndex].isStreaming = false;
      messages.value[assistantIndex].content = `[错误] ${error.value}`;
      isLoading.value = false;
    }
  }

  // 加载文档列表（可按当前知识库 Tab 筛选）
  async function loadDocuments(collectionId?: string | null) {
    try {
      const filter = collectionId || currentCollectionId.value || undefined;
      const res = await getDocuments(filter || undefined);
      documents.value = res.documents;
      totalChunks.value = res.totalChunks;
    } catch (e) {
      console.error('加载文档列表失败:', e);
    }
  }

  // 上传文档（自动关联当前激活的知识库 Tab）
  async function uploadDoc(file: File, collectionId?: string | null) {
    const cid = collectionId ?? currentCollectionId.value;
    const res = await uploadDocument(file, cid || undefined);
    documents.value.unshift(res.document);
    return res;
  }

  // 删除文档
  async function removeDocument(id: string) {
    await apiDeleteDocument(id);
    documents.value = documents.value.filter(d => d.id !== id);
  }

  // 清空当前对话
  function clearMessages() {
    messages.value = [];
    lastTokenUsage.value = null;
    sessionUsage.value = null;
  }

  // ===== 功能5：自定义Agent方法 =====
  async function loadCustomAgents() {
    try {
      const res = await getAgents();
      customAgents.value = res.agents || [];
    } catch (e) {
      console.error('加载自定义Agent失败:', e);
    }
  }

  async function createCustomAgent(data: Partial<CustomAgent>) {
    const agent = await createAgent(data);
    customAgents.value.unshift(agent);
    return agent;
  }

  async function updateCustomAgent(id: string, data: Partial<CustomAgent>) {
    const agent = await updateAgent(id, data);
    const idx = customAgents.value.findIndex(a => a.id === id);
    if (idx >= 0) customAgents.value[idx] = agent;
    return agent;
  }

  async function deleteCustomAgent(id: string) {
    await deleteAgent(id);
    customAgents.value = customAgents.value.filter(a => a.id !== id);
    if (currentAgentId.value === id) currentAgentId.value = null;
  }

  function selectAgent(agentId: string | null) {
    currentAgentId.value = agentId;
  }

  // ===== 功能6：自定义API工具方法 =====
  async function loadCustomTools() {
    try {
      const res = await getCustomTools();
      customTools.value = res.tools || [];
    } catch (e) {
      console.error('加载自定义工具失败:', e);
    }
  }

  async function createCustomToolApi(data: Partial<CustomTool>) {
    const tool = await createCustomTool(data);
    customTools.value.unshift(tool);
    return tool;
  }

  async function updateCustomToolApi(id: string, data: Partial<CustomTool>) {
    const tool = await updateCustomTool(id, data);
    const idx = customTools.value.findIndex(t => t.id === id);
    if (idx >= 0) customTools.value[idx] = tool;
    return tool;
  }

  async function deleteCustomToolApi(id: string) {
    await deleteCustomTool(id);
    customTools.value = customTools.value.filter(t => t.id !== id);
  }

  // ===== 功能8：知识库集合方法 =====
  async function loadCollections() {
    try {
      const res = await getCollections();
      collections.value = res.collections || [];
    } catch (e) {
      console.error('加载知识库集合失败:', e);
    }
  }

  async function createCollection(data: { name: string; description?: string; icon?: string }) {
    const res = await apiCreateCollection(data);
    collections.value.push(res.collection);
    return res.collection;
  }

  async function updateCollection(id: string, data: { name?: string; description?: string; icon?: string }) {
    const res = await updateCollectionApi(id, data);
    const idx = collections.value.findIndex(c => c.id === id);
    if (idx >= 0) collections.value[idx] = res.collection;
    return res.collection;
  }

  async function removeCollection(id: string) {
    await deleteCollectionApi(id);
    collections.value = collections.value.filter(c => c.id !== id);
    if (currentCollectionId.value === id) currentCollectionId.value = null;
    // 同步移除会话关联
    sessionCollectionIds.value = sessionCollectionIds.value.filter(cid => cid !== id);
  }

  function setCurrentCollection(id: string | null) {
    currentCollectionId.value = id;
  }

  // 设置当前会话关联的知识库
  async function setSessionCollections(ids: string[]) {
    sessionCollectionIds.value = ids;
    if (currentSessionId.value) {
      try {
        await updateSessionCollectionsApi(currentSessionId.value, ids);
      } catch (e) {
        console.error('保存会话关联知识库失败:', e);
      }
    }
  }

  // ===== 功能12：工作流方法 =====
  async function loadWorkflows() {
    try {
      const res = await getWorkflows();
      workflows.value = res.workflows || [];
    } catch (e) {
      console.error('加载工作流失败:', e);
    }
  }

  async function saveWorkflow(data: any) {
    if (data.id) {
      const updated = await updateWorkflowApi(data.id, data);
      const idx = workflows.value.findIndex(w => w.id === data.id);
      if (idx >= 0) workflows.value[idx] = updated;
      return updated;
    } else {
      const created = await createWorkflow(data);
      workflows.value.unshift(created);
      return created;
    }
  }

  async function removeWorkflow(id: string) {
    await deleteWorkflowApi(id);
    workflows.value = workflows.value.filter(w => w.id !== id);
  }

  async function runWorkflow(id: string, inputVariables: Record<string, any> = {}) {
    return await executeWorkflowApi(id, inputVariables);
  }

  // ===== 功能15：数据库连接方法 =====
  async function loadDBConnections() {
    try {
      const res = await getDBConnections();
      dbConnections.value = res.connections || [];
    } catch (e) {
      console.error('加载数据库连接失败:', e);
    }
  }

  async function saveDBConnection(data: any) {
    if (data.id) {
      const updated = await updateDBConnectionApi(data.id, data);
      const idx = dbConnections.value.findIndex(c => c.id === data.id);
      if (idx >= 0) dbConnections.value[idx] = updated;
      return updated;
    } else {
      const created = await createDBConnection(data);
      dbConnections.value.unshift(created);
      return created;
    }
  }

  async function removeDBConnection(id: string) {
    await deleteDBConnectionApi(id);
    dbConnections.value = dbConnections.value.filter(c => c.id !== id);
  }

  async function testDBConnection(id: string) {
    return await testDBConnectionApi(id);
  }

  async function getDBSchema(id: string) {
    return await getDBSchemaApi(id);
  }

  async function queryDB(id: string, body: { question?: string; sql?: string }) {
    return await queryDBApi(id, body);
  }

  // ===== 功能16：Agent 导入/导出 =====
  function exportAgent(agent: any) {
    const data = {
      name: agent.name,
      avatar: agent.avatar,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      tools: agent.tools,
      temperature: agent.temperature,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent.name || 'agent'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function importAgent(jsonStr: string) {
    try {
      const data = JSON.parse(jsonStr);
      const agent = await createCustomAgent(data);
      return { success: true, agent };
    } catch (e: any) {
      return { success: false, error: e?.message || '导入失败' };
    }
  }

  // ===== 功能17：对话分享 =====
  async function createShare(data: { sessionId: string; password?: string; expiresInHours?: number }) {
    return await createShareApi(data);
  }

  async function revokeShare(shareId: string) {
    await revokeShareApi(shareId);
  }

  // ===== 功能18：数据导入 =====
  async function importConversations(source: 'chatgpt' | 'claude', file: File) {
    const result = await importConversationsApi(source, file);
    await loadSessions();
    return result;
  }

  // ===== 功能20：API Key =====
  async function loadApiKeys() {
    try {
      const res = await getApiKeysApi();
      apiKeys.value = res.keys || [];
    } catch (e) {
      console.error('加载 API Key 失败:', e);
    }
  }

  async function createApiKey(name: string) {
    const key = await createApiKeyApi(name);
    await loadApiKeys();
    return key;
  }

  async function removeApiKey(id: string) {
    await deleteApiKeyApi(id);
    apiKeys.value = apiKeys.value.filter(k => k.id !== id);
  }
  
  // 加载会话用量统计
  async function loadSessionUsage(sessionId: string) {
    try {
      const usage = await getSessionUsage(sessionId);
      sessionUsage.value = usage;
    } catch (e) {
      console.error('加载会话用量统计失败:', e);
    }
  }

  return {
    // 状态
    sessions,
    currentSessionId,
    messages,
    documents,
    totalChunks,
    isLoading,
    error,
    mode,
    enableThinking,
    currentModel,
    availableModels,
    isSwitchingModel,
    // 功能10
    providers,
    modelGroups,
    ollamaAvailable,
    isRefreshingOllama,
    // 用户级模型配置（登录后按用户 API Key 的厂商收窄）
    userProvider,
    isRefreshingModels,
    // 功能11
    compareMode,
    compareResults,
    compareRunning,
    skills,
    activeSkill,
    isSwitchingSkill,
    lastTokenUsage,
    sessionUsage,
    // 功能1
    currentBranchId,
    branches,
    // 功能2
    modelParams,
    // 功能3
    folders,
    activeFolderFilter,
    activeTagFilter,
    // 功能5
    customAgents,
    currentAgentId,
    // 功能6
    customTools,
    // 功能8
    collections,
    currentCollectionId,
    sessionCollectionIds,
    // 功能13 语音
    voiceInputEnabled,
    autoSpeakEnabled,
    // 功能12 工作流
    workflows,
    // 功能15 数据库连接
    dbConnections,
    // 功能20 API Key
    apiKeys,
    // 计算属性
    currentSession,
    filteredSessions,
    allTags,
    // 方法
    loadModelInfo,
    switchModel,
    refreshOllama,
    applyUserScopedModels,
    refreshUserProviderModels,
    addUserCustomModel,
    removeUserCustomModel,
    setCompareMode,
    startCompare,
    stopCompare,
    adoptCompareResult,
    loadSkills,
    switchSkill,
    setMode,
    loadSessions,
    loadFolders,
    createFolder,
    renameFolder,
    removeFolder,
    moveToFolder,
    renameSession,
    togglePin,
    updateTags,
    newSession,
    switchSession,
    switchBranch,
    loadBranches,
    editMessage,
    respondApproval,
    // respondPlan 之前只定义、没导出：ChatArea 调 chatStore.respondPlan 恒为 undefined，
    // 「Plan 前置确认」点确认/取消都会抛 TypeError（与 MessageItem 里 message.id 是同一处流程的两个坑）
    respondPlan,
    stopGeneration,
    regenerate,
    removeSession,
    sendMessage,
    sendImageMessage,
    loadDocuments,
    uploadDoc,
    removeDocument,
    clearMessages,
    loadSessionUsage,
    // 功能5方法
    loadCustomAgents,
    createCustomAgent,
    updateCustomAgent,
    deleteCustomAgent,
    selectAgent,
    // 功能6方法
    loadCustomTools,
    createCustomToolApi,
    updateCustomToolApi,
    deleteCustomToolApi,
    // 功能8方法
    loadCollections,
    createCollection,
    updateCollection,
    removeCollection,
    setCurrentCollection,
    setSessionCollections,
    // 功能13 语音方法
    toggleVoiceInput,
    toggleAutoSpeak,
    // 功能12 工作流方法
    loadWorkflows,
    saveWorkflow,
    removeWorkflow,
    runWorkflow,
    // 功能15 数据库连接方法
    loadDBConnections,
    saveDBConnection,
    removeDBConnection,
    testDBConnection,
    getDBSchema,
    queryDB,
    // 功能16 Agent 导入导出
    exportAgent,
    importAgent,
    // 功能17 分享
    createShare,
    revokeShare,
    // 功能18 导入
    importConversations,
    // 功能20 API Key
    loadApiKeys,
    createApiKey,
    removeApiKey,
  };
});
