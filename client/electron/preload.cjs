/**
 * preload.cjs — 主进程与渲染进程之间唯一的通道
 *
 * 三条铁律（面试如果只问一个问题，大概率就是这个）：
 *   1. 绝不把 ipcRenderer 整个丢给页面。一旦丢出去，页面就能往任意 channel 发消息，
 *      等于把主进程的全部能力敞开。这里只暴露语义化的白名单方法。
 *   2. 事件订阅必须返回取消订阅函数，否则组件反复挂载会累积监听器（内存泄漏）。
 *   3. preload 里不做业务逻辑，只做"翻译"：把 IPC 的字符串 channel
 *      翻译成人能看懂的方法名。
 *
 * 渲染层拿到的是 window.desktop，全部返回 Promise，统一 { ok, data | error } 结构。
 */
const { contextBridge, ipcRenderer } = require('electron');

/** 允许渲染层订阅的主进程推送通道（白名单，防止任意 channel 监听） */
const PUSH_CHANNELS = [
  'update:status',
  'backend:status',
  'app:hiddenToTray',
  'shortcut:quickAsk',
  // 应用菜单点击后推下来的语义化命令（见 menu.cjs）
  'menu:command',
  // 内置浏览器状态（URL / 标题 / 加载中 / 可否前进后退），见 browserView.cjs
  'browser:state',
];

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel, callback) {
  if (!PUSH_CHANNELS.includes(channel)) {
    throw new Error(`未开放的推送通道: ${channel}`);
  }
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const desktop = {
  /* 应用与运行环境 */
  app: {
    getInfo: () => invoke('app:getInfo'),
    relaunch: () => invoke('app:relaunch'),
  },

  /* 窗口控制 */
  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggleMaximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:isMaximized'),
    /* 独立预览窗口：只传"要看哪个文件/哪个网址"，地址由主进程拼（见 previewWindow.cjs） */
    openPreview: (payload) => invoke('window:openPreview', payload),
  },

  /* 本地文件：桌面端相比 Web 端的实质增量 */
  file: {
    pickFiles: (options) => invoke('dialog:pickFiles', options),
    pickDirectory: (options) => invoke('dialog:pickDirectory', options),
    readAsBase64: (filePath) => invoke('fs:readAsBase64', filePath),
    saveExport: (payload) => invoke('dialog:saveExport', payload),
    copyTo: (srcPath, defaultName) => invoke('fs:copyTo', srcPath, defaultName),
    showInFolder: (filePath) => invoke('shell:showItemInFolder', filePath),
    openPath: (targetPath) => invoke('shell:openPath', targetPath),
  },

  /* 系统集成 */
  system: {
    openExternal: (url) => invoke('shell:openExternal', url),
    notify: (payload) => invoke('notify:show', payload),
  },

  /* 自动更新 */
  update: {
    check: () => invoke('update:check'),
    download: () => invoke('update:download'),
    install: () => invoke('update:install'),
    getStatus: () => invoke('update:getStatus'),
    onStatus: (cb) => subscribe('update:status', cb),
  },

  /* 本地后端进程 */
  backend: {
    getStatus: () => invoke('backend:getStatus'),
    restart: () => invoke('backend:restart'),
    ping: () => invoke('backend:ping'),
    onStatus: (cb) => subscribe('backend:status', cb),
  },

  /* 服务器连接：本地内嵌后端 ↔ 远程后端 */
  server: {
    getConfig: () => invoke('serverConfig:get'),
    setConfig: (config) => invoke('serverConfig:set', config),
    test: (url) => invoke('serverConfig:test', url),
  },

  /* 工作台内置浏览器。
   * 注意：真正的网页是主进程的 WebContentsView（原生视图），不是页面里的 iframe。
   * 渲染层只做三件事：下发指令、上报矩形（CSS 像素即 DIP）、订阅状态推送。
   * setVisible 必须与页签切换严格同步 —— 原生视图始终浮在 HTML 之上。 */
  browser: {
    create: (payload) => invoke('browser:create', payload),
    setBounds: (bounds) => invoke('browser:setBounds', bounds),
    setVisible: (visible) => invoke('browser:setVisible', visible),
    navigate: (url) => invoke('browser:navigate', url),
    action: (kind) => invoke('browser:action', kind),
    destroy: () => invoke('browser:destroy'),
    getState: () => invoke('browser:getState'),
    onState: (cb) => subscribe('browser:state', cb),
  },

  /* 主进程事件 */
  events: {
    onHiddenToTray: (cb) => subscribe('app:hiddenToTray', cb),
    onQuickAsk: (cb) => subscribe('shortcut:quickAsk', cb),
    /** 应用菜单命令：主进程只给命令 id，具体动作由渲染层决定 */
    onMenuCommand: (cb) => subscribe('menu:command', cb),
  },

  /** 是否运行在桌面端环境（用于前端做能力探测与降级） */
  isDesktop: true,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('desktop', desktop);
