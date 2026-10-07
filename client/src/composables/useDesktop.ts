import { ref, onMounted, onUnmounted } from 'vue';
import type {
  DesktopApi,
  DesktopAppInfo,
  DesktopBackendStatus,
  DesktopFileItem,
  DesktopResponse,
  DesktopServerConfig,
  DesktopServerTestResult,
  DesktopSetServerResult,
  DesktopUpdateStatus,
} from '@/types/desktop';

/**
 * useDesktop —— 桌面端能力探测与订阅
 *
 * 设计要点：
 *   1. 浏览器与桌面端共用同一套 Vue 代码，所以所有桌面能力必须可探测、
 *      可降级。window.desktop 不存在时，这里返回 isDesktop = false，
 *      调用方据此走原来的 Web 逻辑。
 *   2. 解包 { ok, data, error } 统一结构，失败时把 error 透出去而不是抛异常，
 *      避免一个桌面能力不可用就把整个页面搞崩。
 *   3. 订阅必须在 onUnmounted 里退订。preload 里的订阅方法返回了
 *      unsubscribe 函数，就是为了这一步——否则组件反复挂载会累积监听器。
 */
export function useDesktop() {
  const api: DesktopApi | undefined =
    typeof window !== 'undefined' ? window.desktop : undefined;

  const isDesktop = Boolean(api?.isDesktop);
  const appInfo = ref<DesktopAppInfo | null>(null);
  const backendStatus = ref<DesktopBackendStatus | null>(null);
  const updateStatus = ref<DesktopUpdateStatus | null>(null);
  const serverConfig = ref<DesktopServerConfig | null>(null);
  const lastError = ref<string | null>(null);

  /** 统一解包：失败时记录错误并返回 undefined，调用方不用到处写 try/catch */
  async function unwrap<T>(p?: Promise<DesktopResponse<T>>): Promise<T | undefined> {
    if (!p) return undefined;
    const res = await p;
    if (!res || !res.ok) {
      lastError.value = res?.error || '桌面能力调用失败';
      return undefined;
    }
    return res.data as T;
  }

  const disposers: Array<() => void> = [];

  onMounted(async () => {
    if (!api) return;
    appInfo.value = (await unwrap(api.app.getInfo())) ?? null;
    backendStatus.value = (await unwrap(api.backend.getStatus())) ?? null;
    updateStatus.value = (await unwrap(api.update.getStatus())) ?? null;
    serverConfig.value = (await unwrap(api.server?.getConfig())) ?? null;

    disposers.push(api.backend.onStatus((s) => (backendStatus.value = s)));
    disposers.push(api.update.onStatus((s) => (updateStatus.value = s)));
  });

  onUnmounted(() => {
    disposers.forEach((dispose) => dispose());
    disposers.length = 0;
  });

  /* ---------------- 本地文件 ---------------- */

  /** 走系统原生对话框选文件，返回的是真实磁盘路径 */
  async function pickFiles(options?: { title?: string }): Promise<DesktopFileItem[]> {
    const res = await unwrap(api?.file.pickFiles(options));
    return res?.files ?? [];
  }

  /** 选择目录（桌面端"默认输出目录"设置用），取消时返回空字符串 */
  async function pickDirectory(options?: { title?: string; defaultPath?: string }): Promise<string> {
    const res = await unwrap(api?.file.pickDirectory(options));
    if (!res || res.canceled) return '';
    return res.path || '';
  }

  /**
   * 把桌面端选中的文件转成浏览器 File 对象，
   * 这样可以直接塞进已有的上传逻辑（FormData），后端完全不用改。
   */
  async function toUploadFile(item: DesktopFileItem): Promise<File | null> {
    const payload = await unwrap(api?.file.readAsBase64(item.path));
    if (!payload) return null;
    const binary = atob(payload.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], payload.name, { type: 'application/octet-stream' });
  }

  /** 把内容导出到用户指定位置，并可选地在文件管理器里定位 */
  async function saveExport(content: string, defaultName?: string) {
    const res = await unwrap(api?.file.saveExport({ content, defaultName }));
    if (res && !res.canceled && res.filePath) {
      await api?.file.showInFolder(res.filePath);
    }
    return res;
  }

  /* ---------------- 系统集成 ---------------- */

  function notify(title: string, body: string) {
    return unwrap(api?.system.notify({ title, body }));
  }

  /* ---------------- 自动更新 ---------------- */

  const checkUpdate = () => unwrap(api?.update.check());
  const downloadUpdate = () => unwrap(api?.update.download());
  const installUpdate = () => unwrap(api?.update.install());

  const restartBackend = async () => {
    const s = await unwrap(api?.backend.restart());
    if (s) backendStatus.value = s;
    return s;
  };

  /* ---------------- 服务器连接（本地内嵌 ↔ 远程后端） ---------------- */

  /** 保存服务器配置并立即切换；失败返回 null，错误在 lastError 里 */
  async function saveServerConfig(config: DesktopServerConfig): Promise<DesktopSetServerResult | null> {
    const res = await api?.server.setConfig(config);
    if (!res?.ok || !res.data) {
      lastError.value = res?.error || '保存服务器配置失败';
      return null;
    }
    serverConfig.value = res.data.config;
    backendStatus.value = res.data.backend;
    return res.data;
  }

  /** 测试远程地址连通性；不以 lastError 记录（调用方需要拿到具体失败原因展示） */
  async function testServer(url: string): Promise<DesktopServerTestResult | null> {
    const res = await api?.server.test(url);
    if (!res?.ok) return { ok: false, error: res?.error || '测试接口调用失败' };
    return res.data ?? null;
  }

  return {
    isDesktop,
    appInfo,
    backendStatus,
    updateStatus,
    serverConfig,
    lastError,
    pickFiles,
    pickDirectory,
    toUploadFile,
    saveExport,
    notify,
    checkUpdate,
    downloadUpdate,
    installUpdate,
    restartBackend,
    saveServerConfig,
    testServer,
  };
}
