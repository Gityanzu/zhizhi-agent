<template>
  <el-drawer
    v-model="visible"
    title="提示词模板管理"
    :size="isMobile ? '100%' : '600px'"
    direction="rtl"
  >
    <div v-loading="loading" class="prompt-panel">
      <!-- 模板列表 -->
      <div class="template-list">
        <div
          v-for="tpl in templates"
          :key="tpl.id"
          class="template-item"
          :class="{ active: tpl.isActive }"
          @click="selectTemplate(tpl)"
        >
          <div class="template-header">
            <span class="template-name">{{ tpl.name }}</span>
            <div class="template-tags">
              <el-tag v-if="tpl.isBuiltin" type="info" size="small">内置</el-tag>
              <el-tag v-if="tpl.isActive" type="success" size="small">使用中</el-tag>
            </div>
          </div>
          <div class="template-desc">{{ tpl.description }}</div>
        </div>
      </div>
      
      <!-- 编辑区域 -->
      <div v-if="selectedTemplate" class="edit-area">
        <el-form label-width="80px" size="small">
          <el-form-item label="名称">
            <el-input v-model="editForm.name" :disabled="selectedTemplate.isBuiltin" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="editForm.description" :disabled="selectedTemplate.isBuiltin" />
          </el-form-item>
          <el-form-item label="提示词">
            <el-input
              v-model="editForm.content"
              type="textarea"
              :rows="10"
              :disabled="selectedTemplate.isBuiltin"
              placeholder="输入系统提示词..."
            />
          </el-form-item>
        </el-form>
        
        <div class="edit-actions">
          <el-button type="primary" @click="handleActivate" :disabled="selectedTemplate.isActive">
            设为当前使用
          </el-button>
          <el-button @click="handleSave" :disabled="selectedTemplate.isBuiltin">
            保存修改
          </el-button>
          <el-button type="danger" @click="handleDelete" :disabled="selectedTemplate.isBuiltin">
            删除
          </el-button>
        </div>
      </div>
      
      <!-- 新建按钮 -->
      <div class="new-template">
        <el-button type="primary" plain @click="handleNew">
          <el-icon><Plus /></el-icon>
          新建模板
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getPromptTemplates,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  activatePromptTemplate,
} from '@/api'
import { useIsMobile } from '@/composables/useIsMobile'

interface PromptTemplate {
  id: string
  name: string
  description: string
  content: string
  isActive: boolean
  isBuiltin: boolean
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = ref(props.modelValue)
const loading = ref(false)
const templates = ref<PromptTemplate[]>([])
const selectedTemplate = ref<PromptTemplate | null>(null)
const editForm = ref({ name: '', description: '', content: '' })
const { isMobile } = useIsMobile()

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    loadTemplates()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

async function loadTemplates() {
  loading.value = true
  try {
    const data = await getPromptTemplates()
    templates.value = data.templates || []
    // 默认选中激活的模板
    const active = templates.value.find(t => t.isActive)
    if (active) {
      selectTemplate(active)
    }
  } catch (e) {
    console.error('加载模板失败:', e)
  } finally {
    loading.value = false
  }
}

function selectTemplate(tpl: PromptTemplate) {
  selectedTemplate.value = tpl
  editForm.value = {
    name: tpl.name,
    description: tpl.description,
    content: tpl.content,
  }
}

async function handleActivate() {
  if (!selectedTemplate.value) return
  try {
    await activatePromptTemplate(selectedTemplate.value.id)
    ElMessage.success('已切换提示词模板')
    await loadTemplates()
  } catch (e) {
    ElMessage.error('切换失败')
  }
}

async function handleSave() {
  if (!selectedTemplate.value) return
  try {
    await updatePromptTemplate(
      selectedTemplate.value.id,
      editForm.value.name,
      editForm.value.description,
      editForm.value.content
    )
    ElMessage.success('保存成功')
    await loadTemplates()
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

async function handleDelete() {
  if (!selectedTemplate.value) return
  try {
    await ElMessageBox.confirm('确定要删除这个模板吗？', '确认删除', { type: 'warning' })
    await deletePromptTemplate(selectedTemplate.value.id)
    ElMessage.success('已删除')
    selectedTemplate.value = null
    await loadTemplates()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

async function handleNew() {
  try {
    const { value } = await ElMessageBox.prompt('请输入模板名称', '新建模板', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
    })
    if (value) {
      const result = await createPromptTemplate(value, '', '你是一个有帮助的AI助手。')
      ElMessage.success('创建成功')
      await loadTemplates()
      // 选中新创建的模板
      if (result.template) {
        selectTemplate(result.template)
      }
    }
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error('创建失败')
    }
  }
}
</script>

<style scoped>
.prompt-panel {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.template-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.template-item {
  padding: 10px 14px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 140px;
}

.template-item:hover {
  border-color: #409eff;
}

.template-item.active {
  border-color: #67c23a;
  background: #f0f9eb;
}

.template-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.template-name {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.template-tags {
  display: flex;
  gap: 4px;
}

.template-desc {
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.edit-area {
  flex: 1;
  overflow-y: auto;
}

.edit-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.new-template {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .prompt-panel {
    padding: 0 12px;
  }
  
  .template-list {
    gap: 6px;
  }
  
  .template-item {
    min-width: 120px;
    padding: 8px 10px;
  }
  
  .template-name {
    font-size: 13px;
  }
  
  .edit-actions {
    flex-wrap: wrap;
  }
}
</style>
