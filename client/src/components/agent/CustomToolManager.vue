<template>
  <div class="custom-tool-manager">
    <div class="header">
      <h3>自定义工具</h3>
      <el-button type="primary" size="small" @click="openEdit()">
        <el-icon><Plus /></el-icon> 新建工具
      </el-button>
    </div>

    <div class="tool-list">
      <div
        v-for="tool in chatStore.customTools"
        :key="tool.id"
        class="tool-card"
      >
        <div class="tool-card-header">
          <div class="tool-info">
            <div class="tool-name-row">
              <el-tag size="small" :type="methodType(tool.method)">{{ tool.method }}</el-tag>
              <span class="tool-name">{{ tool.name }}</span>
            </div>
            <div class="tool-url">{{ tool.url }}</div>
            <div class="tool-desc">{{ tool.description || '暂无描述' }}</div>
          </div>
          <div class="tool-actions">
            <el-button text size="small" @click="openEdit(tool)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button text size="small" class="danger" @click="handleDelete(tool)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
      <div v-if="chatStore.customTools.length === 0" class="empty">
        暂无自定义工具，点击"新建工具"创建
      </div>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingTool?.id ? '编辑工具' : '新建工具'" width="650px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="工具名称">
          <el-input v-model="form.name" placeholder="英文名称，如 get_weather" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" placeholder="工具功能描述（LLM据此决定何时调用）" />
        </el-form-item>
        <el-form-item label="请求方法">
          <el-select v-model="form.method" style="width: 120px">
            <el-option label="GET" value="GET" />
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="DELETE" value="DELETE" />
          </el-select>
        </el-form-item>
        <el-form-item label="URL">
          <el-input v-model="form.url" placeholder="https://api.example.com/endpoint" />
          <div class="form-hint">URL 中可使用 {'{{参数名}}'} 占位符，调用时自动替换</div>
        </el-form-item>
        <el-form-item label="请求头">
          <div v-for="(header, idx) in form.headersList" :key="idx" class="header-row">
            <el-input v-model="header.key" placeholder="Header名" style="width: 140px" />
            <el-input v-model="header.value" placeholder="值" style="flex: 1" />
            <el-button text @click="form.headersList.splice(idx, 1)">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
          <el-button size="small" @click="form.headersList.push({ key: '', value: '' })">
            <el-icon><Plus /></el-icon> 添加请求头
          </el-button>
        </el-form-item>
        <el-form-item label="参数定义">
          <div class="param-editor">
            <div v-for="(param, idx) in form.paramsList" :key="idx" class="param-row">
              <el-input v-model="param.name" placeholder="参数名" style="width: 120px" />
              <el-select v-model="param.type" style="width: 100px">
                <el-option label="string" value="string" />
                <el-option label="number" value="number" />
                <el-option label="boolean" value="boolean" />
              </el-select>
              <el-input v-model="param.description" placeholder="描述" style="flex: 1" />
              <el-checkbox v-model="param.required">必填</el-checkbox>
              <el-button text @click="form.paramsList.splice(idx, 1)">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <el-button size="small" @click="form.paramsList.push({ name: '', type: 'string', description: '', required: false })">
              <el-icon><Plus /></el-icon> 添加参数
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="Body模板" v-if="form.method !== 'GET' && form.method !== 'DELETE'">
          <el-input
            v-model="form.bodyTemplate"
            type="textarea"
            :rows="3"
            placeholder='{"key": "{{paramName}}"}'
          />
          <div class="form-hint">使用 {'{{参数名}}'} 占位符，调用时自动替换为实际参数值</div>
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
import { Plus, Edit, Delete, Close } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import type { CustomTool } from '@/types'

const chatStore = useChatStore()

const dialogVisible = ref(false)
const editingTool = ref<CustomTool | null>(null)

interface HeaderEntry { key: string; value: string }
interface ParamEntry { name: string; type: string; description: string; required: boolean }

const form = ref({
  name: '',
  description: '',
  method: 'GET',
  url: '',
  headersList: [] as HeaderEntry[],
  paramsList: [] as ParamEntry[],
  bodyTemplate: '',
})

function methodType(method: string): string {
  const map: Record<string, string> = { GET: 'success', POST: 'primary', PUT: 'warning', DELETE: 'danger' }
  return map[method] || 'info'
}

function openEdit(tool?: CustomTool) {
  editingTool.value = tool || null
  if (tool) {
    const headers = tool.headers || {}
    form.value = {
      name: tool.name,
      description: tool.description,
      method: tool.method,
      url: tool.url,
      headersList: Object.entries(headers).map(([key, value]) => ({ key, value: String(value) })),
      paramsList: Object.entries(tool.paramsSchema?.properties || {}).map(([name, def]: [string, any]) => ({
        name,
        type: def.type || 'string',
        description: def.description || '',
        required: (tool.paramsSchema?.required || []).includes(name),
      })),
      bodyTemplate: tool.bodyTemplate || '',
    }
  } else {
    form.value = {
      name: '',
      description: '',
      method: 'GET',
      url: '',
      headersList: [],
      paramsList: [],
      bodyTemplate: '',
    }
  }
  dialogVisible.value = true
}

function buildParamsSchema(): any {
  const properties: Record<string, any> = {}
  const required: string[] = []
  for (const p of form.value.paramsList) {
    if (!p.name) continue
    properties[p.name] = { type: p.type, description: p.description }
    if (p.required) required.push(p.name)
  }
  return { type: 'object', properties, required }
}

function buildHeaders(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const h of form.value.headersList) {
    if (h.key) result[h.key] = h.value
  }
  return result
}

async function handleSave() {
  if (!form.value.name.trim() || !form.value.url.trim()) {
    ElMessage.warning('请填写工具名称和URL')
    return
  }
  const data = {
    name: form.value.name,
    description: form.value.description,
    method: form.value.method,
    url: form.value.url,
    headers: buildHeaders(),
    paramsSchema: buildParamsSchema(),
    bodyTemplate: form.value.bodyTemplate,
  }
  try {
    if (editingTool.value) {
      await chatStore.updateCustomToolApi(editingTool.value.id, data)
      ElMessage.success('工具已更新')
    } else {
      await chatStore.createCustomToolApi(data)
      ElMessage.success('工具已创建')
    }
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

async function handleDelete(tool: CustomTool) {
  try {
    await ElMessageBox.confirm(`确定删除工具 "${tool.name}" 吗？`, '确认删除', { type: 'warning' })
    await chatStore.deleteCustomToolApi(tool.id)
    ElMessage.success('已删除')
  } catch (e) {
    // 取消
  }
}

onMounted(() => {
  chatStore.loadCustomTools()
})
</script>

<style scoped>
.custom-tool-manager {
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
.tool-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tool-card {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
}
.tool-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.tool-info {
  flex: 1;
  min-width: 0;
}
.tool-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tool-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}
.tool-url {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0;
  font-family: monospace;
  word-break: break-all;
}
.tool-desc {
  font-size: 12px;
  color: var(--text-secondary);
}
.tool-actions {
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
.header-row, .param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.form-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.param-editor {
  width: 100%;
}
</style>
