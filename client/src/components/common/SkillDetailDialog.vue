<template>
  <el-dialog
    :model-value="modelValue"
    width="720px"
    top="6vh"
    append-to-body
    destroy-on-close
    class="skill-detail-dialog"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="detail-header">
        <span class="detail-icon">{{ detail?.skill.icon || '📚' }}</span>
        <div class="detail-title-wrap">
          <div class="detail-title">
            {{ detail?.skill.name || '技能详情' }}
            <el-tag v-if="detail?.version" size="small" effect="plain">v{{ detail.version }}</el-tag>
            <el-tag v-if="detail?.skill.source === 'file'" size="small" type="warning" effect="plain">技能库</el-tag>
          </div>
          <div class="detail-desc">{{ detail?.skill.description }}</div>
        </div>
      </div>
    </template>

    <div v-if="loading" class="detail-loading">
      <el-icon class="is-loading"><Loading /></el-icon> 加载中…
    </div>
    <div v-else-if="error" class="detail-error">{{ error }}</div>
    <template v-else-if="detail">
      <!-- 元信息 -->
      <div class="detail-meta">
        <div v-if="detail.skill.triggerKeywords?.length" class="meta-row">
          <span class="meta-label">触发词</span>
          <el-tag v-for="k in detail.skill.triggerKeywords" :key="k" size="small" type="info" effect="plain" class="meta-tag">{{ k }}</el-tag>
        </div>
        <div v-if="detail.skill.allowedTools?.length" class="meta-row">
          <span class="meta-label">工具</span>
          <el-tag v-for="t in detail.skill.allowedTools" :key="t" size="small" effect="plain" class="meta-tag">{{ t }}</el-tag>
        </div>
        <div v-else class="meta-row">
          <span class="meta-label">工具</span><span class="meta-all">全部可用</span>
        </div>
      </div>

      <el-tabs v-if="hasReferences" class="detail-tabs">
        <el-tab-pane label="技能说明">
          <div class="markdown-body detail-md" v-html="renderedBody"></div>
        </el-tab-pane>
        <el-tab-pane v-for="ref in detail.references" :key="ref.name" :label="ref.name">
          <div class="markdown-body detail-md" v-html="renderMarkdown(ref.content)"></div>
        </el-tab-pane>
      </el-tabs>
      <div v-else class="markdown-body detail-md" v-html="renderedBody"></div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { getSkillDetail } from '@/api/agent'
import type { SkillDetail } from '@/types'

const props = defineProps<{ modelValue: boolean; skillId: string }>()
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const detail = ref<SkillDetail | null>(null)
const loading = ref(false)
const error = ref('')

const marked = new Marked({ breaks: true, gfm: true } as any)
marked.setOptions({ async: false } as any)

function renderMarkdown(text: string): string {
  try {
    return DOMPurify.sanitize(marked.parse(text || '') as string)
  } catch {
    return text || ''
  }
}

const renderedBody = computed(() => renderMarkdown(detail.value?.body || ''))
const hasReferences = computed(() => (detail.value?.references?.length || 0) > 0)

watch(
  () => [props.modelValue, props.skillId] as [boolean, string],
  async ([open, id]) => {
    if (!open || !id) return
    loading.value = true
    error.value = ''
    detail.value = null
    try {
      const result = await getSkillDetail(id)
      if (result?.error) {
        error.value = result.error
      } else {
        detail.value = result
      }
    } catch (e: any) {
      error.value = e?.message || '加载技能详情失败'
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.detail-icon {
  font-size: 28px;
  line-height: 1.2;
}
.detail-title-wrap {
  min-width: 0;
}
.detail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #303133);
}
.detail-desc {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary, #909399);
}
.detail-loading,
.detail-error {
  padding: 32px 0;
  text-align: center;
  color: var(--text-secondary, #909399);
  font-size: 13px;
}
.detail-error {
  color: var(--danger-color, #f56c6c);
}
.detail-meta {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #ebeef5);
  margin-bottom: 8px;
}
.meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0;
}
.meta-label {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  flex-shrink: 0;
}
.meta-tag {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta-all {
  font-size: 12px;
  color: var(--text-secondary, #909399);
}
.detail-tabs {
  margin-top: 4px;
}
.detail-md {
  max-height: 52vh;
  overflow-y: auto;
  font-size: 14px;
  padding-right: 6px;
}
</style>
