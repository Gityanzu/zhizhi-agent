<script setup lang="ts">
/**
 * MessageArtifacts — 消息末尾的「生成的文件」卡片列表
 *
 * 数据来自服务端 messages.artifacts：Agent 的文件工具（create_file / write_file /
 * append_file）写入成功后由**工具执行处**登记真正的绝对路径，因此刷新页面后依然在，
 * 也不需要前端拿工具入参去猜路径。
 *
 * 交互（对齐主流本地 Agent 的产物卡）：
 *   左键 → 本地文件进工作台预览；http(s) 链接进工作台内置浏览器
 *   右键（或悬停出现的 ⋯）→ 打开所在文件夹 / 用默认应用打开 / 另存为 / 复制路径 / 添加到对话
 *
 * 桌面端专属项（打开文件夹、默认应用打开）在 Web 端直接不渲染 —— 浏览器里没有等价能力，
 * 渲染出来只会变成点一下就报错。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Files, MoreFilled, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import type { MessageArtifact } from '@/types'
import { getWorkspaceRaw } from '@/api/workspace'
import { usePreviewWindow } from '@/composables/usePreviewWindow'

const props = defineProps<{ artifacts: MessageArtifact[] }>()

const router = useRouter()
const { openPreview } = usePreviewWindow()

/* ---------------- 折叠/展开：两列 × 两行，超出收起 ---------------- */
// 收起时最多展示 4 张卡片（两列两行），更多则收进「展开」
const COLLAPSED_COUNT = 4
const expanded = ref(false)
const needsToggle = computed(() => props.artifacts.length > COLLAPSED_COUNT)
const visibleArtifacts = computed(() =>
  expanded.value || !needsToggle.value ? props.artifacts : props.artifacts.slice(0, COLLAPSED_COUNT)
)
// 刻意不用 useDesktop()：那个组合式函数会在挂载时拉取应用信息/后端状态/更新状态并订阅推送，
// 而本组件在一条会话里可能出现很多个（每条含产物的消息一个），没必要为此打这么多次 IPC。
// 桌面能力是否存在在运行期不会变，直接探一次即可。
const desktop = typeof window !== 'undefined' ? window.desktop : undefined
const isDesktop = Boolean(desktop?.isDesktop)

/* ---------------- 展示层：图标 / 大小 / 类型 ---------------- */

const KIND_STYLE: Record<string, { bg: string; text: string }> = {
  code: { bg: '#e8f0fe', text: '#1a73e8' },
  doc: { bg: '#e6f0ff', text: '#2b579a' },
  sheet: { bg: '#e6f6ec', text: '#1e7b45' },
  slides: { bg: '#fdeee2', text: '#c05a17' },
  pdf: { bg: '#fdeaea', text: '#c0392b' },
  image: { bg: '#f1eafd', text: '#6b3fd4' },
  media: { bg: '#e9f6f8', text: '#0f7b8a' },
  archive: { bg: '#fdf4e3', text: '#9a6b12' },
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
  pptx: 'slides', ppt: 'slides',
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', ico: 'image',
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

/** 徽标文字：短扩展名直接显示，长的（xlsx/html）也照显示，超过 4 字符才截断 */
function badgeOf(a: MessageArtifact): string {
  const ext = extOf(a)
  return ext.length <= 4 ? ext : ext.slice(0, 4)
}

function formatSize(bytes?: number): string {
  if (typeof bytes !== 'number' || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const totalText = computed(() => `${props.artifacts.length} 个文件`)

/* ---------------- 打开 ---------------- */

/** 在工作台里的打开方式：链接走内置浏览器，本地文件走预览 */
function targetRoute(a: MessageArtifact) {
  return a.kind === 'url'
    ? { path: '/code-workbench', query: { url: a.path } }
    : { path: '/code-workbench', query: { path: a.path } }
}

function openArtifact(a: MessageArtifact) {
  // 首页三栏布局挂了右侧资源面板：直接在面板内打开，不整页跳走。
  // 面板不存在（如旧版布局/其他宿主页面）时回退到工作台路由。
  if ((window as any).__hasResourcePanel) {
    window.dispatchEvent(
      new CustomEvent('open-resource', {
        detail: a.kind === 'url' ? { url: a.path } : { path: a.path },
      })
    )
    return
  }
  router.push(targetRoute(a)).catch(() => {})
}

/** ⋯ 按钮：转发一次 contextmenu，复用同一套右键菜单，避免把菜单项写两遍 */
function showMenuFromButton(e: MouseEvent) {
  e.stopPropagation()
  const card = (e.currentTarget as HTMLElement | null)?.closest('.artifact-card')
  card?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
}

/* ---------------- 菜单动作 ---------------- */

async function copyText(text: string, tip: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(tip)
  } catch {
    ElMessage.warning('复制失败，请手动选取路径')
  }
}

/** 添加到对话：交给 ChatArea 去插入输入框（它才是输入的持有者） */
function addToChat(a: MessageArtifact) {
  window.dispatchEvent(new CustomEvent('attach-file-to-input', { detail: { path: a.path } }))
  ElMessage.success('已添加到输入框')
}

/** Web 端降级：产物本来就在服务器上，用浏览器的下载能力带回家 */
async function downloadInBrowser(a: MessageArtifact) {
  const blob = await getWorkspaceRaw(a.path)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = a.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 交给浏览器接管后再释放，避免下载被中断
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function saveAs(a: MessageArtifact) {
  try {
    if (isDesktop && desktop) {
      // 桌面端让主进程直接复制文件：产物可能是大文件，转 base64 过 IPC 会让内存翻倍
      const res = await desktop.file.copyTo(a.path, a.name)
      if (!res.ok) {
        ElMessage.error(res.error || '另存为失败')
        return
      }
      if (!res.data?.canceled) {
        ElMessage.success('已另存')
        if (res.data?.filePath) desktop.file.showInFolder(res.data.filePath)
      }
      return
    }
    await downloadInBrowser(a)
  } catch (e: any) {
    ElMessage.error(e?.message || '另存为失败')
  }
}

async function onCommand(command: string | number | object, a: MessageArtifact) {
  const cmd = String(command)
  switch (cmd) {
    case 'open':
      openArtifact(a)
      break
    case 'open-folder':
      if (desktop) {
        const res = await desktop.file.showInFolder(a.path)
        if (!res.ok) ElMessage.error(res.error || '打开文件夹失败')
      }
      break
    case 'open-native':
      if (desktop) {
        const res = await desktop.file.openPath(a.path)
        if (!res.ok) ElMessage.error(res.error || '打开失败')
      }
      break
    case 'new-window':
      // 独立窗口：多屏时把预览/网页拖到另一块屏，当前窗口继续对话
      void openPreview(a.kind === 'url' ? { url: a.path } : { path: a.path, title: a.name })
      break
    case 'browser':
      // 用系统浏览器打开链接（内置浏览器由左键点击负责）
      if (desktop) {
        const res = await desktop.system.openExternal(a.path)
        if (!res.ok) ElMessage.error(res.error || '打开失败')
      } else {
        window.open(a.path, '_blank', 'noopener,noreferrer')
      }
      break
    case 'save-as':
      await saveAs(a)
      break
    case 'copy':
      await copyText(a.path, a.kind === 'url' ? '链接已复制' : '路径已复制')
      break
    case 'attach':
      addToChat(a)
      break
  }
}
</script>

<template>
  <div v-if="artifacts.length" class="artifacts">
    <div class="artifacts-head">
      <el-icon><Files /></el-icon>
      <span>生成的文件</span>
      <span class="artifacts-count">{{ totalText }}</span>
      <button
        v-if="needsToggle"
        class="artifacts-toggle"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起' : '展开' }}
        <el-icon><component :is="expanded ? ArrowUp : ArrowDown" /></el-icon>
      </button>
    </div>

    <div class="artifacts-list" :class="{ expanded }">
      <el-dropdown
        v-for="(a, i) in visibleArtifacts"
        :key="a.path + i"
        trigger="contextmenu"
        placement="bottom-start"
        @command="(cmd: any) => onCommand(cmd, a)"
      >
        <div class="artifact-card" :title="a.path" @click="openArtifact(a)">
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
          <span class="artifact-more" title="更多操作" @click="showMenuFromButton">
            <el-icon><MoreFilled /></el-icon>
          </span>
        </div>

        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="open">
              {{ a.kind === 'url' ? '用内置浏览器打开' : '在工作台预览' }}
            </el-dropdown-item>
            <el-dropdown-item command="new-window">
              {{ a.kind === 'url' ? '在新窗口打开浏览器' : '在新窗口打开预览' }}
            </el-dropdown-item>
            <el-dropdown-item v-if="a.kind === 'url' && isDesktop" command="browser">
              用系统浏览器打开
            </el-dropdown-item>
            <el-dropdown-item v-if="a.kind === 'file' && isDesktop" command="open-folder" divided>
              打开所在文件夹
            </el-dropdown-item>
            <el-dropdown-item v-if="a.kind === 'file' && isDesktop" command="open-native">
              用默认应用打开
            </el-dropdown-item>
            <el-dropdown-item v-if="a.kind === 'file'" command="save-as" divided>
              另存为
            </el-dropdown-item>
            <el-dropdown-item command="copy">
              {{ a.kind === 'url' ? '复制链接' : '复制路径' }}
            </el-dropdown-item>
            <el-dropdown-item command="attach" divided>添加到对话</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped>
.artifacts {
  margin-top: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  overflow: hidden;
}
.artifacts-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}
.artifacts-count {
  margin-left: auto;
}
.artifacts-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: none;
  background: transparent;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--el-color-primary);
  cursor: pointer;
}
.artifacts-toggle:hover {
  background: var(--el-fill-color);
}
/* 两列网格：卡片等宽，文件名超长自动省略号 */
.artifacts-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  padding: 4px;
}
/* 展开后容器定高，超出滚动，避免消息被撑得过长 */
.artifacts-list.expanded {
  max-height: 320px;
  overflow-y: auto;
}
/* 关键：卡片外层是 el-dropdown（默认 inline-flex），必须在 flex/grid 链路上放开 min-width，
   否则长文件名的 min-content 会把卡片撑出栅格列，名字盖住 meta 行 */
.artifacts-list :deep(.el-dropdown) {
  min-width: 0;
  max-width: 100%;
}
.artifact-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.artifact-card:hover {
  background: var(--el-fill-color-light);
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
  letter-spacing: 0.2px;
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
.artifact-more {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 4px;
  color: var(--el-text-color-placeholder);
  opacity: 0;
  transition: opacity 0.15s;
}
.artifact-card:hover .artifact-more {
  opacity: 1;
}
.artifact-more:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}
</style>
