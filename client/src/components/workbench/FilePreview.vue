<script setup lang="ts">
/**
 * FilePreview — 工作台内联预览
 *
 * 按扩展名分发：
 *   md            → marked + highlight.js 渲染（复用 MessageItem 的配置与 markdown-body 样式）
 *   docx          → 后端 mammoth 转 HTML
 *   xlsx / xlsm   → 后端 exceljs 转表格 HTML（多工作表用页签切换）
 *   html / pdf    → iframe（html 用 srcdoc + sandbox，pdf 用 blob）
 *   图片 / 音视频  → blob + img / video
 *   其余          → 交回父组件的代码查看器（fallback 插槽）
 *
 * 为什么二进制统一走 blob：iframe / img 的请求带不了 Authorization 头，
 * 直接给它们 /api/workspace/raw 的 URL 会 401；由 axios 取回再 createObjectURL
 * 就能复用现有鉴权通道，不必为预览额外开一个免鉴权口子。
 *
 * 为什么 Office 文档要在服务端转：浏览器没有任何原生渲染手段（docx/xlsx 都是 zip 包 XML），
 * 前端塞插件等于再引一套解析器；服务端转成 HTML 后，前端只做 DOMPurify 净化 + 渲染，
 * 与 /docx 保持同一套路。
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import {
  getWorkspaceFile,
  getWorkspaceRaw,
  getWorkspaceDocx,
  getWorkspaceSheet,
  type SheetPreview,
} from '@/api/workspace';

const props = defineProps<{ path: string }>();

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      try {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      } catch {
        return code;
      }
    },
  })
);
marked.setOptions({ breaks: true, gfm: true, async: false } as any);

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'];
const MEDIA_EXT = ['mp4', 'webm', 'mp3', 'wav'];
// 服务端能转成表格的 Excel 格式（xlsm 是带宏的同一套 OOXML 容器，照样能读）
const EXCEL_EXT = ['xlsx', 'xlsm'];
// 已知二进制：按文本读出来只会是一片乱码，直接说明不支持（doc/xls 另给"另存为新格式"的指引）
const BINARY_EXT = ['zip', 'rar', '7z', 'tar', 'gz', 'exe', 'dll', 'so', 'dmg', 'apk', 'bin', 'ppt', 'pptx', 'doc', 'xls'];
// 旧版 Office 二进制（BIFF/CFB）：mammoth 只吃 docx、exceljs 只吃 xlsx，给出可执行的指引而不是干巴的"不支持"
const LEGACY_NOTE: Record<string, string> = {
  doc: '旧版 .doc 是二进制格式，暂不支持预览。请在 Word 中另存为 .docx 后重试。',
  xls: '旧版 .xls 是二进制格式，暂不支持预览。请在 Excel 中另存为 .xlsx 后重试。',
};

const ext = computed(() => (props.path.split('.').pop() || '').toLowerCase());

const kind = computed(() => {
  if (ext.value === 'md' || ext.value === 'markdown') return 'markdown';
  if (ext.value === 'html' || ext.value === 'htm') return 'html';
  if (ext.value === 'pdf') return 'pdf';
  if (ext.value === 'docx') return 'word';
  if (EXCEL_EXT.includes(ext.value)) return 'excel';
  if (IMAGE_EXT.includes(ext.value)) return 'image';
  if (MEDIA_EXT.includes(ext.value)) return 'media';
  if (BINARY_EXT.includes(ext.value)) return 'binary';
  return 'code';
});

const loading = ref(false);
const error = ref('');
const htmlContent = ref('');
const blobUrl = ref('');
const wordWarnings = ref<string[]>([]);
// Excel：服务端把每个工作表转好，这里只切页签
const sheets = ref<SheetPreview[]>([]);
const sheetIndex = ref(0);
const sheetMessages = ref<string[]>([]);
// 代码类文件的文本：经 fallback 插槽交给父组件用 <pre> 渲染
const codeText = ref('');

/** 二进制提示文案：旧版 Office 优先给指引，其余给通用说明 */
const binaryNote = computed(
  () => LEGACY_NOTE[ext.value] || `该文件为二进制格式（.${ext.value}），暂不支持在工作台内预览。`
);

function revoke() {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value);
    blobUrl.value = '';
  }
}

/** responseType 为 blob 时，错误体同样是 Blob，得先读成文本才能拿到后端的 error 文案 */
async function describeError(e: any): Promise<string> {
  const d = e?.response?.data;
  if (d instanceof Blob) {
    try {
      const parsed = JSON.parse(await d.text());
      return parsed?.error || '读取失败';
    } catch {
      return '读取失败';
    }
  }
  return d?.error || e?.message || String(e);
}

async function load() {
  revoke();
  error.value = '';
  htmlContent.value = '';
  wordWarnings.value = [];
  sheets.value = [];
  sheetIndex.value = 0;
  sheetMessages.value = [];
  codeText.value = '';
  if (!props.path) return;

  loading.value = true;
  try {
    if (kind.value === 'markdown') {
      const { content } = await getWorkspaceFile(props.path);
      htmlContent.value = DOMPurify.sanitize(marked.parse(content || '') as string);
    } else if (kind.value === 'html') {
      const { content } = await getWorkspaceFile(props.path);
      htmlContent.value = content;
    } else if (kind.value === 'word') {
      const data = await getWorkspaceDocx(props.path);
      htmlContent.value = DOMPurify.sanitize(data.html || '');
      wordWarnings.value = data.messages || [];
    } else if (kind.value === 'excel') {
      const data = await getWorkspaceSheet(props.path);
      // 服务端已转义过单元格文本，这里再过一道 DOMPurify：Office 文件是外部输入，
      // 表格 HTML 里任何一处漏转义都会变成脚本注入面，纵深防御成本极低。
      sheets.value = (data.sheets || []).map((s) => ({
        ...s,
        html: DOMPurify.sanitize(s.html || '', { USE_PROFILES: { html: true } }),
      }));
      sheetMessages.value = data.messages || [];
    } else if (kind.value === 'pdf' || kind.value === 'image' || kind.value === 'media') {
      blobUrl.value = URL.createObjectURL(await getWorkspaceRaw(props.path));
    } else if (kind.value === 'code') {
      codeText.value = (await getWorkspaceFile(props.path)).content;
    }
  } catch (e: any) {
    error.value = await describeError(e);
  } finally {
    loading.value = false;
  }
}

watch(() => props.path, load, { immediate: true });
onBeforeUnmount(revoke);
</script>

<template>
  <div class="file-preview" v-loading="loading">
    <div v-if="error" class="fp-error">{{ error }}</div>

    <div v-else-if="(kind === 'markdown' || kind === 'word') && htmlContent" class="fp-scroll">
      <div class="markdown-body fp-doc" v-html="htmlContent" />
      <div v-if="wordWarnings.length" class="fp-warn">
        <div v-for="(w, i) in wordWarnings" :key="i">· {{ w }}</div>
      </div>
    </div>

    <!-- sandbox 刻意不含 allow-same-origin：预览页处于 opaque origin，脚本够不到父页面 -->
    <iframe
      v-else-if="kind === 'html' && htmlContent"
      class="fp-frame"
      sandbox="allow-scripts allow-popups allow-forms"
      :srcdoc="htmlContent"
    />

    <iframe v-else-if="kind === 'pdf' && blobUrl" class="fp-frame" :src="blobUrl" />

    <div v-else-if="kind === 'image' && blobUrl" class="fp-center">
      <img :src="blobUrl" :alt="path" />
    </div>

    <div v-else-if="kind === 'media' && blobUrl" class="fp-center">
      <video v-if="ext === 'mp4' || ext === 'webm'" :src="blobUrl" controls />
      <audio v-else :src="blobUrl" controls />
    </div>

    <div v-else-if="kind === 'excel'" class="fp-sheet-wrap">
      <div v-if="sheets.length > 1" class="fp-sheet-tabs">
        <span
          v-for="(s, i) in sheets"
          :key="s.name + i"
          class="fp-sheet-tab"
          :class="{ active: i === sheetIndex }"
          @click="sheetIndex = i"
        >{{ s.name }}</span>
      </div>
      <div class="fp-sheet-scroll">
        <div class="fp-sheet" v-html="sheets[sheetIndex]?.html || ''" />
      </div>
      <div v-if="sheetMessages.length" class="fp-warn">
        <div v-for="(m, i) in sheetMessages" :key="i">· {{ m }}</div>
      </div>
    </div>

    <div v-else-if="kind === 'binary'" class="fp-note">
      {{ binaryNote }}
    </div>

    <slot v-else name="fallback" :text="codeText" />
  </div>
</template>

<style scoped>
.file-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.fp-scroll {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
  min-height: 0;
}
.fp-doc {
  max-width: 900px;
  margin: 0 auto;
}
.fp-frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
  min-height: 0;
}
.fp-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 12px;
  min-height: 0;
}
.fp-center img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.fp-center video {
  max-width: 100%;
  max-height: 100%;
}
.fp-error {
  padding: 16px;
  font-size: 13px;
  color: var(--el-color-danger);
}
.fp-warn {
  margin-top: 16px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
}
.fp-note {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* ---- Excel：表格线/字号由这里统一管，单元格的粗体/底色等文件自带样式走行内 style ---- */
.fp-sheet-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.fp-sheet-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.fp-sheet-tab {
  padding: 3px 12px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px 4px 0 0;
  color: var(--el-text-color-secondary);
  user-select: none;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-sheet-tab:hover {
  color: var(--el-color-primary);
}
.fp-sheet-tab.active {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
  font-weight: 600;
}
.fp-sheet-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
  padding: 12px;
}
.fp-sheet :deep(table.sheet-table) {
  border-collapse: collapse;
  font-size: 12px;
  color: var(--el-text-color-primary);
}
.fp-sheet :deep(td) {
  /* Excel 里的长文本默认不换行，预览里必须允许换行，否则表格会撑到天上去 */
  border: 1px solid var(--el-border-color-lighter);
  padding: 3px 8px;
  white-space: pre-wrap;
  word-break: break-word;
  min-width: 40px;
}
</style>
