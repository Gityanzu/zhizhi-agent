<template>
  <el-dialog
    v-model="visible"
    width="820px"
    :close-on-click-modal="false"
    class="settings-dialog"
  >
    <template #header>
      <div class="settings-dialog-head">
        <div class="sd-badge"><el-icon :size="18"><Setting /></el-icon></div>
        <div class="sd-titles">
          <div class="sd-title">设置</div>
          <div class="sd-sub">管理账户资料、使用偏好与模型密钥</div>
        </div>
      </div>
    </template>

    <div class="settings-layout">
      <!-- 左侧导航 -->
      <aside class="settings-nav">
        <button
          v-for="nav in settingsNav"
          :key="nav.key"
          class="settings-nav-item"
          :class="{ active: activeTab === nav.key }"
          @click="activeTab = nav.key"
        >
          <el-icon :size="16"><component :is="nav.icon" /></el-icon>
          <span>{{ nav.label }}</span>
        </button>
      </aside>

      <!-- 右侧内容 -->
      <div class="settings-body">
      <!-- 基本资料 -->
      <section v-show="activeTab === 'profile'" class="settings-page">
        <div class="settings-section">
          <!-- 身份卡：头像 + 用户名一目了然 -->
          <div class="identity-card">
            <el-tooltip :content="profile.avatar ? '点击更换头像' : '点击上传头像'" placement="top">
              <div
                class="avatar-preview avatar-clickable"
                :class="{ uploading: uploadingAvatar }"
                v-loading="uploadingAvatar"
                @click="avatarInputRef?.click()"
              >
                <img v-if="profile.avatar" :src="profile.avatar" alt="头像" />
                <el-icon v-else :size="30"><User /></el-icon>
              </div>
            </el-tooltip>
            <div class="identity-meta">
              <div class="identity-name">{{ profile.nickname || '未设置昵称' }}</div>
              <div class="identity-sub">@{{ authStore.user?.username || '—' }}</div>
            </div>
            <div class="identity-ops">
              <input
                ref="avatarInputRef"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style="display: none"
                @change="onAvatarFileChange"
              />
              <el-button size="small" :icon="User" round :loading="uploadingAvatar" @click="avatarInputRef?.click()">更换头像</el-button>
              <el-button v-if="profile.avatar" size="small" round text type="danger" @click="handleRemoveAvatar">清除</el-button>
              <div class="avatar-hint">jpg/png/webp/gif · ≤5MB</div>
            </div>
          </div>

          <div class="form-grid">
            <div class="form-item">
              <label>昵称</label>
              <el-input v-model="profile.nickname" placeholder="请输入昵称" maxlength="50" />
            </div>
            <div class="form-item">
              <label>邮箱</label>
              <el-input v-model="profile.email" placeholder="用于找回密码与通知" />
            </div>
          </div>
          <div class="form-item">
            <label>个人简介</label>
            <el-input
              v-model="profile.bio"
              type="textarea"
              :rows="2"
              placeholder="介绍一下自己（不超过 200 字）"
              maxlength="200"
              show-word-limit
            />
          </div>
          <div class="form-item">
            <label>角色/职位</label>
            <el-input v-model="profile.role" placeholder="请输入角色或职位" />
          </div>
          <div class="save-row">
            <el-button type="primary" round @click="saveProfile" :loading="saving">保存资料</el-button>
          </div>
        </div>
      </section>

      <!-- 偏好设置 -->
      <section v-show="activeTab === 'preferences'" class="settings-page">
        <div class="settings-section">
          <div class="pref-row">
            <div class="pref-label">
              <span class="pref-name">主题</span>
              <span class="pref-desc">界面配色，深浅两套</span>
            </div>
            <el-radio-group v-model="preferences.theme">
              <el-radio-button value="light">浅色</el-radio-button>
              <el-radio-button value="dark">深色</el-radio-button>
            </el-radio-group>
          </div>
          <div class="pref-row">
            <div class="pref-label">
              <span class="pref-name">默认模型</span>
              <span class="pref-desc">新会话使用的模型</span>
            </div>
            <el-select v-model="preferences.defaultModel" style="width: 220px">
              <el-option v-for="m in models" :key="m" :label="m" :value="m" />
            </el-select>
          </div>
          <div class="pref-row">
            <div class="pref-label">
              <span class="pref-name">默认模式</span>
              <span class="pref-desc">新会话的起始任务模式</span>
            </div>
            <el-radio-group v-model="preferences.defaultMode">
              <el-radio-button value="qa">问答</el-radio-button>
              <el-radio-button value="agent">Agent</el-radio-button>
              <el-radio-button value="plan">Plan</el-radio-button>
              <el-radio-button value="multi">多Agent</el-radio-button>
            </el-radio-group>
          </div>
          <div class="pref-row">
            <div class="pref-label">
              <span class="pref-name">语音输入</span>
              <span class="pref-desc">在输入框使用麦克风语音转文字</span>
            </div>
            <el-switch v-model="preferences.voiceEnabled" />
          </div>
          <div class="pref-row">
            <div class="pref-label">
              <span class="pref-name">语音朗读回答</span>
              <span class="pref-desc">收到 AI 回答后自动朗读</span>
            </div>
            <el-switch v-model="preferences.ttsEnabled" />
          </div>
          <div class="pref-row" v-if="isDesktop">
            <div class="pref-label">
              <span class="pref-name">默认输出目录</span>
              <span class="pref-desc">Agent 生成文件的默认落点；读写本机文件时会弹窗确认</span>
            </div>
            <div style="display:flex; gap:8px; align-items:center; width:260px">
              <el-input v-model="preferences.agentOutputDir" placeholder="留空使用默认目录" size="small" />
              <el-button size="small" @click="chooseOutputDir">选择</el-button>
            </div>
          </div>
          <div class="pref-row">
            <div class="pref-label">
              <span class="pref-name">Agent 权限</span>
              <span class="pref-desc">「允许全部权限」后读写本机文件、执行命令不再逐次确认（敏感文件仍拒绝）；仅对当前账号生效，切换即时保存</span>
            </div>
            <PermissionModeSelect />
          </div>
          <div class="save-row">
            <el-button type="primary" round @click="savePreferences" :loading="saving">保存偏好</el-button>
          </div>
        </div>
      </section>

      <!-- API Key 管理 -->
      <section v-show="activeTab === 'apikeys'" class="settings-page">
        <div class="settings-section">
          <!-- 未登录提示 -->
          <div v-if="!authStore.isAuthenticated" class="login-prompt">
            <el-icon :size="32" color="#e6a23c"><Warning /></el-icon>
            <p>请先登录后配置个人 API Key</p>
            <el-button type="primary" @click="goToLogin">去登录</el-button>
          </div>

          <!-- 已登录：API Key 管理 -->
          <template v-else>
            <!-- 当前生效的模型来源：登录后即回显用户自己配置的厂商 -->
            <div v-if="activeInfo?.configured" class="active-provider">
              <el-icon><Cpu /></el-icon>
              <span>当前使用：<b>{{ activeInfo.providerName }}</b></span>
              <span class="active-provider-prefix">{{ activeInfo.keyPrefix }}</span>
              <span v-if="activeInfo.matched !== false" class="active-provider-models">
                可用模型 {{ activeInfo.models?.length || 0 }} 个
              </span>
            </div>
            <!-- Key 没能生效时必须显式提示：静默回退会让人误以为配置已生效 -->
            <div v-if="activeInfo?.warning" class="active-provider warn">
              <el-icon><Warning /></el-icon>
              <span>{{ activeInfo.warning }}</span>
            </div>
            <div v-if="!activeInfo?.configured" class="active-provider muted">
              <el-icon><Warning /></el-icon>
              <span>尚未配置 API Key，当前使用系统默认模型</span>
            </div>

            <div class="api-key-form">
              <el-select v-model="newKey.provider" placeholder="选择厂商" style="width: 140px">
                <el-option
                  v-for="p in providerOptions"
                  :key="p.id"
                  :label="p.requiresKey ? p.name : `${p.name}(本地)`"
                  :value="p.id"
                />
              </el-select>
              <el-input v-model="newKey.name" placeholder="名称（如：工作Key）" style="width: 140px" />
              <el-input v-model="newKey.key" placeholder="API Key" type="password" show-password style="flex:1" />
              <el-button type="primary" @click="addKey" :loading="saving">添加</el-button>
            </div>
            <div class="api-key-list" v-if="apiKeys.length > 0">
              <div v-for="key in apiKeys" :key="key.id" class="api-key-item">
                <div class="key-info">
                  <span class="key-provider">{{ providerName(key.provider) }}</span>
                  <span class="key-name">{{ key.name }}</span>
                  <span class="key-prefix">{{ key.key_prefix }}</span>
                  <el-tag v-if="key.is_default" type="success" size="small">默认</el-tag>
                </div>
                <div class="key-actions">
                  <el-button v-if="!key.is_default" type="primary" size="small" text @click="setDefault(key.id)">设为默认</el-button>
                  <el-button type="danger" size="small" text @click="removeKey(key.id)">删除</el-button>
                </div>
              </div>
            </div>
            <el-empty v-else description="暂无API Key，添加后将优先使用您的个人Key" :image-size="60" />
          </template>
        </div>
      </section>

      <!-- 数据管理 -->
      <section v-show="activeTab === 'data'" class="settings-page">
        <div class="settings-section">
          <div class="data-card">
            <div class="data-info">
              <h4>导出数据</h4>
              <p>导出所有对话、设置、知识库等数据为JSON文件，用于备份或迁移。</p>
            </div>
            <el-button type="primary" @click="exportData" :loading="exporting">
              <el-icon><Download /></el-icon> 导出备份
            </el-button>
          </div>
          <div class="data-card">
            <div class="data-info">
              <h4>导入数据</h4>
              <p>从之前导出的JSON文件恢复数据。注意：不会覆盖现有数据，仅追加。</p>
            </div>
            <div>
              <input type="file" ref="fileInput" accept=".json" @change="handleFile" style="display:none" />
              <el-button @click="fileInput?.click()">选择文件</el-button>
              <span v-if="importFileName" class="file-name">{{ importFileName }}</span>
              <el-button type="success" @click="importData" :loading="importing" :disabled="!importFile" style="margin-left:8px">
                开始导入
              </el-button>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { User, Download, Warning, Cpu, Setting, Key } from '@element-plus/icons-vue';
import { useAuthStore } from '../../stores/auth';
import { uploadAvatar, removeAvatar as removeAvatarApi, updateProfile as authUpdateProfile } from '../../api/auth';
import { getUserApiKeys, addUserApiKey, deleteUserApiKey, setDefaultApiKey, getActiveApiKey, getProviderOptions } from '../../api/userApiKey';
import { getUserSettings, updateUserProfile, updateUserPreferences, deleteUserSettingsApiKey, exportUserData, importUserData } from '../../api/userSettings';
import { useChatStore } from '../../stores/chat';
import { usePermissionStore } from '../../stores/permission';
import { useDesktop } from '../../composables/useDesktop';
import PermissionModeSelect from '../chat/PermissionModeSelect.vue';

const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const chatStore = useChatStore();
const { isDesktop, pickDirectory } = useDesktop();

const props = withDefaults(defineProps<{
  defaultTab?: string
}>(), {
  defaultTab: 'profile'
});
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const activeTab = ref(props.defaultTab || 'profile');
const visible = ref(true);

// 设置弹窗左侧导航
const settingsNav = [
  { key: 'profile', label: '基本资料', icon: User },
  { key: 'preferences', label: '偏好设置', icon: Setting },
  { key: 'apikeys', label: 'API Key', icon: Key },
  { key: 'data', label: '数据管理', icon: Download },
];
const saving = ref(false);
const exporting = ref(false);
const importing = ref(false);

const profile = reactive({ nickname: '', role: '', avatar: '', email: '', bio: '' });
const uploadingAvatar = ref(false);
const avatarInputRef = ref<HTMLInputElement>();
const preferences = reactive({
  theme: 'dark',
  defaultModel: 'qwen3.8-flash',
  defaultMode: 'agent',
  voiceEnabled: true,
  ttsEnabled: false,
  temperature: 0.7,
  topP: 1.0,
  maxTokens: 2048,
  agentOutputDir: ''
  // 注意：权限模式（sandbox / full）不在此对象内 —— 它由 PermissionModeSelect
  // 经由 usePermissionStore + PUT /api/user/settings/permission-mode 单独管理，
  // 既不在 preferences 里渲染，也不随整包偏好写回（避免顺带授权）。
});
const apiKeys = ref<any[]>([]);
// 当前生效的模型来源（后端按用户维度返回：厂商 + Key 前缀 + 该厂商模型列表）
const activeInfo = ref<any>(null);
// 后端支持的厂商：下拉据此渲染，不再前端写死（此前写死的 openai 后端并不支持）
const providerOptions = ref<any[]>([]);
const newKey = reactive({ provider: '', name: '', key: '' });
const fileInput = ref<HTMLInputElement>();
const importFile = ref<File | null>(null);
const importFileName = ref('');

const models = [
  'qwen3.8-flash', 'qwen3.7-flash', 'qwen3.8-27b', 'qwen3.8-max',
  'kimi-k3', 'kimi-k2.7-code', 'deepseek-v4-flash-0731', 'glm-5.2'
];

// 后端 /api/user-api-keys/providers 挂掉或返回空时的兜底厂商，
// 与 server/src/services/llmProvider.ts 里的 getConfigurableProviders() 保持一致。
const DEFAULT_PROVIDER_OPTIONS = [
  { id: 'bailian', name: '阿里云百炼', type: 'openai_compatible', baseUrl: '', requiresKey: true, modelCount: 0 },
  { id: 'deepseek', name: 'DeepSeek', type: 'openai_compatible', baseUrl: 'https://api.deepseek.com/v1', requiresKey: true, modelCount: 0 },
  { id: 'ollama', name: 'Ollama 本地', type: 'ollama', baseUrl: 'http://localhost:11434/v1', requiresKey: false, modelCount: 0 },
];

function providerName(p: string) {
  // 旧数据存的是界面别名（dashscope），新数据存归一化后的 id（bailian），两者都要能显示
  const aliasMap: any = { dashscope: 'bailian', aliyun: 'bailian' };
  const id = aliasMap[p] || p;
  const hit = providerOptions.value.find((o: any) => o.id === id);
  if (hit) return hit.name;
  const fallback: any = { bailian: '阿里云百炼', deepseek: 'DeepSeek', ollama: 'Ollama' };
  return fallback[id] || p;
}

// 桌面端：通过原生目录选择器设定 Agent 默认输出目录
async function chooseOutputDir() {
  const dir = await pickDirectory({ title: '选择默认输出目录', defaultPath: preferences.agentOutputDir || undefined });
  if (dir) preferences.agentOutputDir = dir;
}

async function loadSettings() {
  try {
    // 打开设置时强制刷新登录身份（users 表），避免读到陈旧的 authStore 缓存
    // 导致「设置页显示的昵称与侧边栏/数据库对不上」
    if (authStore.token) {
      await authStore.fetchCurrentUser();
    }
    const data = await getUserSettings();
    // 身份字段（昵称/邮箱/简介/头像）以 users 表（authStore）为准；
    // role 是旧单例 profile 的展示字段，继续从 user_settings 读
    const authUser = authStore.user;
    if (authUser) {
      profile.nickname = authUser.nickname || authUser.username || '';
      profile.email = authUser.email || '';
      profile.bio = authUser.bio || '';
      profile.avatar = authUser.avatar || '';
    } else {
      profile.nickname = data.profile?.nickname || '';
      profile.avatar = data.profile?.avatar || '';
    }
    profile.role = data.profile?.role || '';
    Object.assign(preferences, data.preferences);
    // 权限模式交给共享 store（同一个下拉组件在输入框工具栏也有一份），顺手把刚拉到的数据喂给它
    permissionStore.applyFromSettings(data);
    // 旧的单用户API Key（兼容）
    apiKeys.value = data.llmKeys || [];
  } catch (e) {
    console.error('加载设置失败', e);
  }

  // 厂商下拉的选项来自后端，避免出现后端不支持、选了必然失败的选项
  await loadProviderOptions();

  // 加载多用户API Key（如果已登录）
  if (authStore.isAuthenticated) {
    try {
      const res = await getUserApiKeys();
      apiKeys.value = res.data.keys;
    } catch (e) {
      console.error('加载用户API Key失败', e);
    }
  }

  await refreshActiveInfo();
}

/** 加载后端支持的厂商清单（下拉的 value 用后端 provider id） */
async function loadProviderOptions() {
  try {
    const res = await getProviderOptions();
    const list = res.data.providers || [];
    providerOptions.value = list.length ? list : DEFAULT_PROVIDER_OPTIONS;
    if (!newKey.provider) {
      newKey.provider = providerOptions.value[0]?.id || '';
    }
  } catch (e: any) {
    console.error('加载厂商列表失败', e);
    ElMessage.error(e?.response?.data?.error || '加载厂商列表失败，使用默认厂商');
    providerOptions.value = DEFAULT_PROVIDER_OPTIONS;
  }
}

/**
 * 读取"当前生效"的模型配置并同步到聊天区。
 * 新增/删除/切换默认 Key 后都要走一遍：厂商变了，聊天区的模型下拉也得跟着变，
 * 否则用户会看到一个自己根本没有 Key 的模型。
 */
async function refreshActiveInfo() {
  if (!authStore.isAuthenticated) {
    activeInfo.value = null;
    return;
  }
  try {
    const res = await getActiveApiKey();
    activeInfo.value = res.data;
  } catch (e) {
    console.error('读取当前生效的模型配置失败', e);
    activeInfo.value = null;
  }
  try {
    await chatStore.loadModelInfo();
  } catch (e) {
    console.warn('同步模型列表失败', e);
  }
}

function goToLogin() {
  visible.value = false;
  router.push('/login');
}

async function saveProfile() {
  saving.value = true;
  try {
    // 身份字段（昵称/邮箱/简介）只写 users 表；
    // 旧单例 profile 仅保留 role/头像展示字段 —— 昵称双写正是「侧边栏与设置页对不上」的根源
    await authUpdateProfile({
      nickname: profile.nickname,
      email: profile.email || undefined,
      bio: profile.bio || undefined,
    });
    await updateUserProfile({ role: profile.role, avatar: profile.avatar });
    // 刷新 authStore，让侧边栏/顶栏的头像与昵称立即同步
    await authStore.fetchCurrentUser();
    ElMessage.success('资料已保存');
    emit('saved');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}

/* ---------------- 头像上传 ---------------- */

async function onAvatarFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  // 前端预校验（后端同样校验）
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    ElMessage.warning('仅支持 jpg/png/webp/gif 格式');
    (e.target as HTMLInputElement).value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('图片不能超过 5MB');
    (e.target as HTMLInputElement).value = '';
    return;
  }

  uploadingAvatar.value = true;
  try {
    const res = await uploadAvatar(file);
    profile.avatar = res.data.user?.avatar || '';
    await authStore.fetchCurrentUser();
    ElMessage.success('头像已更新');
    emit('saved');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '头像上传失败');
  } finally {
    uploadingAvatar.value = false;
    if (avatarInputRef.value) avatarInputRef.value.value = '';
  }
}

async function handleRemoveAvatar() {
  uploadingAvatar.value = true;
  try {
    await removeAvatarApi();
    profile.avatar = '';
    await authStore.fetchCurrentUser();
    ElMessage.success('头像已清除');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '清除失败');
  } finally {
    uploadingAvatar.value = false;
  }
}

async function savePreferences() {
  saving.value = true;
  try {
    // 权限模式由独立端点管理，这里直接传其余偏好即可（preferences 已不含该字段）
    await updateUserPreferences({ ...preferences });
    ElMessage.success('偏好已保存');
    emit('saved');
  } catch {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
}

async function addKey() {
  if (!newKey.provider || !newKey.name || !newKey.key) {
    ElMessage.warning('请填写完整信息');
    return;
  }
  if (!authStore.isAuthenticated) {
    ElMessage.warning('请先登录');
    return;
  }
  saving.value = true;
  try {
    await addUserApiKey({
      provider: newKey.provider,
      name: newKey.name,
      apiKey: newKey.key,
    });
    ElMessage.success('API Key已添加');
    newKey.name = '';
    newKey.key = '';
    await loadSettings();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || '添加失败');
  } finally {
    saving.value = false;
  }
}

async function setDefault(id: string) {
  try {
    await setDefaultApiKey(id);
    ElMessage.success('已设为默认');
    await loadSettings();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || '操作失败');
  }
}

async function removeKey(id: string) {
  try {
    await ElMessageBox.confirm('确定删除这个API Key吗？', '确认', { type: 'warning' });
    if (authStore.isAuthenticated) {
      await deleteUserApiKey(id);
    } else {
      await deleteUserSettingsApiKey(id);
    }
    ElMessage.success('已删除');
    await loadSettings();
  } catch { /* cancelled */ }
}

async function exportData() {
  exporting.value = true;
  try {
    const blob = await exportUserData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zhizhi-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch {
    ElMessage.error('导出失败');
  } finally {
    exporting.value = false;
  }
}

function handleFile(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    importFile.value = target.files[0];
    importFileName.value = target.files[0].name;
  }
}

async function importData() {
  if (!importFile.value) return;
  importing.value = true;
  try {
    const text = await importFile.value.text();
    const data = JSON.parse(text);
    const result = await importUserData(data);
    ElMessage.success(`导入完成，共导入 ${result.imported} 条记录`);
    importFile.value = null;
    importFileName.value = '';
    if (fileInput.value) fileInput.value.value = '';
  } catch {
    ElMessage.error('导入失败，请检查文件格式');
  } finally {
    importing.value = false;
  }
}

onMounted(() => {
  if (visible.value) loadSettings();
});
watch(visible, v => { if (v) loadSettings(); });
</script>

<style scoped>
/* ==================== 弹窗外壳 ==================== */
.settings-dialog :deep(.el-dialog) {
  border-radius: 16px;
  overflow: hidden;
}
.settings-dialog :deep(.el-dialog__header) {
  padding: 18px 22px 14px;
  margin: 0;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}
.settings-dialog :deep(.el-dialog__body) {
  padding: 0;
}
.settings-dialog-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sd-badge {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-gradient, var(--primary));
  color: #fff;
  flex-shrink: 0;
}
.sd-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}
.sd-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ==================== 左导航 + 右内容 ==================== */
.settings-layout {
  display: flex;
  min-height: 420px;
  max-height: 66vh;
}
.settings-nav {
  width: 168px;
  flex-shrink: 0;
  padding: 12px 10px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.settings-nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.settings-nav-item.active {
  background: var(--primary-light);
  color: var(--primary);
  font-weight: 600;
}
.settings-body {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--bg-secondary);
}
.settings-page {
  padding: 20px 22px;
}

/* ==================== 页面通用 ==================== */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-item label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.save-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px dashed var(--border-color);
}

/* 偏好行：左说明右控件 */
.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
}
.pref-row:last-of-type {
  border-bottom: none;
}
.pref-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.pref-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.pref-desc {
  font-size: 11.5px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ==================== 身份卡 ==================== */
.identity-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-tertiary);
}
.identity-meta {
  flex: 1;
  min-width: 0;
}
.identity-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.identity-sub {
  font-size: 12px;
  color: var(--text-secondary);
}
.identity-ops {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

/* ==================== 旧结构在新区块内的覆盖（后置高优先级选择器） ==================== */
.settings-page .avatar-preview,
.settings-page .avatar-placeholder {
  width: 60px;
  height: 60px;
  border: 2px solid var(--border-color);
  background: var(--bg-secondary);
}
.settings-body .api-key-form {
  padding: 12px;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  margin-bottom: 12px;
}
.settings-body .api-key-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
}
.settings-body .data-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  transition: border-color 0.15s;
}
.settings-body .data-card:hover {
  border-color: var(--primary);
}
.settings-body .login-prompt {
  border: 1px dashed var(--border-color);
  border-radius: 12px;
}

.avatar-upload {
  display: flex;
  gap: 12px;
  align-items: center;
}
.avatar-clickable {
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.avatar-clickable:hover {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}
.avatar-clickable.uploading {
  opacity: 0.7;
  pointer-events: none;
}
.avatar-ops {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
.avatar-hint {
  font-size: 11px;
  color: var(--text-secondary);
}

.avatar-preview,
.avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.login-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 20px;
  text-align: center;
}

.login-prompt p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.api-key-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.api-key-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.api-key-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.key-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.key-actions {
  display: flex;
  gap: 8px;
}

/* 当前生效的模型来源 */
.active-provider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.25);
  font-size: 13px;
  color: var(--text-primary);
}

.active-provider.muted {
  background: rgba(230, 162, 60, 0.08);
  border-color: rgba(230, 162, 60, 0.3);
  color: var(--text-secondary);
}

/* Key 未生效 / 刷新失败：用告警色，并允许换行展示完整原因 */
.active-provider.warn {
  align-items: flex-start;
  background: rgba(245, 108, 108, 0.08);
  border-color: rgba(245, 108, 108, 0.35);
  color: #f56c6c;
  white-space: normal;
  line-height: 1.5;
}

.active-provider-prefix {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.active-provider-models {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-secondary);
}

.key-provider {
  font-weight: 600;
  font-size: 13px;
  color: var(--primary);
}

.key-name {
  font-size: 13px;
  color: var(--text-primary);
}

.key-prefix {
  font-size: 12px;
  color: var(--text-placeholder);
  font-family: monospace;
}

.data-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  gap: 16px;
}

.data-info h4 {
  margin: 0 0 4px;
  font-size: 14px;
  color: var(--text-primary);
}

.data-info p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.file-name {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 8px;
}
</style>
