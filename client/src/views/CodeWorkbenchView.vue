<template>
  <div class="wb" :class="{ 'is-mobile': isMobile }">
    <header class="wb-header">
      <h1 class="logo">智知 · 代码工作台</h1>
      <el-tag v-if="treeRoot" size="small" type="info" class="wb-root">{{ treeRoot }}</el-tag>
    </header>

    <div class="wb-body">
      <!-- 左：文件树 -->
      <aside class="wb-left" v-if="!isMobile">
        <div class="wb-panel-head">
          <span>资源管理器</span>
          <el-button size="small" text @click="loadTree">刷新</el-button>
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

      <!-- 中：代码查看 + 终端 -->
      <section class="wb-center">
        <div class="wb-code-head">
          <span class="wb-code-path">{{ selectedPath || '代码查看器' }}</span>
          <el-tag v-if="fileLang" size="small">{{ fileLang }}</el-tag>
        </div>
        <div class="wb-code" v-if="selectedPath && fileContent !== null" v-loading="fileLoading">
          <pre class="wb-pre"><code>{{ fileContent }}</code></pre>
        </div>
        <div class="wb-code wb-empty" v-else>
          <p>从左侧选择文件查看，或在右侧对话中让 Agent 修改代码后刷新查看。</p>
        </div>
        <div class="wb-terminal">
          <div class="wb-terminal-head">执行终端</div>
          <div class="wb-terminal-body">
            <div v-for="(line, i) in toolLines" :key="i" class="wb-term-line">{{ line }}</div>
            <div v-if="!toolLines.length" class="wb-term-hint">
              会话中的工具调用会显示在这里（git / 文件读写 / 代码检索…）
            </div>
          </div>
        </div>
      </section>

      <!-- 右：对话 -->
      <aside class="wb-right">
        <ChatArea />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useIsMobile } from '@/composables/useIsMobile';
import { useChatStore } from '@/stores/chat';
import ChatArea from '@/components/chat/ChatArea.vue';
import FileTree from '@/components/workbench/FileTree.vue';
import { getWorkspaceTree, getWorkspaceFile, type TreeNode } from '@/api/workspace';

const { isMobile } = useIsMobile();
const chatStore = useChatStore();

const tree = ref<TreeNode | null>(null);
const treeRoot = computed(() => tree.value?.path || '');
const expanded = ref<Set<string>>(new Set());
const treeLoading = ref(false);
const selectedPath = ref<string>('');
const fileContent = ref<string | null>(null);
const fileLang = ref<string>('');
const fileLoading = ref(false);

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

async function openFile(p: string) {
  selectedPath.value = p;
  fileLoading.value = true;
  try {
    const data = await getWorkspaceFile(p);
    fileContent.value = data.content;
    fileLang.value = data.language;
  } catch (e: any) {
    fileContent.value = `读取失败：${e?.response?.data?.error || e?.message || e}`;
    fileLang.value = '';
  } finally {
    fileLoading.value = false;
  }
}

// 从会话消息中提取工具调用，作为"执行终端"流水
const toolLines = computed(() => {
  const lines: string[] = [];
  for (const m of chatStore.messages as any[]) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        const name = tc.function?.name || tc.name || 'tool';
        const arg = tc.function?.arguments || '';
        const a = typeof arg === 'string' ? arg : JSON.stringify(arg);
        lines.push(`▶ 调用 ${name}  ${a.length > 80 ? a.slice(0, 80) + '…' : a}`);
      }
    } else if (m.role === 'tool') {
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      lines.push(`◀ ${c.length > 120 ? c.slice(0, 120) + '…' : c}`);
    }
  }
  return lines;
});

onMounted(loadTree);
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
.wb-left {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  min-height: 0;
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
.wb-center {
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
.wb-code-path {
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
.wb-terminal {
  height: 200px;
  flex-shrink: 0;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #d4d4d4;
}
.wb-terminal-head {
  padding: 4px 12px;
  font-size: 12px;
  color: #9cdcfe;
  border-bottom: 1px solid #333;
}
.wb-terminal-body {
  flex: 1;
  overflow: auto;
  padding: 6px 12px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
}
.wb-term-line {
  white-space: pre-wrap;
  word-break: break-all;
}
.wb-term-hint {
  color: #6a9955;
}
.wb-right {
  width: 400px;
  flex-shrink: 0;
  border-left: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.wb-right :deep(.chat-area) {
  flex: 1;
  min-height: 0;
}
</style>
