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
  };
  file: {
    pickFiles(options?: { title?: string }): Promise<DesktopResponse<DesktopPickResult>>;
    pickDirectory(options?: { title?: string; defaultPath?: string }): Promise<DesktopResponse<{ canceled: boolean; path: string }>>;
    readAsBase64(filePath: string): Promise<DesktopResponse<DesktopFilePayload>>;
    saveExport(payload: {
      defaultName?: string;
      content?: string;
      base64?: string;
    }): Promise<DesktopResponse<{ canceled: boolean; filePath?: string }>>;
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
  events: {
    onHiddenToTray(cb: (payload: { at: number }) => void): () => void;
    onQuickAsk(cb: (payload: { at: number }) => void): () => void;
  };
}

declare global {
  interface Window {
    /** 仅桌面端存在；浏览器里为 undefined，业务代码必须按可选处理 */
    desktop?: DesktopApi;
  }
}
