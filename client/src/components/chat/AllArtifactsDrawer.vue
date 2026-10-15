<script setup lang="ts">
/**
 * AllArtifactsDrawer — 会话级「所有产物」右侧抽屉
 *
 * 汇总当前会话所有消息里登记的产物（按 path 去重），点击卡片跳转工作台预览。
 * 复用 MessageArtifacts 的卡片视觉，但交互简化为左键打开 + 复制路径。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Files } from '@element-plus/icons-vue'
import type { MessageArtifact } from '@/types'

const props = defineProps<{ modelValue: boolean; artifacts: MessageArtifact[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const router = useRouter()

function openArtifact(a: MessageArtifact) {
  visible.value = false
  // 首页三栏布局：优先在右侧资源面板打开；无面板宿主时回退工作台路由
  if ((window as any).__hasResourcePanel) {
    window.dispatchEvent(
      new CustomEvent('open-resource', {
        detail: a.kind === 'url' ? { url: a.path } : { path: a.path },
      })
    )
    return
  }
  router
    .push(
      a.kind === 'url'
        ? { path: '/code-workbench', query: { url: a.path } }
        : { path: '/code-workbench', query: { path: a.path } }
    )
    .catch(() => {})
}

async function copyPath(a: MessageArtifact) {
  try {
    await navigator.clipboard.writeText(a.path)
    ElMessage.success('路径已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选取路径')
  }
}

/* 展示辅助：与 MessageArtifacts 保持一致 */
const KIND_STYLE: Record<string, { bg: string; text: string }> = {
  code: { bg: '#e8f0fe', text: '#1a73e8' },
  doc: { bg: '#e6f0ff', text: '#2b579a' },
  sheet: { bg: '#e6f6ec', text: '#1e7b45' },
  slides: { bg: '#fdeee2', text: '#c05a17' },
  pdf: { bg: '#fdeaea', text: '#c0392b' },
  html: { bg: '#fff1e8', text: '#d2691e' },
  url: { bg: '#e8f0fe', text: '#1a73e8' },
  file: { bg: '#eef0f3', text: '#5a6472' },
}
const EXT_KIND: Record<string, string> = {
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', vue: 'code', py: 'code', java: 'code',
  go: 'code', rs: 'code', c: 'code', cpp: 'code', h: 'code', cs: 'code', php: 'code',
  rb: 'code', sh: 'code', json: 'code', yml: 'code', yaml: 'code', xml: 'code', sql: 'code',
  txt: 'code', log: 'code', md: 'doc', docx: 'doc', doc: 'doc',
  xlsx: 'sheet', xls: 'sheet', csv: 'sheet',
  pdf: 'pdf',
  pptx: 'slides', ppt: 'slides',
  png: 'media', jpg: 'media', jpeg: 'media', gif: 'media', webp: 'media', svg: 'media',
  mp4: 'media', webm: 'media', mp3: 'media', wav: 'media',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  html: 'html', htm: 'html',
}

function extOf(a: MessageArtifact): string {
  if (a.kind === 'url') return 'URL'
  const i = a.name.lastIndexOf('.')
  return i > 0 ? a.name.slice(i + 1).toLowerCase() : 'FILE'
}
function kindOf(a: MessageArtifact): string {
  if (a.kind === 'url') return 'url'
  return EXT_KIND[extOf(a)] || 'file'
}
function styleOf(a: MessageArtifact) {
  return KIND_STYLE[kindOf(a)] || KIND_STYLE.file
}
function badgeOf(a: MessageArtifact): string {
  const ext = extOf(a)
  return ext.length <= 4 ? ext : ext.slice(0, 4)
}
function formatSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
</script>

<template>
  <el-drawer
    v-model="visible"
    title="会话所有产物"
    direction="rtl"
    size="360px"
    :append-to-body="true"
  >
    <div class="drawer-head">
      <el-icon><Files /></el-icon>
      <span>共 {{ artifacts.length }} 个文件</span>
    </div>
    <div v-if="!artifacts.length" class="drawer-empty">当前会话还没有生成任何文件</div>
    <div v-else class="drawer-list">
      <div
        v-for="(a, i) in artifacts"
        :key="a.path + i"
        class="artifact-card"
        :title="a.path"
        @click="openArtifact(a)"
      >
        <div class="artifact-badge" :style="{ background: styleOf(a).bg, color: styleOf(a).text }">
          {{ badgeOf(a) }}
        </div>
        <div class="artifact-body">
          <div class="artifact-name">{{ a.name }}</div>
          <div class="artifact-meta">
            <span v-if="a.kind === 'url'">网页链接</span>
            <template v-else>
              <span>{{ formatSize(a.size) }}</span>
              <span class="artifact-dot">·</span>
              <span>{{ extOf(a) }}</span>
            </template>
          </div>
        </div>
        <el-button
          class="copy-btn"
          link
          size="small"
          @click.stop="copyPath(a)"
        >复制路径</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}
.drawer-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.drawer-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}
.artifact-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.artifact-card:hover {
  background: var(--el-fill-color-light);
  border-color: var(--el-border-color);
}
.artifact-badge {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.artifact-body {
  flex: 1;
  min-width: 0;
}
.artifact-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.artifact-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artifact-dot {
  margin: 0 4px;
}
.copy-btn {
  flex-shrink: 0;
}
</style>
