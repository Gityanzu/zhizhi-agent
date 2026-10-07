<template>
  <div class="server-connection">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="选择桌面端连接哪个后端"
      description="本地模式由桌面端自带后端与数据（数据不出本机）；远程模式把界面里的全部接口请求指向你的服务器（如云端部署的 Web 后端地址），适合多端共享同一份账号与会话。"
      class="tip-alert"
    />

    <el-form label-position="top" class="conn-form">
      <el-form-item label="连接模式">
        <el-radio-group v-model="form.mode">
          <el-radio value="local">本地内嵌后端</el-radio>
          <el-radio value="remote">远程服务器</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="form.mode === 'remote'" label="服务器地址">
        <div class="url-row">
          <el-input
            v-model="form.url"
            placeholder="https://ai.example.com（不需要端口与路径，留空即默认本机 3001）"
            clearable
          />
          <el-button :loading="testing" @click="onTest">测试连接</el-button>
        </div>
        <div v-if="testResult" class="test-result" :class="testResult.ok ? 'ok' : 'fail'">
          <template v-if="testResult.ok">
            ✓ 连接成功（{{ testResult.latencyMs ?? '-' }}ms，/api/health 返回 {{ testResult.status }}）
          </template>
          <template v-else>✗ 连接失败：{{ testResult.error }}</template>
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">保存并切换</el-button>
        <span class="save-hint">保存后接口即刻指向新后端，无需重启应用</span>
      </el-form-item>
    </el-form>

    <el-descriptions :column="1" border size="small" class="status-desc">
      <el-descriptions-item label="当前模式">
        <el-tag :type="serverConfig?.mode === 'remote' ? 'warning' : 'success'" size="small">
          {{ serverConfig?.mode === 'remote' ? '远程服务器' : '本地内嵌' }}
        </el-tag>
        <span v-if="serverConfig?.mode === 'remote'" class="current-url">{{ serverConfig.url }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="后端状态">
        <el-tag :type="statusTagType" size="small">{{ statusLabel }}</el-tag>
        <span class="status-msg">{{ backendStatus?.message || '未知' }}</span>
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
/**
 * ServerConnectionSettings — 桌面端「服务器连接」设置
 *
 * 只在桌面端渲染（SettingsView 里按 isDesktop 控制）。
 * 配置经 IPC 存到 userData/server-config.json，由主进程 hostServer 反代消费；
 * 渲染层始终走同源 /api，这里不碰 axios baseURL，Web 端零影响。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useDesktop } from '@/composables/useDesktop';
import type { DesktopServerMode, DesktopServerTestResult } from '@/types/desktop';

const { isDesktop, serverConfig, backendStatus, saveServerConfig, testServer } = useDesktop();

const form = reactive<{ mode: DesktopServerMode; url: string }>({ mode: 'local', url: '' });
const saving = ref(false);
const testing = ref(false);
const testResult = ref<DesktopServerTestResult | null>(null);

// 主进程配置异步到达后回填表单
watch(
  serverConfig,
  (cfg) => {
    if (cfg) {
      form.mode = cfg.mode;
      form.url = cfg.url;
    }
  },
  { immediate: true }
);

// 改地址后旧的测试结果不再有意义
watch(() => form.url, () => (testResult.value = null));

const statusLabel = computed(() => {
  const s = backendStatus.value?.status;
  const map: Record<string, string> = {
    idle: '未启动',
    starting: '启动中',
    ok: '本地就绪',
    error: '异常',
    stopped: '已停止',
    unavailable: '不可用',
    remote: '远程就绪',
    'remote-error': '远程不可达',
  };
  return map[s || 'idle'] || s || '未知';
});

const statusTagType = computed(() => {
  const s = backendStatus.value?.status;
  if (s === 'ok' || s === 'remote') return 'success';
  if (s === 'starting') return 'warning';
  if (s === 'error' || s === 'remote-error' || s === 'unavailable') return 'danger';
  return 'info';
});

async function onTest() {
  if (!form.url.trim()) {
    ElMessage.warning('请先填写服务器地址');
    return;
  }
  testing.value = true;
  try {
    testResult.value = await testServer(form.url.trim());
  } finally {
    testing.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    const res = await saveServerConfig({ mode: form.mode, url: form.url.trim() });
    if (res) {
      ElMessage.success(
        form.mode === 'remote' ? '已切换到远程服务器' : '已切换到本地内嵌后端'
      );
    }
  } finally {
    saving.value = false;
  }
}

// Web 端不应出现这个面板；兜底隐藏，避免被误挂到通用路由
if (!isDesktop) {
  console.warn('[ServerConnectionSettings] 非桌面端环境，该设置仅桌面端可用');
}
</script>

<style scoped>
.server-connection {
  max-width: 680px;
  padding: 8px 4px;
}

.tip-alert {
  margin-bottom: 20px;
}

.conn-form {
  margin-bottom: 8px;
}

.url-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.test-result {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.test-result.ok {
  color: var(--el-color-success);
}

.test-result.fail {
  color: var(--el-color-danger);
}

.save-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.status-desc {
  margin-top: 16px;
}

.current-url {
  margin-left: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.status-msg {
  margin-left: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
