<template>
  <div class="api-key-manager">
    <div class="ak-toolbar">
      <el-input v-model="newName" placeholder="输入 Key 名称，如：我的应用" style="max-width: 260px" />
      <el-button type="primary" @click="handleCreate">新建 API Key</el-button>
    </div>

    <div v-if="newlyCreated" class="new-key-box">
      <el-alert type="warning" :closable="false" title="请立即复制并妥善保存，Key 仅显示这一次" />
      <div class="new-key-row">
        <el-input v-model="newlyCreated" readonly>
          <template #append><el-button @click="copyKey">复制</el-button></template>
        </el-input>
      </div>
    </div>

    <el-table :data="chatStore.apiKeys" size="small" style="margin-top: 12px">
      <el-table-column prop="name" label="名称" />
      <el-table-column label="Key" width="180">
        <template #default="{ row }">
          <code class="key-mask">{{ row.keyPrefix }}…</code>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="最后使用" width="170">
        <template #default="{ row }">{{ row.lastUsedAt ? formatTime(row.lastUsedAt) : '未使用' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="80">
        <template #default="{ row }">
          <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="usage-tip">
      在第三方工具中，将 API 地址指向 <code>{{ origin }}/api/v1</code>，
      并在请求头携带 <code>Authorization: Bearer &lt;你的Key&gt;</code> 即可使用。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const newName = ref('')
const newlyCreated = ref('')
const origin = location.origin

function formatTime(t: string) {
  if (!t) return '-'
  try { return new Date(t).toLocaleString('zh-CN') } catch { return t }
}

onMounted(() => { chatStore.loadApiKeys() })

async function handleCreate() {
  const name = newName.value.trim() || '未命名应用'
  try {
    const res = await chatStore.createApiKey(name)
    newlyCreated.value = res.key || ''
    newName.value = ''
    ElMessage.success('API Key 已创建')
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败')
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除 Key「${row.name}」？删除后第三方工具将无法继续调用。`, '提示', { type: 'warning' })
    await chatStore.removeApiKey(row.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

async function copyKey() {
  try {
    await navigator.clipboard.writeText(newlyCreated.value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.warning('复制失败，请手动复制')
  }
}
</script>

<style scoped>
.ak-toolbar { display: flex; gap: 8px; }
.new-key-box { margin-top: 12px; }
.new-key-row { margin-top: 8px; }
.key-mask { font-size: 12px; color: var(--text-secondary); }
.usage-tip {
  margin-top: 16px; font-size: 12px; color: var(--text-secondary);
  background: var(--bg-tertiary); padding: 10px 12px; border-radius: 8px; line-height: 1.8;
}
.usage-tip code { background: rgba(0,0,0,0.08); padding: 1px 5px; border-radius: 4px; }
</style>
