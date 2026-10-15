<script setup lang="ts">
/**
 * PreviewWindowView — 独立预览窗口的内容页
 *
 * 只在独立窗口（桌面端）或新标签页（Web 端）里打开，刻意不带对话、文件树、终端：
 * 它的价值就是"把这一份东西单独放到一块屏幕上"，塞满功能反而失去意义。
 *
 * 参数：
 *   ?path=xxx  预览工作台里的本地文件（预览 / 代码 两个页签）
 *   ?url=xxx   用内置浏览器打开网址（此时整页就是浏览器）
 *
 * 注意这个窗口带着 preload（能碰文件系统），所以地址必须由主进程拼 —— 见 previewWindow.cjs。
 * Web 端这个页面也成立（内置浏览器自动降级为 iframe），只是由 window.open 打开。
 */
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { getWorkspaceFile } from '@/api/workspace';
import FilePreview from '@/components/workbench/FilePreview.vue';
import BuiltInBrowser from '@/components/workbench/BuiltInBrowser.vue';

const route = useRoute();
const desktop = typeof window !== 'undefined' ? window.desktop : undefined;

const filePath = computed(() => (typeof route.query.path === 'string' ? route.query.path : ''));
const pageUrl = computed(() => (typeof route.query.url === 'string' ? route.query.url : ''));
/** 带了网址就是"浏览器窗口"，本地文件才有 预览/代码 之分 */
const isBrowser = computed(() => !filePath.value && !!pageUrl.value);
const tab = ref<'preview' | 'code'>('preview');

const fileContent = ref<string | null>(null);
const loading = ref(false);

const title = computed(() => {
  if (filePath.value) return filePath.value.split(/[\\/]/).pop() || filePath.value;
  if (pageUrl.value) {
    try {
      return new URL(pageUrl.value).hostname;
    } catch {
      return pageUrl.value;
    }
  }
  return '预览';
});

const subtitle = computed(() => (isBrowser.value ? pageUrl.value : filePath.value));

async function loadCode() {
  if (!filePath.value || loading.value) return;
  loading.value = true;
  try {
    const data = await getWorkspaceFile(filePath.value);
    fileContent.value = data.content;
  } catch (e: any) {
    fileContent.value = `读取失败：${e?.message || e}`;
  } finally {
    loading.value = false;
  }
}

watch(tab, (v) => {
  if (v === 'code') loadCode();
});

onMounted(() => {
  document.title = `${title.value} - 预览`;
});

/* ---------------- 顶部操作：与产物卡片同一套桌面能力 ---------------- */

async function showInFolder() {
  await desktop?.file.showInFolder(filePath.value);
}

async function openNative() {
  await desktop?.file.openPath(filePath.value);
}

async function openInSystemBrowser() {
  if (desktop) await desktop.system.openExternal(pageUrl.value);
  else window.open(pageUrl.value, '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div class="pw">
    <header class="pw-head">
      <div class="pw-title-wrap">
        <div class="pw-title" :title="subtitle">{{ title }}</div>
        <div class="pw-sub" :title="subtitle">{{ subtitle }}</div>
      </div>

      <div v-if="!isBrowser" class="pw-tabs">
        <span class="pw-tab" :class="{ active: tab === 'preview' }" @click="tab = 'preview'">预览</span>
        <span class="pw-tab" :class="{ active: tab === 'code' }" @click="tab = 'code'">代码</span>
      </div>

      <div class="pw-actions">
        <el-button v-if="filePath && desktop" link size="small" @click="showInFolder">打开所在文件夹</el-button>
        <el-button v-if="filePath && desktop" link size="small" @click="openNative">用默认应用打开</el-button>
        <el-button v-if="pageUrl" link size="small" @click="openInSystemBrowser">在系统浏览器打开</el-button>
      </div>
    </header>

    <main class="pw-body">
      <BuiltInBrowser v-if="isBrowser" :initial-url="pageUrl" />

      <FilePreview v-else-if="tab === 'preview' && filePath" :key="filePath" :path="filePath">
        <template #fallback="{ text }">
          <div class="pw-code">
            <pre class="pw-pre"><code>{{ text }}</code></pre>
          </div>
        </template>
      </FilePreview>

      <div v-else-if="tab === 'code' && filePath" class="pw-code" v-loading="loading">
        <pre class="pw-pre"><code>{{ fileContent ?? '' }}</code></pre>
      </div>

      <div v-else class="pw-empty">没有要预览的内容。请带上 ?path= 或 ?url= 参数。</div>
    </main>
  </div>
</template>

<style scoped>
.pw {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--el-bg-color);
}
.pw-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.pw-title-wrap {
  min-width: 0;
  flex: 1;
}
.pw-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-sub {
  /* 路径只作定位用，不做"保留尾部"的 direction:rtl 技巧：
     那套写法会把 Windows 路径开头的 `C:\` 挪到错误一侧，得不偿失（标题已单独显示文件名） */
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--el-fill-color);
  flex-shrink: 0;
}
.pw-tab {
  padding: 2px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  user-select: none;
}
.pw-tab:hover {
  color: var(--el-color-primary);
}
.pw-tab.active {
  background: var(--el-bg-color);
  color: var(--el-color-primary);
  font-weight: 600;
}
.pw-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.pw-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pw-code {
  flex: 1;
  overflow: auto;
  padding: 12px 14px;
  margin: 0;
  background: var(--el-bg-color-page);
}
.pw-pre {
  margin: 0;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre;
  word-break: break-all;
}
.pw-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
