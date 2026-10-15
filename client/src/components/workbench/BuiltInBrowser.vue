<script setup lang="ts">
/**
 * BuiltInBrowser — 工作台内置浏览器
 *
 * 桌面端：网页由主进程的 WebContentsView（原生视图）承载，不受 X-Frame-Options /
 *         CSP frame-ancestors 限制，可打开任意站点。本组件只画工具条，并把
 *         内容区的矩形上报给主进程（原生视图会精确覆盖在这个矩形上）。
 * Web 端：没有等价能力，降级为 iframe；被拒绝嵌入的站点会空白，故保留「新窗口打开」。
 *
 * 注意原生模式下 HTML 永远被压在原生视图之下：因此**加载失败时必须先 hide 视图**，
 * 否则错误提示会被一块空白网页盖住，看起来像"点了没反应"。
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { useBrowserView } from '@/composables/useBrowserView';

const props = defineProps<{ initialUrl?: string }>();

const native = useBrowserView();
const hostEl = ref<HTMLElement | null>(null);

const isNative = computed(() => native.supported.value);

/* ---- Web 端 iframe 的本地状态（原生模式下不使用） ---- */
const iframeUrl = ref(props.initialUrl || '');
const iframeKey = ref(0);
const iframeLoading = ref(false);
const iframeHistory = ref<string[]>([]);
const iframeIndex = ref(-1);

/* ---- 统一对外状态：两种承载方式共用一套工具条 ---- */
const address = ref(props.initialUrl || '');
const currentUrl = computed(() => (isNative.value ? native.state.value.url : iframeUrl.value));
const loading = computed(() => (isNative.value ? native.state.value.loading : iframeLoading.value));
const loadError = computed(() => (isNative.value ? native.state.value.error : ''));
const canGoBack = computed(() =>
  isNative.value ? native.state.value.canGoBack : iframeIndex.value > 0
);
const canForward = computed(() =>
  isNative.value
    ? native.state.value.canGoForward
    : iframeIndex.value >= 0 && iframeIndex.value < iframeHistory.value.length - 1
);

watch(currentUrl, (u) => {
  if (u) address.value = u;
});

// 原生视图加载失败时先收起它，让下面的错误提示能被看见
watch(
  () => native.state.value.error,
  (err) => {
    if (!isNative.value) return;
    if (err) native.hide();
  }
);

onMounted(async () => {
  if (!isNative.value) return;
  await nextTick();
  native.attach(hostEl.value);
  // 初始地址不能只当 ref 初值用：原生视图挂载前拿不到 bounds，
  // 必须等 attach 之后再导航，否则视图会出现在旧位置或干脆不显示
  if (props.initialUrl) open(props.initialUrl);
});

// 组件已经挂着时（工作台右侧就是对话区，从会话点第二个链接）也要能换地址
watch(
  () => props.initialUrl,
  (u) => {
    if (u && u !== currentUrl.value) open(u);
  }
);

/** 补全协议：本机地址走 http（本地服务几乎都没证书），其余默认 https */
function normalizeUrl(input: string): string {
  const s = (input || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(s)) {
    return `http://${s}`;
  }
  return `https://${s}`;
}

function open(input: string) {
  const url = normalizeUrl(input);
  if (!url) {
    ElMessage.warning('请输入网址');
    return;
  }
  address.value = url;

  if (isNative.value) {
    native.open(url).catch((e) => ElMessage.error(e?.message || '打开失败'));
    return;
  }

  iframeUrl.value = url;
  iframeLoading.value = true;
  iframeKey.value++;
  iframeHistory.value = [...iframeHistory.value.slice(0, iframeIndex.value + 1), url];
  iframeIndex.value = iframeHistory.value.length - 1;
}

function back() {
  if (isNative.value) {
    native.action('back').catch(() => {});
    return;
  }
  if (iframeIndex.value <= 0) return;
  iframeIndex.value--;
  applyIframeHistory();
}

function forward() {
  if (isNative.value) {
    native.action('forward').catch(() => {});
    return;
  }
  if (iframeIndex.value >= iframeHistory.value.length - 1) return;
  iframeIndex.value++;
  applyIframeHistory();
}

function applyIframeHistory() {
  const url = iframeHistory.value[iframeIndex.value] || '';
  iframeUrl.value = url;
  address.value = url;
  iframeLoading.value = true;
  iframeKey.value++;
}

function reload() {
  if (isNative.value) {
    native.action('reload').catch(() => {});
    return;
  }
  if (!iframeUrl.value) return;
  iframeLoading.value = true;
  iframeKey.value++;
}

/** 失败后重试：先恢复视图，再让它重新加载 */
async function retry() {
  if (!isNative.value) return;
  await native.show();
  await native.action('reload').catch(() => {});
}

/** 站点拒绝被嵌入（Web 端）或想用本机浏览器时的出口 */
async function openInSystemBrowser() {
  if (!currentUrl.value) return;
  const desktop = typeof window !== 'undefined' ? window.desktop : undefined;
  if (desktop?.isDesktop) {
    const res = await desktop.system.openExternal(currentUrl.value);
    if (!res.ok) ElMessage.error(res.error || '打开失败');
    return;
  }
  window.open(currentUrl.value, '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div class="bib">
    <div class="bib-bar">
      <el-button size="small" text :disabled="!canGoBack" title="后退" @click="back">←</el-button>
      <el-button size="small" text :disabled="!canForward" title="前进" @click="forward">→</el-button>
      <el-button size="small" text title="刷新" @click="reload">⟳</el-button>
      <el-input
        v-model="address"
        size="small"
        class="bib-input"
        placeholder="输入网址，如 localhost:3000 或 https://example.com"
        @keyup.enter="open(address)"
      />
      <el-button size="small" type="primary" @click="open(address)">打开</el-button>
      <el-button size="small" text :disabled="!currentUrl" @click="openInSystemBrowser">
        新窗口打开
      </el-button>
    </div>

    <div class="bib-body">
      <!-- 桌面端：这里只是原生视图的定位基准，本身不渲染网页 -->
      <div v-if="isNative" ref="hostEl" class="bib-host">
        <div v-if="!currentUrl" class="bib-empty">
          <p>在上面输入网址即可在工作台内打开。</p>
          <p class="bib-tip">
            桌面端使用独立的内核渲染，不受站点嵌入策略限制，可打开任意页面。
          </p>
        </div>
        <div v-else-if="loadError" class="bib-error">
          <p class="bib-error-title">页面加载失败</p>
          <p class="bib-error-desc">{{ loadError }}</p>
          <div class="bib-error-actions">
            <el-button size="small" @click="retry">重试</el-button>
            <el-button size="small" text @click="openInSystemBrowser">用系统浏览器打开</el-button>
          </div>
        </div>
      </div>

      <!-- Web 端：iframe 降级 -->
      <template v-else>
        <div v-if="iframeUrl" class="bib-fill">
          <div v-if="iframeLoading" class="bib-loading">加载中…</div>
          <iframe
            :key="iframeKey"
            class="bib-frame"
            :src="iframeUrl"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerpolicy="no-referrer"
            @load="iframeLoading = false"
          />
        </div>
        <div v-else class="bib-empty">
          <p>在上面输入网址即可在工作台内打开。</p>
          <p class="bib-tip">
            浏览器环境下用 iframe 承载，少数站点（如 Google、知乎）会用
            <code>X-Frame-Options</code> 拒绝嵌入而显示空白，请点「新窗口打开」。
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bib {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.bib-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.bib-input {
  flex: 1;
  min-width: 0;
}
.bib-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.bib-host,
.bib-fill {
  position: absolute;
  inset: 0;
}
/* 原生视图会覆盖这个矩形，所以这里不能有圆角/阴影/边框（原生视图无法被裁切） */
.bib-frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.bib-loading {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 2px 10px;
  font-size: 12px;
  border-radius: 10px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}
.bib-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.bib-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px;
  text-align: center;
}
.bib-error-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.bib-error-desc {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.bib-error-actions {
  display: flex;
  gap: 8px;
}
.bib-tip {
  font-size: 12px;
  max-width: 460px;
  line-height: 1.7;
}
</style>
