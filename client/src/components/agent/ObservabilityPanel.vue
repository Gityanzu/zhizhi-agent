<template>
  <el-drawer
    v-model="visible"
    title="系统可观测性"
    :size="isMobile ? '100%' : '600px'"
    direction="rtl"
  >
    <div v-loading="loading" class="observability-panel">
      <!-- 总览卡片 -->
      <div class="overview-cards">
        <div class="stat-card">
          <div class="stat-value">{{ stats.overview.totalSessions }}</div>
          <div class="stat-label">总会话数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.overview.totalMessages }}</div>
          <div class="stat-label">总消息数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatTokens(stats.overview.totalTokens) }}</div>
          <div class="stat-label">总 Token</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.overview.totalToolCalls }}</div>
          <div class="stat-label">工具调用</div>
        </div>
      </div>

      <!-- 平均耗时 -->
      <div class="section">
        <h3>平均工具耗时</h3>
        <div class="avg-duration">
          <span class="duration-value">{{ stats.overview.avgToolDurationMs.toFixed(1) }}</span>
          <span class="duration-unit">ms</span>
        </div>
      </div>

      <!-- 按模型统计 -->
      <div class="section">
        <h3>模型使用统计</h3>
        <el-table :data="stats.byModel" size="small" stripe>
          <el-table-column prop="model" label="模型" />
          <el-table-column prop="count" label="调用次数" width="100" />
          <el-table-column label="Token 用量" width="150">
            <template #default="{ row }">
              {{ formatTokens(row.totalTokens) }}
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 按工具统计 -->
      <div class="section">
        <h3>工具调用统计</h3>
        <el-table :data="stats.byTool" size="small" stripe>
          <el-table-column prop="toolName" label="工具" />
          <el-table-column prop="count" label="调用次数" width="100" />
          <el-table-column label="平均耗时" width="150">
            <template #default="{ row }">
              {{ row.avgDurationMs.toFixed(1) }} ms
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 最近消息 -->
      <div class="section">
        <h3>最近消息</h3>
        <el-table :data="stats.recentMessages" size="small" stripe max-height="200">
          <el-table-column prop="role" label="角色" width="80">
            <template #default="{ row }">
              <el-tag :type="row.role === 'user' ? 'primary' : 'success'" size="small">
                {{ row.role === 'user' ? '用户' : '助手' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="content" label="内容" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.createdAt) }}
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 最近工具调用 -->
      <div class="section">
        <h3>最近工具调用</h3>
        <el-table :data="stats.recentToolCalls" size="small" stripe max-height="200">
          <el-table-column prop="toolName" label="工具" width="150" />
          <el-table-column label="耗时" width="100">
            <template #default="{ row }">
              {{ row.durationMs }} ms
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.createdAt) }}
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { getObservabilityStats } from '@/api'
import { useIsMobile } from '@/composables/useIsMobile'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = ref(props.modelValue)
const loading = ref(false)
const { isMobile } = useIsMobile()
let refreshTimer: ReturnType<typeof setInterval> | null = null

const stats = ref({
  overview: {
    totalSessions: 0,
    totalMessages: 0,
    totalTokens: 0,
    totalToolCalls: 0,
    avgToolDurationMs: 0,
  },
  byModel: [] as Array<{ model: string; count: number; totalTokens: number }>,
  byTool: [] as Array<{ toolName: string; count: number; avgDurationMs: number }>,
  recentMessages: [] as Array<{ id: string; sessionId: string; role: string; content: string; createdAt: string }>,
  recentToolCalls: [] as Array<{ id: string; toolName: string; durationMs: number; createdAt: string }>,
})

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    loadStats()
    // 每30秒自动刷新
    refreshTimer = setInterval(loadStats, 30000)
  } else {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

async function loadStats() {
  loading.value = true
  try {
    const data = await getObservabilityStats()
    stats.value = data
  } catch (e) {
    console.error('加载统计数据失败:', e)
  } finally {
    loading.value = false
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M'
  if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K'
  return tokens.toString()
}

function formatTime(time: string): string {
  if (!time) return ''
  const d = new Date(time)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<style scoped>
.observability-panel {
  padding: 0 16px;
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #409eff;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

.section {
  margin-bottom: 24px;
}

.section h3 {
  font-size: 14px;
  color: #303133;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

.avg-duration {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.duration-value {
  font-size: 32px;
  font-weight: 600;
  color: #67c23a;
}

.duration-unit {
  font-size: 14px;
  color: #909399;
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .observability-panel {
    padding: 0 12px;
  }
  
  .overview-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  
  .stat-card {
    padding: 12px;
  }
  
  .stat-value {
    font-size: 20px;
  }
  
  .section h3 {
    font-size: 13px;
  }
}
</style>
