<template>
  <div class="compare-view">
    <!-- 顶部控制栏 -->
    <div class="compare-toolbar">
      <div class="compare-models-picker">
        <span class="picker-label">选择模型（2-4个）：</span>
        <el-select
          v-model="selectedModels"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择要对比的模型"
          :multiple-limit="4"
          class="model-picker"
        >
          <el-option-group
            v-for="g in chatStore.modelGroups"
            :key="g.providerId"
            :label="g.providerName"
          >
            <el-option
              v-for="m in g.models"
              :key="g.providerId + ':' + m.id"
              :label="m.name"
              :value="g.providerId + '::' + m.id"
              :disabled="!g.available"
            />
          </el-option-group>
        </el-select>
        <el-button
          type="primary"
          :loading="chatStore.compareRunning"
          :disabled="!canStart"
          @click="handleStart"
        >
          {{ chatStore.compareRunning ? '生成中...' : '开始对比' }}
        </el-button>
        <el-button v-if="chatStore.compareRunning" @click="chatStore.stopCompare()">停止</el-button>
      </div>

      <div class="compare-input-row">
        <el-input
          v-model="message"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="输入要对比的问题..."
          @keydown.ctrl.enter="handleStart"
        />
      </div>

      <div class="compare-options">
        <el-checkbox v-model="syncScroll">同步滚动</el-checkbox>
        <span class="hint">Ctrl+Enter 快速发送</span>
      </div>
    </div>

    <!-- 对比结果区 -->
    <div
      v-if="chatStore.compareResults.length"
      class="compare-grid"
      :style="gridStyle"
    >
      <div
        v-for="(r, idx) in chatStore.compareResults"
        :key="idx"
        class="compare-col"
      >
        <div class="col-header">
          <span class="col-title">{{ r.modelLabel || r.model || '模型' }}</span>
          <el-tag v-if="r.tokenUsage" size="small" effect="plain">
            {{ r.tokenUsage.totalTokens }} tokens · {{ ((r.elapsedMs || 0) / 1000).toFixed(1) }}s
          </el-tag>
          <el-tag v-if="r.error" size="small" type="danger" effect="plain">出错</el-tag>
          <el-tag v-else-if="r.done" size="small" type="success" effect="plain">完成</el-tag>
          <el-tag v-else size="small" type="warning" effect="plain">生成中</el-tag>
        </div>

        <div
          class="col-body"
          ref="colBodyRefs"
          @scroll="handleColScroll(idx, $event)"
        >
          <template v-if="r.error">
            <div class="error-text">{{ r.error }}</div>
          </template>
          <template v-else>
            <div class="answer-text">{{ r.answer || '等待生成...' }}</div>
          </template>
        </div>

        <div class="col-footer">
          <el-button
            size="small"
            type="primary"
            plain
            :disabled="!r.done || !r.answer"
            @click="chatStore.adoptCompareResult(idx)"
          >
            采用此回答
          </el-button>
        </div>
      </div>
    </div>

    <div v-else class="compare-empty">
      <el-empty description="选择 2-4 个模型，输入问题后开始对比" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()

const message = ref('')
const selectedModels = ref<string[]>([])
const syncScroll = ref(false)
const colBodyRefs = ref<HTMLElement[]>([])

const canStart = computed(() =>
  message.value.trim().length > 0 &&
  selectedModels.value.length >= 2 &&
  selectedModels.value.length <= 4 &&
  !chatStore.compareRunning
)

const gridStyle = computed(() => {
  const n = chatStore.compareResults.length || 2
  const cols = Math.min(Math.max(n, 1), 4)
  return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
})

async function handleStart() {
  if (!canStart.value) {
    if (selectedModels.value.length < 2) {
      ElMessage.warning('请至少选择 2 个模型进行对比')
    }
    return
  }
  const models = selectedModels.value.map((v) => {
    const [providerId, model] = v.split('::')
    return { model, providerId }
  })
  await chatStore.startCompare(message.value, models)
  await nextTick()
}

// 同步滚动：监听当前滚动栏，按比例同步其他栏
let syncing = false
function handleColScroll(idx: number, e: Event) {
  if (!syncScroll.value || syncing) return
  const target = e.currentTarget as HTMLElement
  const ratio = target.scrollTop / (target.scrollHeight - target.clientHeight || 1)
  syncing = true
  colBodyRefs.value.forEach((el, i) => {
    if (i === idx || !el) return
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
  })
  requestAnimationFrame(() => { syncing = false })
}
</script>

<style scoped>
.compare-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  padding: 4px;
}

.compare-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.compare-models-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.picker-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.model-picker {
  flex: 1;
  min-width: 280px;
}

.compare-input-row :deep(.el-textarea__inner) {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.compare-options {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.compare-grid {
  display: grid;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
}

.compare-col {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  background: var(--bg-secondary);
  min-width: 280px;
  min-height: 0;
  overflow: hidden;
}

.col-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.col-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.col-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.answer-text:empty::after {
  content: '等待生成...';
  color: var(--text-secondary);
}

.error-text {
  color: var(--danger, #f56c6c);
}

.col-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}

.compare-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
