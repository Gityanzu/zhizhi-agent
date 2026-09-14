<template>
  <el-drawer
    v-model="visible"
    title="自动记忆管理"
    :size="isMobile ? '100%' : '500px'"
    direction="rtl"
  >
    <div v-loading="loading" class="memory-panel">
      <!-- 说明 -->
      <el-alert
        title="系统会自动从对话中提取用户偏好、习惯和重要事实，跨会话复用。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
      />
      
      <!-- 操作栏 -->
      <div class="action-bar">
        <el-button type="primary" plain size="small" @click="loadMemories">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="danger" plain size="small" @click="handleClearAll">
          <el-icon><Delete /></el-icon>
          清空全部
        </el-button>
        <span class="memory-count">共 {{ memories.length }} 条记忆</span>
      </div>
      
      <!-- 记忆列表 -->
      <div v-if="memories.length > 0" class="memory-list">
        <div
          v-for="mem in memories"
          :key="mem.id"
          class="memory-item"
        >
          <div class="memory-header">
            <el-tag :type="getCategoryType(mem.category)" size="small">
              {{ getCategoryLabel(mem.category) }}
            </el-tag>
            <div class="memory-meta">
              <span class="importance">
                重要性: 
                <el-rate
                  :model-value="mem.importance"
                  disabled
                  size="small"
                  :max="10"
                />
              </span>
              <el-button
                type="danger"
                size="small"
                text
                @click="handleDelete(mem.id)"
              >
                删除
              </el-button>
            </div>
          </div>
          <div class="memory-content">{{ mem.content }}</div>
          <div class="memory-time">{{ formatTime(mem.updatedAt) }}</div>
        </div>
      </div>
      
      <!-- 空状态 -->
      <div v-else class="empty-state">
        <el-icon :size="48" color="#c0c4cc"><Collection /></el-icon>
        <p>暂无记忆记录</p>
        <p class="empty-tip">多和 AI 对话，系统会自动提取有价值的信息</p>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Delete, Collection } from '@element-plus/icons-vue'
import { getMemories, deleteMemory, clearMemories } from '@/api'
import { useIsMobile } from '@/composables/useIsMobile'

interface MemoryItem {
  id: string
  content: string
  category: string
  importance: number
  createdAt: string
  updatedAt: string
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = ref(props.modelValue)
const loading = ref(false)
const memories = ref<MemoryItem[]>([])
const { isMobile } = useIsMobile()

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    loadMemories()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

async function loadMemories() {
  loading.value = true
  try {
    const data = await getMemories()
    memories.value = data.memories || []
  } catch (e) {
    console.error('加载记忆失败:', e)
  } finally {
    loading.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await deleteMemory(id)
    memories.value = memories.value.filter(m => m.id !== id)
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

async function handleClearAll() {
  try {
    await ElMessageBox.confirm('确定要清空所有记忆吗？此操作不可恢复。', '确认清空', {
      type: 'warning',
    })
    await clearMemories()
    memories.value = []
    ElMessage.success('已清空全部记忆')
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error('清空失败')
    }
  }
}

function getCategoryType(category: string): string {
  const map: Record<string, string> = {
    preference: 'primary',
    fact: 'success',
    habit: 'warning',
    project: 'danger',
    general: 'info',
  }
  return map[category] || 'info'
}

function getCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    preference: '偏好',
    fact: '事实',
    habit: '习惯',
    project: '项目',
    general: '通用',
    other: '其他',
  }
  return map[category] || category
}

function formatTime(time: string): string {
  if (!time) return ''
  const d = new Date(time)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.memory-panel {
  padding: 0 16px;
}

.action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.memory-count {
  margin-left: auto;
  font-size: 13px;
  color: #909399;
}

.memory-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.memory-item {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px 16px;
  border-left: 3px solid #409eff;
}

.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.memory-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.importance {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}

.memory-content {
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
  margin-bottom: 6px;
}

.memory-time {
  font-size: 12px;
  color: #c0c4cc;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-state p {
  color: #909399;
  margin: 12px 0 4px;
}

.empty-tip {
  font-size: 12px !important;
  color: #c0c4cc !important;
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .memory-panel {
    padding: 0 12px;
  }
  
  .memory-item {
    padding: 10px 12px;
  }
  
  .memory-content {
    font-size: 13px;
  }
  
  .action-bar {
    flex-wrap: wrap;
  }
}
</style>
