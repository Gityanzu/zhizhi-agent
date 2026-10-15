/**
 * useBrowserView — 工作台内置浏览器的渲染层控制器
 *
 * 桌面端的网页是主进程的 WebContentsView（原生视图），不在 DOM 里。渲染层能做的
 * 只有三件事：下发指令、上报矩形、订阅状态。这里把它们收敛成一个 composable，
 * 组件只管画工具条。
 *
 * 两个必须记住的点：
 *   1. 原生视图永远浮在 HTML 之上，"看不见"只能靠 setVisible(false) 真正摘掉；
 *   2. 矩形必须持续跟随（ResizeObserver + window resize + 捕获阶段 scroll），
 *      否则侧栏折叠、窗口缩放后视图会错位。
 */
import { ref, computed, onBeforeUnmount } from 'vue';
import type {
  DesktopBrowserBounds,
  DesktopBrowserState,
  DesktopBrowserAction,
} from '@/types/desktop';

const EMPTY_STATE: DesktopBrowserState = {
  exists: false,
  url: '',
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  error: '',
};

export function useBrowserView() {
  const state = ref<DesktopBrowserState>({ ...EMPTY_STATE });

  const bridge = () => (typeof window !== 'undefined' ? window.desktop?.browser : undefined);
  const supported = computed(() => !!bridge());

  let hostEl: HTMLElement | null = null;
  let observer: ResizeObserver | null = null;
  let overlayObserver: MutationObserver | null = null;
  let unsubscribe: (() => void) | null = null;
  let rafId = 0;
  let lastBounds: DesktopBrowserBounds | null = null;
  let active = false;
  let overlayCount = 0;

  function measure(): DesktopBrowserBounds | null {
    if (!hostEl) return null;
    const r = hostEl.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }

  function sameBounds(a: DesktopBrowserBounds | null, b: DesktopBrowserBounds | null) {
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }

  /** 上报矩形（节流到一帧，避免 ResizeObserver 高频回调把 IPC 打满） */
  function reportBounds() {
    rafId = 0;
    const b = measure();
    if (!b || sameBounds(b, lastBounds)) return;
    lastBounds = b;
    bridge()?.setBounds(b);
  }

  function scheduleReport() {
    if (rafId) return;
    rafId = requestAnimationFrame(reportBounds);
  }

  /** 绑定宿主元素：它是原生视图的定位基准，本身不渲染任何内容 */
  function attach(el: HTMLElement | null) {
    hostEl = el;
    if (!hostEl || !supported.value) return;
    active = true;
    if (!observer) observer = new ResizeObserver(scheduleReport);
    observer.observe(hostEl);
    window.addEventListener('resize', scheduleReport);
    // 捕获阶段才能收到内部滚动容器（侧栏、终端区）的滚动事件
    window.addEventListener('scroll', scheduleReport, true);
    watchOverlays();
    unsubscribe = bridge()?.onState((s) => {
      state.value = s;
    }) ?? null;
    // 组件可能只是被切走又切回来（视图仍在主进程里活着），先拉一次真实状态，
    // 否则 exists 会被当成 false，视图不会重新显示。
    bridge()
      ?.getState()
      .then((res) => {
        if (!res?.ok || !res.data) return;
        state.value = res.data;
        // 视图之前已创建过（只是被切走 hide 了），这里把它恢复显示；
        // 有遮罩层时不抢显示，等遮罩移除后由 watchOverlays 处理。
        if (res.data.exists && overlayCount === 0) show();
      })
      .catch(() => {
        /* 忽略：拿不到状态就按未创建处理 */
      });
    scheduleReport();
  }

  /** 立即上报一次（用于显示前对齐，避免视图先出现在旧位置） */
  async function syncBoundsNow() {
    const b = measure();
    if (!b) return;
    lastBounds = b;
    await bridge()?.setBounds(b);
  }

  async function show() {
    if (!supported.value || !active) return;
    await syncBoundsNow();
    await bridge()?.setVisible(true);
  }

  async function hide() {
    if (!supported.value) return;
    await bridge()?.setVisible(false);
  }

  /**
   * 弹窗（Element Plus 的 .el-overlay）出现时必须收起原生视图 ——
   * 它永远浮在 HTML 之上，遮罩层压不住它，弹窗会被一块网页盖住。
   * 用 MutationObserver 盯 body 的增删，谁都不需要为"有个原生视图"而写特例代码。
   */
  function watchOverlays() {
    if (typeof MutationObserver === 'undefined') return;
    overlayObserver = new MutationObserver(() => {
      const count = document.body.querySelectorAll('.el-overlay').length;
      if (count === overlayCount) return;
      overlayCount = count;
      if (count > 0) hide();
      else if (active && state.value.exists) show();
    });
    overlayObserver.observe(document.body, { childList: true, subtree: true });
  }

  /** 打开地址：未创建则 create，已创建则直接导航（保留页面历史） */
  async function open(url: string) {
    const api = bridge();
    if (!api) return;
    await syncBoundsNow();
    if (!state.value.exists) {
      const res = await api.create({ url, bounds: lastBounds ?? undefined });
      if (res && !res.ok) throw new Error(res.error || '创建内置浏览器失败');
      if (res?.data) state.value = res.data;
    } else {
      const res = await api.navigate(url);
      if (res && !res.ok) throw new Error(res.error || '打开失败');
    }
    await api.setVisible(true);
  }

  async function action(kind: DesktopBrowserAction) {
    const api = bridge();
    if (!api || !state.value.exists) return;
    const res = await api.action(kind);
    if (res && !res.ok) throw new Error(res.error || '操作失败');
  }

  /** 彻底释放视图（离开工作台时调用；只是切页签请用 hide） */
  async function destroy() {
    if (!supported.value) return;
    await bridge()?.destroy();
    state.value = { ...EMPTY_STATE };
    lastBounds = null;
  }

  function teardown() {
    active = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    observer?.disconnect();
    observer = null;
    overlayObserver?.disconnect();
    overlayObserver = null;
    overlayCount = 0;
    window.removeEventListener('resize', scheduleReport);
    window.removeEventListener('scroll', scheduleReport, true);
    unsubscribe?.();
    unsubscribe = null;
    hostEl = null;
  }

  // 组件卸载只收起视图，不销毁：切到「预览」再切回来，网页还在原处
  onBeforeUnmount(() => {
    hide();
    teardown();
  });

  return {
    supported,
    state,
    attach,
    show,
    hide,
    open,
    action,
    destroy,
  };
}
