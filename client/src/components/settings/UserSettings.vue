<template>
  <el-dialog
    v-model="visible"
    title="设置"
    width="640px"
    :close-on-click-modal="false"
    class="settings-dialog"
  >
    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- 基本资料 -->
      <el-tab-pane label="基本资料" name="profile">
        <div class="settings-section">
          <div class="form-item">
            <label>昵称</label>
            <el-input v-model="profile.nickname" placeholder="请输入昵称" />
          </div>
          <div class="form-item">
            <label>角色/职位</label>
            <el-input v-model="profile.role" placeholder="请输入角色或职位" />
          </div>
          <div class="form-item">
            <label>头像</label>
            <div class="avatar-upload">
              <div class="avatar-preview" v-if="profile.avatar">
                <img :src="profile.avatar" alt="头像" />
              </div>
              <div class="avatar-placeholder" v-else>
                <el-icon :size="32"><User /></el-icon>
              </div>
              <el-input v-model="profile.avatar" placeholder="输入头像URL（可选）" style="flex:1" />
            </div>
          </div>
          <el-button type="primary" @click="saveProfile" :loading="saving">保存资料</el-button>
        </div>
      </el-tab-pane>

      <!-- 偏好设置 -->
      <el-tab-pane label="偏好设置" name="preferences">
        <div class="settings-section">
          <div class="form-item">
            <label>主题</label>
            <el-radio-group v-model="preferences.theme">
              <el-radio-button value="light">浅色</el-radio-button>
              <el-radio-button value="dark">深色</el-radio-button>
            </el-radio-group>
          </div>
          <div class="form-item">
            <label>默认模型</label>
            <el-select v-model="preferences.defaultModel" style="width: 100%">
              <el-option v-for="m in models" :key="m" :label="m" :value="m" />
            </el-select>
          </div>
          <div class="form-item">
            <label>默认模式</label>
            <el-radio-group v-model="preferences.defaultMode">
              <el-radio-button value="qa">问答</el-radio-button>
              <el-radio-button value="agent">Agent</el-radio-button>
              <el-radio-button value="plan">Plan</el-radio-button>
              <el-radio-button value="multi">多Agent</el-radio-button>
            </el-radio-group>
          </div>
          <div class="form-item">
            <label>语音输入</label>
            <el-switch v-model="preferences.voiceEnabled" active-text="开启" inactive-text="关闭" />
          </div>
          <div class="form-item">
            <label>语音朗读回答</label>
            <el-switch v-model="preferences.ttsEnabled" active-text="开启" inactive-text="关闭" />
          </div>
          <el-button type="primary" @click="savePreferences" :loading="saving">保存偏好</el-button>
        </div>
      </el-tab-pane>

      <!-- API Key 管理 -->
      <el-tab-pane label="API Key" name="apikeys">
        <div class="settings-section">
          <div class="api-key-form">
            <el-select v-model="newKey.provider" placeholder="选择厂商" style="width: 140px">
              <el-option label="阿里云百炼" value="dashscope" />
              <el-option label="OpenAI" value="openai" />
              <el-option label="DeepSeek" value="deepseek" />
              <el-option label="Ollama(本地)" value="ollama" />
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
                <span class="key-prefix">{{ key.keyPrefix }}</span>
              </div>
              <el-button type="danger" size="small" text @click="removeKey(key.id)">删除</el-button>
            </div>
          </div>
          <el-empty v-else description="暂无API Key" :image-size="60" />
        </div>
      </el-tab-pane>

      <!-- 数据管理 -->
      <el-tab-pane label="数据管理" name="data">
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
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { User, Download } from '@element-plus/icons-vue';
import axios from 'axios';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'saved'): void }>();

const visible = ref(props.modelValue);
watch(() => props.modelValue, v => visible.value = v);
watch(visible, v => emit('update:modelValue', v));

const activeTab = ref('profile');
const saving = ref(false);
const exporting = ref(false);
const importing = ref(false);

const profile = reactive({ nickname: '', role: '', avatar: '' });
const preferences = reactive({
  theme: 'dark',
  defaultModel: 'qwen3.8-flash',
  defaultMode: 'agent',
  voiceEnabled: true,
  ttsEnabled: false,
  temperature: 0.7,
  topP: 1.0,
  maxTokens: 2048
});
const apiKeys = ref<any[]>([]);
const newKey = reactive({ provider: 'dashscope', name: '', key: '' });
const fileInput = ref<HTMLInputElement>();
const importFile = ref<File | null>(null);
const importFileName = ref('');

const models = [
  'qwen3.8-flash', 'qwen3.7-flash', 'qwen3.8-27b', 'qwen3.8-max',
  'kimi-k3', 'kimi-k2.7-code', 'deepseek-v4-flash-0731', 'glm-5.2'
];

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function providerName(p: string) {
  const map: any = { dashscope: '阿里云百炼', openai: 'OpenAI', deepseek: 'DeepSeek', ollama: 'Ollama' };
  return map[p] || p;
}

async function loadSettings() {
  try {
    const res = await axios.get(`${API_BASE}/api/user/settings`);
    Object.assign(profile, res.data.profile);
    Object.assign(preferences, res.data.preferences);
    apiKeys.value = res.data.llmKeys || [];
  } catch (e) {
    console.error('加载设置失败', e);
  }
}

async function saveProfile() {
  saving.value = true;
  try {
    await axios.put(`${API_BASE}/api/user/settings/profile`, profile);
    ElMessage.success('资料已保存');
    emit('saved');
  } catch {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
}

async function savePreferences() {
  saving.value = true;
  try {
    await axios.put(`${API_BASE}/api/user/settings/preferences`, preferences);
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
  saving.value = true;
  try {
    await axios.post(`${API_BASE}/api/user/settings/api-keys`, newKey);
    ElMessage.success('API Key已添加');
    newKey.name = '';
    newKey.key = '';
    await loadSettings();
  } catch {
    ElMessage.error('添加失败');
  } finally {
    saving.value = false;
  }
}

async function removeKey(id: string) {
  try {
    await ElMessageBox.confirm('确定删除这个API Key吗？', '确认', { type: 'warning' });
    await axios.delete(`${API_BASE}/api/user/settings/api-keys/${id}`);
    ElMessage.success('已删除');
    await loadSettings();
  } catch { /* cancelled */ }
}

async function exportData() {
  exporting.value = true;
  try {
    const res = await axios.get(`${API_BASE}/api/user/export`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
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
    const res = await axios.post(`${API_BASE}/api/user/import`, data);
    ElMessage.success(`导入完成，共导入 ${res.data.imported} 条记录`);
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
.settings-dialog :deep(.el-dialog__body) {
  padding-top: 0;
}

.settings-tabs :deep(.el-tab-pane) {
  padding-top: 16px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.avatar-upload {
  display: flex;
  gap: 12px;
  align-items: center;
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
  gap: 12px;
  align-items: center;
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
