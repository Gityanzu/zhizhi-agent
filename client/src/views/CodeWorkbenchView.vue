<template>
  <div class="wb" :class="{ 'is-mobile': isMobile }">
    <header class="wb-header">
      <h1 class="logo">智知 · 代码工作台</h1>
      <el-tag v-if="treeRoot" size="small" type="info" class="wb-root">{{ treeRoot }}</el-tag>
    </header>

    <div class="wb-body" ref="bodyRef">
      <!-- 左：文件树（默认收起：工作台的常态是「左对话 / 右预览」两栏，需要翻文件再展开） -->
      <aside class="wb-left" v-if="!isMobile && !treeCollapsed" :style="{ width: treeWidth + 'px' }">
        <div class="wb-panel-head">
          <span>资源管理器</span>
          <span class="wb-panel-acts">
            <el-button size="small" text @click="loadTree">刷新</el-button>
            <el-button size="small" text @click="treeCollapsed = true">收起</el-button>
          </span>
        </div>
        <div class="wb-tree" v-loading="treeLoading">
          <FileTree
            v-if="tree"
            :nodes="[tree]"
            :active-path="selectedPath"
            :expanded="expanded"
            @select="openFile"
            @toggle="toggleDir"
          />
          <div v-else class="wb-hint">
            无可用目录（桌面端默认可浏览输出根；配置 WORKSPACE_DIR 后可浏览真实代码库）
          </div>
        </div>
      </aside>

      <!-- 分隔条：资源管理器 ↔ 对话栏 -->
      <div
        v-if="!isMobile && !treeCollapsed"
        class="wb-splitter"
        :class="{ 'is-dragging': dragging === 'tree' }"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="Math.round(treeWidth)"
        :aria-valuemin="TREE_MIN"
        :aria-valuemax="TREE_MAX"
        tabindex="0"
        title="拖动调整宽度，双击恢复默认"
        @pointerdown="beginDrag('tree', $event)"
        @dblclick="resetWidth('tree')"
        @keydown.left.prevent="nudgeWidth('tree', -16)"
        @keydown.right.prevent="nudgeWidth('tree', 16)"
      ></div>

      <!-- 中：对话。窄屏不渲染 —— 三栏挤在手机宽度里必然错乱，工作台在窄屏就是纯预览页 -->
      <aside class="wb-chat" v-if="!isMobile" :style="{ width: chatWidth + 'px' }">
        <ChatArea />
      </aside>

      <!-- 分隔条：对话栏 ↔ 预览栏 -->
      <div
        v-if="!isMobile"
        class="wb-splitter"
        :class="{ 'is-dragging': dragging === 'chat' }"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="Math.round(chatWidth)"
        :aria-valuemin="CHAT_MIN"
        :aria-valuemax="CHAT_MAX"
        tabindex="0"
        title="拖动调整宽度，双击恢复默认"
        @pointerdown="beginDrag('chat', $event)"
        @dblclick="resetWidth('chat')"
        @keydown.left.prevent="nudgeWidth('chat', -16)"
        @keydown.right.prevent="nudgeWidth('chat', 16)"
      ></div>

      <!-- 右：预览 / 代码 / 内置浏览器（占主区：内容展示放在右侧，且拿到最大宽度） -->
      <section class="wb-content">
        <div class="wb-code-head">
          <el-button
            v-if="!isMobile && treeCollapsed"
            size="small"
            text
            @click="treeCollapsed = false"
          >资源管理器</el-button>
          <div class="wb-tabs">
            <span
              class="wb-tab"
              :class="{ active: centerTab === 'preview' }"
              @click="centerTab = 'preview'"
            >预览</span>
            <span
              class="wb-tab"
              :class="{ active: centerTab === 'code' }"
              @click="centerTab = 'code'"
            >代码</span>
            <span
              class="wb-tab"
              :class="{ active: centerTab === 'browser' }"
              @click="centerTab = 'browser'"
            >浏览器</span>
          </div>
          <span class="wb-code-path">
            {{ centerTab === 'browser' ? '内置浏览器' : selectedPath || '未选择文件' }}
          </span>
          <el-tag v-if="centerTab === 'code' && fileLang" size="small">{{ fileLang }}</el-tag>
          <el-button
            size="small"
            text
            :disabled="centerTab === 'browser' ? !browserUrl : !selectedPath"
            @click="openInNewWindow"
          >在新窗口打开</el-button>
        </div>

        <BuiltInBrowser v-if="centerTab === 'browser'" :initial-url="browserUrl" />

        <FilePreview
          v-else-if="centerTab === 'preview' && selectedPath"
          :key="selectedPath"
          :path="selectedPath"
        >
          <template #fallback="{ text }">
            <div class="wb-code">
              <pre class="wb-pre"><code>{{ text }}</code></pre>
            </div>
          </template>
        </FilePreview>

        <div v-else-if="centerTab === 'code' && selectedPath" class="wb-code" v-loading="fileLoading">
          <pre class="wb-pre"><code>{{ fileContent ?? '' }}</code></pre>
        </div>

        <div class="wb-code wb-empty" v-else>
          <p>从左侧选择文件预览，或切到「浏览器」打开网址。</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useIsMobile } from '@/composables/useIsMobile';
import { usePreviewWindow } from '@/composables/usePreviewWindow';
import ChatArea from '@/components/chat/ChatArea.vue';
import FileTree from '@/components/workbench/FileTree.vue';
import FilePreview from '@/components/workbench/FilePreview.vue';
import BuiltInBrowser from '@/components/workbench/BuiltInBrowser.vue';
import { getWorkspaceTree, getWorkspaceFile, type TreeNode } from '@/api/workspace';

const { openPreview } = usePreviewWindow();

const { isMobile } = useIsMobile();
const route = useRoute();

const tree = ref<TreeNode | null>(null);
const treeRoot = computed(() => tree.value?.path || '');
const expanded = ref<Set<string>>(new Set());
const treeLoading = ref(false);
const selectedPath = ref<string>('');
const fileContent = ref<string | null>(null);
const fileLang = ref<string>('');
const fileLoading = ref(false);

// 右栏视图：预览（按类型渲染）/ 代码（纯文本）/ 内置浏览器（打开网址）
const centerTab = ref<'preview' | 'code' | 'browser'>('preview');
// 内置浏览器的目标地址（来自会话卡片的 ?url=）
const browserUrl = ref('');
// 资源管理器默认收起：工作台的常态是「左对话 / 右预览」两栏，
// 需要翻文件时再展开（展开后预览栏仍占剩余宽度）
const treeCollapsed = ref(true);

/* ---------------- 分栏拖拽：资源管理器 ↔ 对话栏 ↔ 预览栏 ---------------- */

/** 分隔条本身占的宽度（CSS 里也是这个值，两处必须一致，否则 clamp 会算漏） */
const SPLITTER_W = 6;
const CONTENT_MIN = 320; // 预览栏最小宽度：拖到只剩一条缝就没有预览可言了
const CHAT_MIN = 260;
const CHAT_MAX = 720;
const TREE_MIN = 160;
const TREE_MAX = 480;

const bodyRef = ref<HTMLElement | null>(null);
/** 正在拖哪一条：'' | 'tree' | 'chat' */
const dragging = ref<'' | 'tree' | 'chat'>('');

function readStoredWidth(key: string, fallback: number): number {
  try {
    const raw = Number(localStorage.getItem(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  } catch {
    // 隐私模式等场景 localStorage 会直接抛，界面不该因此起不来
    return fallback;
  }
}

function writeStoredWidth(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* 存不了只影响下次打开，不影响本次拖拽 */
  }
}

// 两条分隔条各自记一次宽度：纯界面偏好，没必要同步到服务端
const treeWidth = ref(readStoredWidth('workbench-tree-width', 240));
const chatWidth = ref(readStoredWidth('workbench-chat-width', 360));

/** 当前真正占位的"固定栏"宽度：折叠的资源管理器不占位 */
function fixedPanelsWidth(): number {
  const tree = !isMobile.value && !treeCollapsed.value ? treeWidth.value + SPLITTER_W : 0;
  return tree;
}

/**
 * 上限都跟着容器走，而不是死守常量：窗口被拖窄时先保预览栏 ——
 * 内容展示是这个页面的目的，对话/树被压窄还能用，预览没了就白打开了。
 */
function clampChatWidth(px: number): number {
  const total = bodyRef.value?.clientWidth || 0;
  const max = total
    ? Math.max(CHAT_MIN, Math.min(CHAT_MAX, total - fixedPanelsWidth() - SPLITTER_W - CONTENT_MIN))
    : CHAT_MAX;
  return Math.min(Math.max(px, CHAT_MIN), max);
}

function clampTreeWidth(px: number): number {
  const total = bodyRef.value?.clientWidth || 0;
  // 用当前对话栏宽度代替常量 CHAT_MIN，与 clampChatWidth 对称，
  // 保证两者同时拉满时预览栏仍至少剩 CONTENT_MIN，不会溢出/横向滚动
  const max = total
    ? Math.max(TREE_MIN, Math.min(TREE_MAX, total - chatWidth.value - SPLITTER_W * 2 - CONTENT_MIN))
    : TREE_MAX;
  return Math.min(Math.max(px, TREE_MIN), max);
}

function setWidth(kind: 'tree' | 'chat', px: number) {
  if (kind === 'tree') treeWidth.value = clampTreeWidth(px);
  else chatWidth.value = clampChatWidth(px);
}

function persistWidth(kind: 'tree' | 'chat') {
  if (kind === 'tree') writeStoredWidth('workbench-tree-width', treeWidth.value);
  else writeStoredWidth('workbench-chat-width', chatWidth.value);
}

function resetWidth(kind: 'tree' | 'chat') {
  setWidth(kind, kind === 'tree' ? 240 : 360);
  persistWidth(kind);
}

function nudgeWidth(kind: 'tree' | 'chat', delta: number) {
  setWidth(kind, (kind === 'tree' ? treeWidth.value : chatWidth.value) + delta);
  persistWidth(kind);
}

/**
 * 拖拽的公共实现：两条分隔条行为完全一致（拖的是"左侧那栏的宽度"，所以方向都是 +delta），
 * 差别只在改哪个宽度。指针捕获这套逻辑抄两遍迟早只改一处。
 */
function beginDrag(kind: 'tree' | 'chat', e: PointerEvent) {
  e.preventDefault(); // 阻止原生文本选择 / 元素拖拽，避免起拖瞬间污染相邻面板
  const handle = e.currentTarget as HTMLElement;
  const startX = e.clientX;
  const startWidth = kind === 'tree' ? treeWidth.value : chatWidth.value;
  dragging.value = kind;

  // 指针捕获：手指/鼠标移出那 6px 分隔条后事件仍然回到这里，
  // 否则快速拖动会"拖丢"（事件发给了别的元素）
  handle.setPointerCapture?.(e.pointerId);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev: PointerEvent) => setWidth(kind, startWidth + (ev.clientX - startX));
  const onEnd = () => {
    dragging.value = '';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.releasePointerCapture?.(e.pointerId);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onEnd);
    handle.removeEventListener('pointercancel', onEnd);
    persistWidth(kind);
  };

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onEnd);
}

// 窗口变窄时把可能已经越界的宽度拉回来，避免预览栏被挤成负数宽度
function onWindowResize() {
  treeWidth.value = clampTreeWidth(treeWidth.value);
  chatWidth.value = clampChatWidth(chatWidth.value);
}

/**
 * 会话末尾的文件卡片跳过来的入口：?path= 打开预览，?url= 切到内置浏览器。
 * 用 query 而不是全局事件/store：这样链接可复制、可刷新、可前进后退 ——
 * 「刚才那个文件」本身就是一个地址。
 */
function applyRouteQuery() {
  const q = route.query;
  const p = typeof q.path === 'string' ? q.path : '';
  const u = typeof q.url === 'string' ? q.url : '';
  if (p) {
    centerTab.value = 'preview';
    openFile(p);
  }
  if (u) {
    browserUrl.value = u;
    centerTab.value = 'browser';
  }
}

async function loadTree() {
  treeLoading.value = true;
  try {
    const data = await getWorkspaceTree();
    tree.value = data.tree;
    if (data.root) expanded.value = new Set([data.root]);
  } catch (e) {
    console.error('加载文件树失败', e);
  } finally {
    treeLoading.value = false;
  }
}

function toggleDir(p: string) {
  const s = new Set(expanded.value);
  if (s.has(p)) s.delete(p);
  else s.add(p);
  expanded.value = s;
}

/** 把当前看的内容丢到独立窗口：多屏时把预览/网页拖到另一块屏，这边继续对话 */
function openInNewWindow() {
  if (centerTab.value === 'browser') {
    if (!browserUrl.value) {
      ElMessage.warning('先在浏览器页签打开一个网址');
      return;
    }
    void openPreview({ url: browserUrl.value });
    return;
  }
  if (!selectedPath.value) {
    ElMessage.warning('先选择一个文件');
    return;
  }
  void openPreview({ path: selectedPath.value });
}

async function openFile(p: string) {
  selectedPath.value = p;
  // 预览由 FilePreview 按类型自行加载（md/docx/pdf/图片…）；这里只准备「代码」页需要的数据
  fileContent.value = null;
  fileLang.value = (p.split('.').pop() || '').toLowerCase();
  if (centerTab.value === 'code') await loadFileContent();
}

async function loadFileContent() {
  if (!selectedPath.value) return;
  fileLoading.value = true;
  try {
    const data = await getWorkspaceFile(selectedPath.value);
    fileContent.value = data.content;
    fileLang.value = data.language || fileLang.value;
  } catch (e: any) {
    fileContent.value = `读取失败：${e?.response?.data?.error || e?.message || e}`;
    fileLang.value = '';
  } finally {
    fileLoading.value = false;
  }
}

// 从「预览」切到「代码」时才按需读文本，避免每次点文件都多请求一次
watch(centerTab, (t) => {
  if (t === 'code' && selectedPath.value && fileContent.value === null) loadFileContent();
});

// 离开工作台才真正释放内置浏览器的原生视图 —— 只是切换页签的话，
// BuiltInBrowser 会自行 hide，网页原样留着，回来即恢复。
onBeforeUnmount(() => {
  window.desktop?.browser?.destroy();
  window.removeEventListener('resize', onWindowResize);
});

onMounted(() => {
  loadTree();
  applyRouteQuery();
  // 首次渲染前容器宽度可能是 0，这里再按真实宽度校正一次存的宽度
  treeWidth.value = clampTreeWidth(treeWidth.value);
  chatWidth.value = clampChatWidth(chatWidth.value);
  window.addEventListener('resize', onWindowResize);
});

// 展开/收起资源管理器会改变可用宽度：等 DOM 更新后再校正，否则会按旧宽度算，
// 出现"对话栏 600px + 树 240px 把预览挤成一条缝"的情况
watch(treeCollapsed, async () => {
  await nextTick();
  chatWidth.value = clampChatWidth(chatWidth.value);
  treeWidth.value = clampTreeWidth(treeWidth.value);
});

// 已经在工作台里时从会话点另一个文件（工作台右侧就是对话区）：query 变了要跟着走
watch(() => route.query, applyRouteQuery);
</script>

<style scoped>
.wb {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--el-bg-color);
}
.wb-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.wb-header .logo {
  font-size: 16px;
  margin: 0;
}
.wb-root {
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wb-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
/* 左栏（资源管理器）：宽度由分隔条拖拽决定（内联 style），默认 240px，默认收起 */
.wb-left {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.wb-panel-acts {
  display: flex;
  align-items: center;
  gap: 2px;
}
.wb-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.wb-tree {
  flex: 1;
  overflow: auto;
  padding: 6px;
}
.wb-hint {
  padding: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* 右栏（预览 / 代码 / 浏览器）：占据剩余宽度，min-width:0 才能让内部滚动生效 */
.wb-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.wb-code-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  font-size: 13px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
}
.wb-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--el-fill-color);
  flex-shrink: 0;
}
.wb-tab {
  padding: 2px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  user-select: none;
}
.wb-tab:hover {
  color: var(--el-color-primary);
}
.wb-tab.active {
  background: var(--el-bg-color);
  color: var(--el-color-primary);
  font-weight: 600;
}
.wb-code-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-code {
  flex: 1;
  overflow: auto;
  padding: 12px 14px;
  margin: 0;
  background: var(--el-bg-color-page);
}
.wb-code.wb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.wb-pre {
  margin: 0;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre;
  word-break: break-all;
}
/* 中栏（对话）：宽度由分隔条拖拽决定（内联 style），默认 360px */
.wb-chat {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.wb-chat :deep(.chat-area) {
  flex: 1;
  min-height: 0;
}

/* 分隔条：视觉上只有 6px，但命中区域往两侧各扩 3px —— 细线好看不好点 */
.wb-splitter {
  position: relative;
  flex-shrink: 0;
  width: 6px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  touch-action: none; /* 触屏拖拽时别把手势当成滚动 */
}
.wb-splitter::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  right: -3px;
}
/* 常态下它就是一条分隔线；悬停/拖拽时才整条高亮 */
.wb-splitter::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: var(--el-border-color-lighter);
}
.wb-splitter:hover,
.wb-splitter.is-dragging {
  background: var(--el-color-primary-light-7);
}
.wb-splitter.is-dragging {
  background: var(--el-color-primary-light-5);
}
.wb-splitter:focus-visible {
  outline: none;
  background: var(--el-color-primary-light-3);
}
</style>
