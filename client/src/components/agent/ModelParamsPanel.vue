<template>
  <el-drawer
    v-model="visible"
    title="模型参数调节"
    :size="isMobile ? '100%' : '420px'"
    direction="rtl"
  >
    <div class="params-panel">
      <el-alert
        title="调节参数将应用于后续对话，并自动保存到本地。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 20px;"
      />

      <!-- temperature -->
      <div class="param-item">
        <div class="param-header">
          <span class="param-name">温度 (temperature)</span>
          <span class="param-value">{{ chatStore.modelParams.temperature.toFixed(1) }}</span>
        </div>
        <el-slider
          v-model="chatStore.modelParams.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          :format-tooltip="(v: number) => v.toFixed(1)"
        />
        <div class="param-desc">控制随机性。越高越发散创意，越低越稳定保守。</div>
      </div>

      <!-- top_p -->
      <div class="param-item">
        <div class="param-header">
          <span class="param-name">核采样 (top_p)</span>
          <span class="param-value">{{ chatStore.modelParams.top_p.toFixed(2) }}</span>
        </div>
        <el-slider
          v-model="chatStore.modelParams.top_p"
          :min="0"
          :max="1"
          :step="0.05"
          :format-tooltip="(v: number) => v.toFixed(2)"
        />
        <div class="param-desc">仅从概率累积质量前 top_p 的词中采样。一般与 temperature 二调其一。</div>
      </div>

      <!-- max_tokens -->
      <div class="param-item">
        <div class="param-header">
          <span class="param-name">最大输出长度 (max_tokens)</span>
          <span class="param-value">{{ chatStore.modelParams.max_tokens }}</span>
        </div>
        <el-input-number
          v-model="chatStore.modelParams.max_tokens"
          :min="1"
          :max="32768"
          :step="256"
          style="width: 100%;"
        />
        <div class="param-desc">单次回复允许生成的最大 token 数。</div>
      </div>

      <!-- presence_penalty -->
      <div class="param-item">
        <div class="param-header">
          <span class="param-name">存在惩罚 (presence_penalty)</span>
          <span class="param-value">{{ chatStore.modelParams.presence_penalty.toFixed(1) }}</span>
        </div>
        <el-slider
          v-model="chatStore.modelParams.presence_penalty"
          :min="-2"
          :max="2"
          :step="0.1"
          :format-tooltip="(v: number) => v.toFixed(1)"
        />
        <div class="param-desc">正值鼓励讨论新话题，负值倾向重复已有话题。</div>
      </div>

      <!-- frequency_penalty -->
      <div class="param-item">
        <div class="param-header">
          <span class="param-name">频率惩罚 (frequency_penalty)</span>
          <span class="param-value">{{ chatStore.modelParams.frequency_penalty.toFixed(1) }}</span>
        </div>
        <el-slider
          v-model="chatStore.modelParams.frequency_penalty"
          :min="-2"
          :max="2"
          :step="0.1"
          :format-tooltip="(v: number) => v.toFixed(1)"
        />
        <div class="param-desc">按出现频率惩罚重复词，正值减少逐字重复。</div>
      </div>

      <div class="panel-footer">
        <el-button @click="resetDefaults">恢复默认</el-button>
        <el-button type="primary" @click="visible = false">完成</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useIsMobile } from '@/composables/useIsMobile'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const chatStore = useChatStore()
const { isMobile } = useIsMobile()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function resetDefaults() {
  chatStore.modelParams.temperature = 0.7
  chatStore.modelParams.top_p = 1
  chatStore.modelParams.max_tokens = 2048
  chatStore.modelParams.presence_penalty = 0
  chatStore.modelParams.frequency_penalty = 0
}

</script>

<style scoped>
.params-panel {
  padding: 0 4px;
}

.param-item {
  margin-bottom: 24px;
}

.param-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.param-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.param-value {
  font-size: 13px;
  color: var(--primary);
  font-weight: 600;
  min-width: 48px;
  text-align: right;
}

.param-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
  line-height: 1.5;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 32px;
}
</style>
