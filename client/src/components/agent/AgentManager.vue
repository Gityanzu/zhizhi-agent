<template>
  <div class="agent-manager">
    <div class="header">
      <h3>Agent 管理</h3>
      <div class="header-actions">
        <el-button size="small" @click="triggerImport">
          <el-icon><Upload /></el-icon> 导入
        </el-button>
        <el-button type="primary" size="small" @click="openEdit()">
          <el-icon><Plus /></el-icon> 新建 Agent
        </el-button>
        <input ref="importInputRef" type="file" accept=".json" style="display:none" @change="handleImportFile" />
      </div>
    </div>

    <div class="agent-list">
      <div
        v-for="agent in chatStore.customAgents"
        :key="agent.id"
        class="agent-card"
      >
        <div class="agent-card-header">
          <span class="agent-avatar">{{ agent.avatar }}</span>
          <div class="agent-info">
            <div class="agent-name">{{ agent.name }}</div>
            <div class="agent-desc">{{ agent.description || '暂无描述' }}</div>
            <div class="agent-meta">
              <el-tag size="small" effect="plain">{{ agent.model || '默认模型' }}</el-tag>
              <el-tag size="small" type="info" effect="plain">{{ agent.tools.length }} 个工具</el-tag>
              <el-tag size="small" type="warning" effect="plain">温度 {{ agent.temperature }}</el-tag>
            </div>
          </div>
          <div class="agent-actions">
            <el-button text size="small" @click="chatStore.exportAgent(agent)">
              <el-icon><Download /></el-icon>
            </el-button>
            <el-button text size="small" @click="openEdit(agent)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button text size="small" class="danger" @click="handleDelete(agent)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
      <div v-if="chatStore.customAgents.length === 0" class="empty">
        暂无自定义 Agent，点击"新建 Agent"创建
      </div>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingAgent?.id ? '编辑 Agent' : '新建 Agent'" width="600px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="Agent 名称" />
        </el-form-item>
        <el-form-item label="头像">
          <el-select v-model="form.avatar" placeholder="选择 emoji">
            <el-option v-for="e in emojis" :key="e" :label="e" :value="e" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" placeholder="Agent 功能描述" />
        </el-form-item>
        <el-form-item label="系统提示词">
          <el-input
            v-model="form.systemPrompt"
            type="textarea"
            :rows="5"
            placeholder="定义 Agent 的角色、行为规范和回答风格"
          />
        </el-form-item>
        <el-form-item label="模型">
          <el-select v-model="form.model" placeholder="选择模型" clearable>
            <el-option
              v-for="m in chatStore.availableModels"
              :key="m.id"
              :label="m.name"
              :value="m.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="可用工具">
          <el-checkbox-group v-model="form.tools">
            <el-checkbox v-for="t in allToolNames" :key="t" :value="t">{{ t }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="温度">
          <el-slider v-model="form.temperature" :min="0" :max="1" :step="0.1" show-input />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Edit, Delete, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import type { CustomAgent } from '@/types'

const chatStore = useChatStore()
const importInputRef = ref<HTMLInputElement | null>(null)

// 内置工具名列表（与后端 tools 数组对应）
const allToolNames = [
  'search_knowledge_base', 'calculate', 'get_current_time', 'web_search',
  'create_file', 'read_file', 'write_file', 'append_file', 'list_files', 'search_files',
  'run_shell', 'translate_text', 'summarize_text', 'code_interpreter',
]

const emojis = ['🤖', '🧠', '💼', '📊', '🔬', '💻', '🎨', '📚', '🎯', '⚡', '🛡️', '🌟']

const dialogVisible = ref(false)
const editingAgent = ref<CustomAgent | null>(null)

const form = ref({
  name: '',
  avatar: '🤖',
  description: '',
  systemPrompt: '',
  model: '',
  tools: [] as string[],
  temperature: 0.7,
})

function openEdit(agent?: CustomAgent) {
  editingAgent.value = agent || null
  if (agent) {
    form.value = {
      name: agent.name,
      avatar: agent.avatar,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      tools: [...agent.tools],
      temperature: agent.temperature,
    }
  } else {
    form.value = {
      name: '',
      avatar: '🤖',
      description: '',
      systemPrompt: '',
      model: '',
      tools: [],
      temperature: 0.7,
    }
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入 Agent 名称')
    return
  }
  try {
    if (editingAgent.value) {
      await chatStore.updateCustomAgent(editingAgent.value.id, { ...form.value })
      ElMessage.success('Agent 已更新')
    } else {
      await chatStore.createCustomAgent({ ...form.value })
      ElMessage.success('Agent 已创建')
    }
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

async function handleDelete(agent: CustomAgent) {
  try {
    await ElMessageBox.confirm(`确定删除 Agent "${agent.name}" 吗？`, '确认删除', { type: 'warning' })
    await chatStore.deleteCustomAgent(agent.id)
    ElMessage.success('已删除')
  } catch (e) {
    // 取消
  }
}

// 功能16：导入 Agent
function triggerImport() {
  importInputRef.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const res = await chatStore.importAgent(text)
    if (res.success) {
      ElMessage.success(`已导入 Agent：${res.agent.name}`)
    } else {
      ElMessage.error('导入失败: ' + res.error)
    }
  } catch (e: any) {
    ElMessage.error('读取文件失败: ' + (e?.message || e))
  }
  input.value = ''
}

onMounted(() => {
  chatStore.loadCustomAgents()
  chatStore.loadModelInfo()
})
</script>

<style scoped>
.agent-manager {
  padding: 16px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.header h3 {
  margin: 0;
  font-size: 16px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.agent-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.agent-card {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
}
.agent-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.agent-avatar {
  font-size: 32px;
  flex-shrink: 0;
}
.agent-info {
  flex: 1;
  min-width: 0;
}
.agent-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}
.agent-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0;
}
.agent-meta {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.agent-actions {
  display: flex;
  gap: 4px;
}
.danger {
  color: #f56c6c;
}
.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px 0;
  font-size: 13px;
}
</style>
