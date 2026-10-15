<script setup lang="ts">
/**
 * McpView — 连接器（MCP）管理页
 *
 * 管理 Model Context Protocol 服务器连接：
 *  - stdio：本地子进程（桌面端），如 npx @modelcontextprotocol/server-xxx
 *  - http：远程 MCP 端点（Web/桌面均可用）
 * 支持增删改、启停、一键探活。工具桥接进 Agent 的能力在后续版本接入。
 */
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Refresh, Connection, EditPen, Tools } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import {
  getMcpServers, createMcpServer, updateMcpServer, deleteMcpServer, testMcpServer,
  getMcpServerTools, type McpServer, type McpToolInfo,
} from '@/api/mcp'

const router = useRouter()
const servers = ref<McpServer[]>([])
const loading = ref(false)
const testingId = ref('')
const testResult = ref<Record<string, { ok: boolean; message: string }>>({})

const showDialog = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const form = ref({
  name: '',
  transport: 'http' as 'stdio' | 'http',
  url: '',
  headersJson: '',
  command: '',
  argsStr: '',
  envJson: '',
  enabled: true,
})

async function load() {
  loading.value = true
  try {
    servers.value = await getMcpServers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '加载连接器失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  editingId.value = null
  form.value = { name: '', transport: 'http', url: '', headersJson: '', command: '', argsStr: '', envJson: '', enabled: true }
  showDialog.value = true
}

function openEdit(s: McpServer) {
  editingId.value = s.id
  form.value = {
    name: s.name,
    transport: s.transport,
    url: s.url || '',
    headersJson: s.headers ? JSON.stringify(s.headers, null, 2) : '',
    command: s.command || '',
    argsStr: (s.args || []).join(' '),
    envJson: s.env ? JSON.stringify(s.env, null, 2) : '',
    enabled: s.enabled,
  }
  showDialog.value = true
}

function parseJson(text: string): Record<string, string> | undefined {
  if (!text.trim()) return undefined
  const parsed = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('需要 JSON 对象')
  return parsed
}

async function handleSave() {
  const f = form.value
  if (!f.name.trim()) {
    ElMessage.warning('请填写连接器名称')
    return
  }
  let payload: Partial<McpServer> = { name: f.name.trim(), transport: f.transport, enabled: f.enabled }
  try {
    if (f.transport === 'http') {
      if (!f.url.trim()) {
        ElMessage.warning('http 连接器需要填写 URL')
        return
      }
      payload = { ...payload, url: f.url.trim(), headers: parseJson(f.headersJson) }
    } else {
      if (!f.command.trim()) {
        ElMessage.warning('stdio 连接器需要填写启动命令')
        return
      }
      payload = {
        ...payload,
        command: f.command.trim(),
        args: f.argsStr.trim() ? f.argsStr.trim().split(/\s+/) : undefined,
        env: parseJson(f.envJson),
      }
    }
  } catch (e: any) {
    ElMessage.error(`JSON 格式错误：${e.message}`)
    return
  }

  saving.value = true
  try {
    if (editingId.value) {
      await updateMcpServer(editingId.value, payload)
      ElMessage.success('已保存')
    } else {
      await createMcpServer(payload)
      ElMessage.success('已添加')
    }
    showDialog.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleToggle(s: McpServer) {
  try {
    await updateMcpServer(s.id, { enabled: !s.enabled })
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '操作失败')
  }
}

async function handleTest(s: McpServer) {
  testingId.value = s.id
  try {
    const r = await testMcpServer(s.id)
    testResult.value[s.id] = r
    if (r.ok) ElMessage.success(r.message)
    else ElMessage.warning(r.message)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '探活失败')
  } finally {
    testingId.value = ''
  }
}

async function handleDelete(s: McpServer) {
  try {
    await ElMessageBox.confirm(`确定删除连接器「${s.name}」？`, '删除连接器', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteMcpServer(s.id)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}

/* ---------------- 查看连接器工具 ---------------- */
const showTools = ref(false)
const toolsLoading = ref(false)
const toolsServerName = ref('')
const toolList = ref<McpToolInfo[]>([])

async function handleViewTools(s: McpServer) {
  toolsServerName.value = s.name
  toolList.value = []
  showTools.value = true
  toolsLoading.value = true
  try {
    toolList.value = await getMcpServerTools(s.id)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '获取工具列表失败（连接器不可达？）')
  } finally {
    toolsLoading.value = false
  }
}
</script>

<template>
  <div class="mcp-page">
    <header class="page-head">
      <h1>连接器（MCP）</h1>
      <p class="page-desc">接入 Model Context Protocol 服务器，为 Agent 扩展外部工具能力。对话输入框的「+ → 连接器」可快速启用。</p>
    </header>

    <div class="page-toolbar">
      <el-alert
        type="info" :closable="false" show-icon
        title="http 连接器：远程 MCP 端点（Web/桌面均可探活）；stdio 连接器：本机子进程，仅桌面端可用。"
      />
      <el-button type="primary" :icon="Plus" @click="openCreate">添加连接器</el-button>
    </div>

    <div class="server-list" v-loading="loading">
      <div v-for="s in servers" :key="s.id" class="server-item">
        <div class="server-main">
          <div class="server-name">
            <el-icon class="server-ico"><Connection /></el-icon>
            {{ s.name }}
            <el-tag size="small" :type="s.transport === 'http' ? 'primary' : 'warning'" effect="plain">
              {{ s.transport === 'http' ? 'HTTP' : 'stdio' }}
            </el-tag>
            <el-tag v-if="!s.enabled" size="small" type="info" effect="light">已停用</el-tag>
          </div>
          <div class="server-addr">
            {{ s.transport === 'http' ? s.url : s.command + ' ' + (s.args || []).join(' ') }}
          </div>
          <div v-if="testResult[s.id]" class="server-test" :class="testResult[s.id].ok ? 'ok' : 'fail'">
            {{ testResult[s.id].message }}
          </div>
        </div>
        <div class="server-actions">
          <el-switch :model-value="s.enabled" @change="handleToggle(s)" />
          <el-button size="small" :icon="Refresh" :loading="testingId === s.id" @click="handleTest(s)">探活</el-button>
          <el-button size="small" :icon="Tools" @click="handleViewTools(s)">工具</el-button>
          <el-button size="small" :icon="EditPen" @click="openEdit(s)">编辑</el-button>
          <el-button size="small" type="danger" plain :icon="Delete" @click="handleDelete(s)">删除</el-button>
        </div>
      </div>
      <div v-if="!servers.length && !loading" class="empty-tip">
        还没有连接器。点击右上角「添加连接器」接入你的第一个 MCP 服务器。
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="editingId ? '编辑连接器' : '添加连接器'" width="560px" destroy-on-close>
      <div class="mcp-form">
        <el-input v-model="form.name" placeholder="连接器名称（如：网页抓取 / 文件系统）" />
        <el-radio-group v-model="form.transport">
          <el-radio-button value="http">HTTP 远程端点</el-radio-button>
          <el-radio-button value="stdio">stdio 本地进程</el-radio-button>
        </el-radio-group>

        <template v-if="form.transport === 'http'">
          <el-input v-model="form.url" placeholder="MCP 端点 URL（如 https://mcp.example.com/mcp）" />
          <el-input
            v-model="form.headersJson" type="textarea" :rows="3"
            placeholder='请求头 JSON（可选），如 { "Authorization": "Bearer xxx" }'
          />
        </template>
        <template v-else>
          <el-input v-model="form.command" placeholder="启动命令（如 npx / node / python）" />
          <el-input v-model="form.argsStr" placeholder="命令参数，空格分隔（如 -y @modelcontextprotocol/server-filesystem /path）" />
          <el-input
            v-model="form.envJson" type="textarea" :rows="3"
            placeholder='环境变量 JSON（可选），如 { "API_KEY": "xxx" }'
          />
        </template>

        <el-checkbox v-model="form.enabled">启用连接器（对话「+ → 连接器」中可选）</el-checkbox>
      </div>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 连接器工具列表 -->
    <el-dialog v-model="showTools" :title="`连接器工具 — ${toolsServerName}`" width="620px" destroy-on-close>
      <div v-loading="toolsLoading" class="tools-list">
        <div v-for="t in toolList" :key="t.bridgeName" class="tool-item">
          <div class="tool-name">{{ t.remoteName }}</div>
          <div class="tool-desc">{{ t.description }}</div>
          <div class="tool-bridge">Agent 工具名：{{ t.bridgeName }}</div>
        </div>
        <div v-if="!toolList.length && !toolsLoading" class="empty-tip">
          该连接器未暴露任何工具，或连接失败。
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.mcp-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px;
}
.page-head h1 {
  margin: 0 0 4px;
  font-size: 22px;
}
.page-desc {
  margin: 0 0 8px;
  color: var(--text-secondary);
  font-size: 13px;
}
.page-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.page-toolbar .el-alert {
  flex: 1;
}
.server-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 160px;
}
.server-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-secondary);
}
.server-main {
  flex: 1;
  min-width: 0;
}
.server-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.server-ico {
  color: var(--primary);
}
.server-addr {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  word-break: break-all;
}
.server-test {
  margin-top: 6px;
  font-size: 12px;
}
.server-test.ok { color: var(--success); }
.server-test.fail { color: var(--danger); }
.server-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.empty-tip {
  padding: 40px 0;
  text-align: center;
  color: var(--text-secondary);
}
.mcp-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tools-list {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tool-item {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
}
.tool-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.tool-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.tool-bridge {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-placeholder);
  font-family: monospace;
}
@media (max-width: 768px) {
  .server-item { flex-direction: column; align-items: stretch; }
  .page-toolbar { flex-direction: column; }
}
</style>
