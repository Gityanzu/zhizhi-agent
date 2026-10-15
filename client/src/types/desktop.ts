// 桌面端能力类型定义
// 主进程通过 preload 的 contextBridge 暴露 window.desktop，
// 这里把它的形状描述出来，让渲染层可以安全地做能力探测与降级。
//
// 命名统一加 Desktop 前缀，避免与已有领域类型（chat / agent / model 等）冲突。

export type DesktopBackendState =
  | 'idle'
  | 'starting'
  | 'ok'
  | 'error'
  | 'stopped'
  | 'unavailable'
  /** 远程模式：已连接用户配置的远程服务器（不拉起内嵌后端） */
  | 'remote'
  | 'remote-error';

export interface DesktopBackendStatus {
  status: DesktopBackendState;
  message: string;
  /** 是否由桌面端自己拉起的进程（false 表示复用了已在运行的后端） */
  managed: boolean;
}

export type DesktopUpdateState =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unavailable';

export interface DesktopUpdateStatus {
  state: DesktopUpdateState;
  message: string;
  version?: string;
  releaseNotes?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  at?: number;
}

export interface DesktopAppInfo {
  version: string;
  name: string;
  platform: string;
  arch: string;
  electron: string;
  chrome: string;
  node: string;
  isPackaged: boolean;
  userData: string;
  backend: DesktopBackendStatus;
  update: DesktopUpdateStatus;
}

export interface DesktopFileItem {
  /** 文件在磁盘上的绝对路径，浏览器环境拿不到这个值 */
  path: string;
  name: string;
  ext: string;
  size: number;
}

export interface DesktopPickResult {
  canceled: boolean;
  files: DesktopFileItem[];
}

export interface DesktopFilePayload {
  base64: string;
  size: number;
  name: string;
}

/** 所有 IPC 调用统一返回该结构，异常不会以 reject 的形式冒泡到页面 */
export interface DesktopResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/* ---------------- 服务器连接配置（本地内嵌 ↔ 远程后端） ---------------- */

export type DesktopServerMode = 'local' | 'remote';

export interface DesktopServerConfig {
  mode: DesktopServerMode;
  /** 远程模式下的服务器基地址（http/https，不带末尾斜杠） */
  url: string;
}

export interface DesktopServerTestResult {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
}

export interface DesktopSetServerResult {
  config: DesktopServerConfig;
  backend: DesktopBackendStatus;
}

/* ---------------- 工作台内置浏览器（主进程 WebContentsView） ---------------- */

/** 视图在窗口内容区里的矩形。CSS 像素与 Electron 的 DIP 是同一坐标系，可直接透传 */
export interface DesktopBrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopBrowserState {
  /** 视图是否已创建；为 false 时其余字段无意义 */
  exists: boolean;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** 加载失败原因（主进程 did-fail-load 归一化后的文案） */
  error: string;
}

export type DesktopBrowserAction = 'back' | 'forward' | 'reload' | 'stop';

/* ---------------- 应用菜单命令（menu.cjs → 渲染层） ---------------- */

/**
 * 主进程菜单只负责"发出什么命令"，不负责"怎么执行"。
 * 这里把可用的命令 id 收敛成一个联合类型，新增菜单项时改这里即可让
 * 分发逻辑出现编译期缺口，而不是运行时静默无响应。
 */
export type DesktopMenuCommandId =
  /** 打开设置 */
  | 'app:settings'
  /** 按 payload.path 跳转（「转到」菜单） */
  | 'app:navigate'
  /** 新建对话 */
  | 'chat:new'
  /** 打开导入对话弹窗 */
  | 'chat:import'
  /** 导出当前对话 */
  | 'chat:export'
  /** 清空输入框 */
  | 'chat:clearInput'
  /** 停止生成 */
  | 'chat:stop'
  /** 切换深色 / 浅色模式 */
  | 'view:theme'
  /** 收起/展开对话页左侧会话栏（WorkBuddy 式三栏布局开关） */
  | 'layout:toggleSidebar';

export interface DesktopMenuCommandPayload {
  /** 仅 app:navigate 使用 */
  path?: string;
}

export interface DesktopMenuCommand {
  id: DesktopMenuCommandId;
  payload?: DesktopMenuCommandPayload;
  at: number;
}

export interface DesktopApi {
  isDesktop: true;
  platform: string;
  app: {
    getInfo(): Promise<DesktopResponse<DesktopAppInfo>>;
    relaunch(): Promise<DesktopResponse<boolean>>;
  };
  window: {
    minimize(): Promise<DesktopResponse<boolean>>;
    toggleMaximize(): Promise<DesktopResponse<boolean>>;
    close(): Promise<DesktopResponse<boolean>>;
    isMaximized(): Promise<DesktopResponse<boolean>>;
    /**
     * 在独立窗口里打开预览：`path` 预览本地文件，`url` 用内置浏览器打开网址。
     * 只传资源标识，窗口地址由主进程拼接（该窗口带 preload，不能加载任意站点）。
     */
    openPreview(payload: { path?: string; url?: string; title?: string }): Promise<DesktopResponse<boolean>>;
  };
  file: {
    pickFiles(options?: { title?: string }): Promise<DesktopResponse<DesktopPickResult>>;
    pickDirectory(options?: { title?: string; defaultPath?: string }): Promise<DesktopResponse<{ canceled: boolean; path: string }>>;
    readAsBase64(filePath: string): Promise<DesktopResponse<DesktopFilePayload>>;
    saveExport(payload: {
      defaultName?: string;
      content?: string;
      base64?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }): Promise<DesktopResponse<{ canceled: boolean; filePath?: string }>>;
    /** 把已存在的本地文件另存到用户选定位置（产物卡片"另存为"），主进程内直接复制 */
    copyTo(srcPath: string, defaultName?: string): Promise<DesktopResponse<{ canceled: boolean; filePath?: string }>>;
    showInFolder(filePath: string): Promise<DesktopResponse<boolean>>;
    openPath(targetPath: string): Promise<DesktopResponse<string>>;
  };
  system: {
    openExternal(url: string): Promise<DesktopResponse<void>>;
    notify(payload: { title?: string; body?: string }): Promise<DesktopResponse<boolean>>;
  };
  update: {
    check(): Promise<DesktopResponse<DesktopUpdateStatus>>;
    download(): Promise<DesktopResponse<DesktopUpdateStatus>>;
    install(): Promise<DesktopResponse<boolean>>;
    getStatus(): Promise<DesktopResponse<DesktopUpdateStatus>>;
    onStatus(cb: (status: DesktopUpdateStatus) => void): () => void;
  };
  backend: {
    getStatus(): Promise<DesktopResponse<DesktopBackendStatus>>;
    restart(): Promise<DesktopResponse<DesktopBackendStatus>>;
    ping(): Promise<DesktopResponse<boolean>>;
    onStatus(cb: (status: DesktopBackendStatus) => void): () => void;
  };
  server: {
    getConfig(): Promise<DesktopResponse<DesktopServerConfig>>;
    setConfig(config: DesktopServerConfig): Promise<DesktopResponse<DesktopSetServerResult>>;
    test(url: string): Promise<DesktopResponse<DesktopServerTestResult>>;
  };
  /**
   * 内置浏览器。真正的网页是主进程的原生视图，不是页面里的 iframe，
   * 所以渲染层必须主动上报 bounds，并在离开页签时 setVisible(false)。
   */
  browser: {
    create(payload: { url?: string; bounds?: DesktopBrowserBounds }): Promise<DesktopResponse<DesktopBrowserState>>;
    setBounds(bounds: DesktopBrowserBounds): Promise<DesktopResponse<boolean>>;
    setVisible(visible: boolean): Promise<DesktopResponse<boolean>>;
    navigate(url: string): Promise<DesktopResponse<boolean>>;
    action(kind: DesktopBrowserAction): Promise<DesktopResponse<boolean>>;
    destroy(): Promise<DesktopResponse<boolean>>;
    getState(): Promise<DesktopResponse<DesktopBrowserState>>;
    onState(cb: (state: DesktopBrowserState) => void): () => void;
  };
  events: {
    onHiddenToTray(cb: (payload: { at: number }) => void): () => void;
    onQuickAsk(cb: (payload: { at: number }) => void): () => void;
    /** 应用菜单命令（桌面端才有；浏览器环境不会触发） */
    onMenuCommand(cb: (command: DesktopMenuCommand) => void): () => void;
  };
}

declare global {
  interface Window {
    /** 仅桌面端存在；浏览器里为 undefined，业务代码必须按可选处理 */
    desktop?: DesktopApi;
  }
}
