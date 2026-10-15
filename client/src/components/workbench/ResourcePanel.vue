<script setup lang="ts">
/**
 * ResourcePanel — 首页工作台的右侧资源面板
 *
 * 内置资源管理容器：文件树 + 各类文件预览 + 内置浏览器（可打开 URL）。
 * 通过 v-model 控制显隐；父组件可通过 ref 调用 open({ path }) / open({ url })
 * 让会话里的产物卡片/链接直接在本面板打开，而不是跳走。
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Close, Refresh, Folder, FolderOpened } from '@element-plus/icons-vue'
import FileTree from './FileTree.vue'
import FilePreview from './FilePreview.vue'
import BuiltInBrowser from './BuiltInBrowser.vue'
import { getWorkspaceTree, type TreeNode } from '@/api/workspace'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const tab = ref<'file' | 'browser'>('file')

/* ---------------- 面板宽度拖拽 ---------------- */
const PANEL_MIN = 360;
/** 默认宽度 800px：预览/网页有足够横向空间，中栏对话也还剩得下 */
const PANEL_DEFAULT = 800;
const SPLITTER_W = 6;

function readStoredWidth(): number {
  try {
    const raw = Number(localStorage.getItem('resource-panel-width'));
    return Number.isFinite(raw) && raw > 0 ? raw : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}
const panelWidth = ref(readStoredWidth());

/** 上限跟随窗口：至少给左侧对话留 420px，避免把对话挤没 */
function clampWidth(px: number): number {
  const max = Math.max(PANEL_MIN, window.innerWidth - 480);
  return Math.min(Math.max(Math.round(px), PANEL_MIN), max);
}

const dragging = ref(false);
function beginDrag(e: PointerEvent) {
  e.preventDefault();
  const handle = e.currentTarget as HTMLElement;
  const startX = e.clientX;
  const startWidth = panelWidth.value;
  dragging.value = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  handle.setPointerCapture?.(e.pointerId);

  // 面板在右侧：向左拖 = 变宽
  const onMove = (ev: PointerEvent) => {
    panelWidth.value = clampWidth(startWidth - (ev.clientX - startX));
  };
  const onEnd = () => {
    dragging.value = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.releasePointerCapture?.(e.pointerId);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onEnd);
    handle.removeEventListener('pointercancel', onEnd);
    try { localStorage.setItem('resource-panel-width', String(panelWidth.value)); } catch { /* ignore */ }
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onEnd);
}

function onWindowResize() {
  panelWidth.value = clampWidth(panelWidth.value);
}

/* ---------------- 目录树默认收起 ---------------- */
// 默认不展示文件树：预览独占面板；需要浏览目录时点「目录」按钮展开
const treeVisible = ref(false);

/* ---------------- 目录树 ↔ 预览 分栏拖拽 ---------------- */
const TREE_MIN = 160;
const TREE_DEFAULT = 320;
function readStoredTreeWidth(): number {
  try {
    const raw = Number(localStorage.getItem('resource-tree-width'));
    return Number.isFinite(raw) && raw > 0 ? raw : TREE_DEFAULT;
  } catch {
    return TREE_DEFAULT;
  }
}
const treeWidth = ref(readStoredTreeWidth());

function clampTreeWidth(px: number): number {
  // 预览区至少留 240px，否则拖出来就没法看内容了
  const max = Math.max(TREE_MIN, panelWidth.value - 240);
  return Math.min(Math.max(Math.round(px), TREE_MIN), max);
}

const treeDragging = ref(false);
function beginTreeDrag(e: PointerEvent) {
  e.preventDefault();
  const handle = e.currentTarget as HTMLElement;
  const startX = e.clientX;
  const startWidth = treeWidth.value;
  treeDragging.value = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  handle.setPointerCapture?.(e.pointerId);

  // 树在左侧：向右拖 = 变宽
  const onMove = (ev: PointerEvent) => {
    treeWidth.value = clampTreeWidth(startWidth + (ev.clientX - startX));
  };
  const onEnd = () => {
    treeDragging.value = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.releasePointerCapture?.(e.pointerId);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onEnd);
    handle.removeEventListener('pointercancel', onEnd);
    try { localStorage.setItem('resource-tree-width', String(treeWidth.value)); } catch { /* ignore */ }
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onEnd);
}

/* ---------------- 文件树 / 预览 ---------------- */
const tree = ref<TreeNode | null>(null)
const expanded = ref<Set<string>>(new Set())
const treeLoading = ref(false)
const selectedPath = ref('')

async function loadTree() {
  treeLoading.value = true
  try {
    const data = await getWorkspaceTree()
    tree.value = data.tree
    if (data.root) expanded.value = new Set([data.root])
  } catch (e) {
    console.error('加载文件树失败', e)
  } finally {
    treeLoading.value = false
  }
}

function toggleDir(p: string) {
  const s = new Set(expanded.value)
  if (s.has(p)) s.delete(p)
  else s.add(p)
  expanded.value = s
}

function openFile(p: string) {
  selectedPath.value = p
  tab.value = 'file'
}

/* ---------------- 浏览器 ---------------- */
const browserUrl = ref('')

/** 对外入口：产物卡片 / 会话链接跳转到这里打开 */
function open(target: { path?: string; url?: string }) {
  if (target.url) {
    browserUrl.value = target.url
    tab.value = 'browser'
  } else if (target.path) {
    openFile(target.path)
  }
}

defineExpose({ open })

// 目录树首次展开时才拉取；面板展开但树收起时也不请求
watch(
  [() => props.modelValue, treeVisible],
  ([visible, tv]) => {
    if (visible && tv && !tree.value) loadTree()
  },
  { immediate: true }
)

function toggleTree() {
  treeVisible.value = !treeVisible.value
  // 展开时把可能已越界（面板被拖窄过）的树宽拉回合法范围
  if (treeVisible.value) treeWidth.value = clampTreeWidth(treeWidth.value)
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div class="resource-wrap" v-if="modelValue">
    <!-- 左缘拖拽条：拖动调整面板宽度 -->
    <div
      class="rp-splitter"
      :class="{ 'is-dragging': dragging }"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      title="拖动调整宽度，双击恢复默认"
      @pointerdown="beginDrag"
      @dblclick="panelWidth = clampWidth(800)"
    ></div>

    <aside class="resource-panel" :style="{ width: panelWidth + 'px' }">
      <div class="rp-head">
        <div class="rp-tabs">
          <span class="rp-tab" :class="{ active: tab === 'file' }" @click="tab = 'file'">文件</span>
          <span class="rp-tab" :class="{ active: tab === 'browser' }" @click="tab = 'browser'">浏览器</span>
        </div>
        <div class="rp-actions">
          <el-tooltip
            v-if="tab === 'file'"
            :content="treeVisible ? '收起目录' : '打开目录'"
            placement="bottom"
          >
            <button class="rp-icon-btn" :class="{ active: treeVisible }" @click="toggleTree">
              <el-icon><component :is="treeVisible ? FolderOpened : Folder" /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip v-if="tab === 'file' && treeVisible" content="刷新" placement="bottom">
            <button class="rp-icon-btn" @click="loadTree">
              <el-icon><Refresh /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip content="收起右侧栏" placement="bottom">
            <button class="rp-icon-btn" @click="emit('update:modelValue', false)">
              <el-icon><Close /></el-icon>
            </button>
          </el-tooltip>
        </div>
      </div>

      <!-- 文件页签：目录树默认收起，点目录按钮展开；树/预览之间可拖拽调宽 -->
      <div v-if="tab === 'file'" class="rp-body" :class="treeVisible ? 'rp-file-body' : ''">
        <template v-if="treeVisible">
          <div class="rp-tree" v-loading="treeLoading" :style="{ width: treeWidth + 'px' }">
            <FileTree
              v-if="tree"
              :nodes="[tree]"
              :active-path="selectedPath"
              :expanded="expanded"
              @select="openFile"
              @toggle="toggleDir"
            />
            <div v-else class="rp-hint">无可用目录</div>
          </div>
          <div
            class="rp-tree-splitter"
            :class="{ 'is-dragging': treeDragging }"
            role="separator"
            aria-orientation="vertical"
            tabindex="0"
            title="拖动调整目录宽度，双击恢复默认"
            @pointerdown="beginTreeDrag"
            @dblclick="treeWidth = clampTreeWidth(320)"
          ></div>
        </template>
        <div class="rp-preview">
          <FilePreview v-if="selectedPath" :key="selectedPath" :path="selectedPath" />
          <div v-else class="rp-hint">点击会话中的文件卡片预览，或打开目录选择文件</div>
        </div>
      </div>

      <!-- 浏览器页签 -->
      <div v-else class="rp-body">
        <BuiltInBrowser :initial-url="browserUrl" />
      </div>
    </aside>
  </div>
</template>

<style scoped>
.resource-wrap {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
/* 左缘拖拽条：常显可见，配色跟随主题（浅色=灰条深把手，深色=深条亮把手） */
.rp-splitter {
  width: 8px;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--border-color);
  position: relative;
  transition: background 0.15s;
}
.rp-splitter::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 36px;
  border-radius: 2px;
  background: var(--scrollbar-thumb);
}
.rp-splitter:hover,
.rp-splitter.is-dragging {
  background: var(--primary-light);
}
.rp-splitter:hover::after,
.rp-splitter.is-dragging::after {
  background: var(--primary);
}
.resource-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow: hidden;
  min-width: 0;
}
.rp-icon-btn.active {
  color: var(--primary);
  background: var(--primary-light);
}
.rp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 6px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}
.rp-tabs {
  display: flex;
  gap: 2px;
}
.rp-tab {
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.rp-tab:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}
.rp-tab.active {
  color: var(--primary);
  background: var(--primary-light);
  font-weight: 600;
}
.rp-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.rp-icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.rp-icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}
.rp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rp-file-body {
  flex-direction: row;
}
.rp-tree {
  flex-shrink: 0;
  overflow: auto;
  padding: 8px;
}
/* 目录 ↔ 预览 拖拽条：与外侧拖拽条同一套主题配色 */
.rp-tree-splitter {
  width: 6px;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--border-color);
  position: relative;
  transition: background 0.15s;
}
.rp-tree-splitter::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 28px;
  border-radius: 2px;
  background: var(--scrollbar-thumb);
}
.rp-tree-splitter:hover,
.rp-tree-splitter.is-dragging {
  background: var(--primary-light);
}
.rp-tree-splitter:hover::after,
.rp-tree-splitter.is-dragging::after {
  background: var(--primary);
}
.rp-preview {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.rp-hint {
  padding: 24px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}
</style>
