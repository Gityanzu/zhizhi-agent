<template>
  <el-dialog
    :model-value="modelValue"
    title="Token 用量统计"
    width="520px"
    :destroy-on-close="true"
    class="token-stats-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="refresh"
  >
    <div v-loading="loading" class="token-stats">
      <!-- 本次回复 -->
      <section class="stats-section">
        <h4 class="section-title">本次回复</h4>
        <template v-if="chatStore.lastTokenUsage">
          <div class="usage-grid">
            <div class="usage-item">
              <span class="usage-label">输入</span>
              <span class="usage-value">{{ fmt(chatStore.lastTokenUsage.promptTokens) }}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">输出</span>
              <span class="usage-value">{{ fmt(chatStore.lastTokenUsage.completionTokens) }}</span>
            </div>
            <div class="usage-item highlight">
              <span class="usage-label">合计</span>
              <span class="usage-value">{{ fmt(chatStore.lastTokenUsage.totalTokens) }}</span>
            </div>
          </div>
        </template>
        <p v-else class="empty-hint">本轮对话还没有用量数据</p>
      </section>

      <!-- 会话累计 -->
      <section class="stats-section">
        <h4 class="section-title">当前会话累计</h4>
        <template v-if="chatStore.sessionUsage && chatStore.sessionUsage.totalTokens > 0">
          <div class="usage-grid">
            <div class="usage-item">
              <span class="usage-label">输入</span>
              <span class="usage-value">{{ fmt(chatStore.sessionUsage.totalPromptTokens) }}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">输出</span>
              <span class="usage-value">{{ fmt(chatStore.sessionUsage.totalCompletionTokens) }}</span>
            </div>
            <div class="usage-item highlight">
              <span class="usage-label">合计</span>
              <span class="usage-value">{{ fmt(chatStore.sessionUsage.totalTokens) }}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">消息数</span>
              <span class="usage-value">{{ chatStore.sessionUsage.messageCount }}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">估算费用</span>
              <span class="usage-value">¥{{ (chatStore.sessionUsage.totalCostCents / 100).toFixed(2) }}</span>
            </div>
          </div>

          <!-- 按模型明细 -->
          <el-table
            v-if="chatStore.sessionUsage.byModel?.length"
            :data="chatStore.sessionUsage.byModel"
            size="small"
            class="model-table"
          >
            <el-table-column prop="model" label="模型" min-width="160" show-overflow-tooltip />
            <el-table-column prop="count" label="次数" width="70" align="right" />
            <el-table-column label="Tokens" width="110" align="right">
              <template #default="{ row }">{{ fmt(row.totalTokens) }}</template>
            </el-table-column>
          </el-table>
        </template>
        <p v-else class="empty-hint">当前会话还没有用量数据</p>
      </section>

      <!-- 全局累计 -->
      <section class="stats-section">
        <h4 class="section-title">全局累计</h4>
        <template v-if="globalUsage && globalUsage.totalTokens > 0">
          <div class="usage-grid">
            <div class="usage-item">
              <span class="usage-label">会话数</span>
              <span class="usage-value">{{ globalUsage.sessionCount }}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">消息数</span>
              <span class="usage-value">{{ globalUsage.messageCount }}</span>
            </div>
            <div class="usage-item highlight">
              <span class="usage-label">Tokens</span>
              <span class="usage-value">{{ fmt(globalUsage.totalTokens) }}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">估算费用</span>
              <span class="usage-value">¥{{ (globalUsage.totalCostCents / 100).toFixed(2) }}</span>
            </div>
          </div>
        </template>
        <p v-else class="empty-hint">还没有任何用量记录</p>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * TokenStatsDialog — Token 用量统计弹窗
 *
 * 数据来源三层：本次回复（chatStore.lastTokenUsage，流式 chunk 实时更新）、
 * 当前会话（/api/usage/session/:id，打开时刷新）、全局（/api/usage）。
 * 费用为服务端按模型粗略估算（usage.ts estimateCost），仅供参考。
 */
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { getGlobalUsage } from '@/api/stats'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const chatStore = useChatStore()
const loading = ref(false)
const globalUsage = ref<{
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalCostCents: number
  sessionCount: number
  messageCount: number
} | null>(null)

const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString()

async function refresh() {
  loading.value = true
  const jobs: Promise<unknown>[] = [
    // 会话统计在打开时拉一次最新值（刚结束的一轮流式可能还没触发刷新）
    ...(chatStore.currentSessionId ? [chatStore.loadSessionUsage(chatStore.currentSessionId)] : []),
    getGlobalUsage()
      .then((u) => (globalUsage.value = u))
      .catch(() => {}),
  ]
  await Promise.allSettled(jobs)
  loading.value = false
}
</script>

<style scoped>
.token-stats {
  min-height: 120px;
}

.stats-section {
  margin-bottom: 18px;
}

.stats-section:last-child {
  margin-bottom: 0;
}

.section-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.usage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.usage-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: var(--bg-secondary, #f5f7fa);
  border-radius: 8px;
}

.usage-item.highlight {
  background: var(--primary-light, rgba(64, 158, 255, 0.1));
}

.usage-label {
  font-size: 11px;
  color: var(--text-secondary, #909399);
}

.usage-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.usage-item.highlight .usage-value {
  color: var(--primary);
}

.model-table {
  margin-top: 10px;
  width: 100%;
}

.empty-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary, #909399);
}
</style>
