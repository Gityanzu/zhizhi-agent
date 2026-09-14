import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { ChatMessage, SessionInfo, DocumentInfo, Folder, BranchInfo, ModelParams, CustomAgent, CustomTool, Collection, Provider, ProviderGroup, CompareResult, ModelInfo, SkillInfo } from '@/types';
import {
  sendMessage as apiSendMessage,
  sendMessageStream,
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
    for (const s of sessions.value) {
      for (const t of (s.tags || [])) set.add(t);
    }
    return Array.from(set);
  });

  // 生成唯一ID
  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 加载模型信息
  async function loadModelInfo() {
    try {
      const [current, available, prov] = await Promise.all([
        getCurrentModel(),
        getAvailableModels(),
        apiGetProviders().catch(() => ({ providers: [], ollamaAvailable: false })),
      ]);
      currentModel.value = current.model;
      availableModels.value = available.models;
      modelGroups.value = available.groups || [];
      providers.value = prov.providers || [];
      ollamaAvailable.value = !!prov.ollamaAvailable;
    } catch (e) {
      console.error('加载模型信息失败:', e);
    }
  }

  // 切换模型
  async function switchModel(modelId: string, providerId?: string) {
    if (isSwitchingModel.value) return;
    isSwitchingModel.value = true;
    try {
      const result = await apiSwitchModel(modelId, providerId);
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
      skills.value = result.skills;
      activeSkill.value = result.skills.find((s: SkillInfo) => s.isActive) || result.skills[result.skills.length - 1];
    } catch (e) {
      console.error('加载Skill列表失败:', e);
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
    try {
      sessions.value = await getSessions(activeFolderFilter.value, activeTagFilter.value || undefined);
    } catch (e) {
      console.error('加载会话列表失败:', e);
    }
  }

  // 加载文件夹列表
  async function loadFolders() {
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
    } catch (e) {
      console.error('加载会话历史失败:', e);
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
      await sendMessageStream(
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
            case 'tool_call':
              if (chunk.toolCall) {
                msg.toolCalls?.push({
                  name: chunk.toolCall.name,
                  arguments: chunk.toolCall.arguments,
                  result: undefined,
                });
              }
              break;
            case 'tool_result':
              const toolCalls = msg.toolCalls;
              const lastToolCall = toolCalls?.[toolCalls.length - 1];
              if (lastToolCall) {
                lastToolCall.result = chunk.content;
              }
              break;
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
            case 'done':
              msg.isStreaming = false;
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

      await sendMessageStream(
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

            case 'tool_call':
              if (chunk.toolCall) {
                msg.toolCalls?.push({
                  name: chunk.toolCall.name,
                  arguments: chunk.toolCall.arguments,
                  result: undefined,
                });
              }
              break;

            case 'tool_result':
              const toolCalls = msg.toolCalls;
              const lastToolCall = toolCalls?.[toolCalls.length - 1];
              if (lastToolCall) {
                lastToolCall.result = chunk.content;
              }
              break;

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

            case 'done':
              msg.isStreaming = false;
              // 处理 done 事件中的额外数据
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
              msg.isStreaming = false;
              msg.content += `\n\n[错误] ${chunk.content}`;
              error.value = chunk.content;
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
    togglePin,
    updateTags,
    newSession,
    switchSession,
    switchBranch,
    loadBranches,
    editMessage,
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
