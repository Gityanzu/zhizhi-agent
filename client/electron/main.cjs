/**
 * main.cjs — Electron 主进程入口
 *
 * 职责边界（这是讲清架构的关键）：
 *   主进程 = 唯一能碰系统能力的地方：窗口与生命周期、本地文件、系统托盘、
 *            原生通知、子进程、自动更新。
 *   渲染进程 = 就是那个 Web 页面，跑的是同一套 Vue 代码，不碰任何系统 API。
 *   preload = 两者之间唯一的、可审计的通道。
 *
 * 启动顺序是有讲究的：先起本地后端和静态托管，再创建窗口。
 * 这样窗口 ready-to-show 的时候，接口已经可用，不会出现"首屏一片报错"。
 */
const { app, BrowserWindow, shell, session, globalShortcut } = require('electron');
const path = require('path');

const { IS_DEV, DEV_SERVER_URL, ensureUserDirs, USER_DIR } = require('./paths.cjs');
const { startHostServer, stopHostServer } = require('./hostServer.cjs');
const { registerAllIpc, sendToAll } = require('./ipc.cjs');
const { createTray, destroyTray } = require('./tray.cjs');
const backend = require('./backend.cjs');
const updater = require('./updater.cjs');

const QUICK_ASK_SHORTCUT = 'CommandOrControl+Shift+Space';

// 是否强制用主进程托管的静态服务加载界面（而不是 Vite dev server）。
// 用命令行参数而不是环境变量，是为了避免在 Windows/macOS 上出现
// set VAR=1 / export VAR=1 的跨平台脚本分叉。
const USE_LOCAL_HOST = process.argv.includes('--host-server') || process.env.ELECTRON_USE_DEV_SERVER === '0';
const LOAD_FROM_HOST = USE_LOCAL_HOST || !IS_DEV;

// 远程桌面 / 虚拟机 / 无 GPU 的环境下，Chromium 的 GPU 进程会反复崩溃，
// 严重时直接连带整个应用退出（GPU process isn't usable. Goodbye.）。
// 给一个显式开关，让这类环境（以及远程投屏演示）能降级运行。
// 注意：disableHardwareAcceleration 必须在 ready 事件之前调用才生效。
if (process.env.ELECTRON_DISABLE_GPU === '1' || process.argv.includes('--no-gpu')) {
  app.disableHardwareAcceleration();
  console.log('[main] 已禁用硬件加速（GPU 降级模式）');
}

let mainWindow = null;
let isQuitting = false;
let hostOrigin = '';

function getMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f5f7fa',
    title: '智知 - 企业知识库智能问答 Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // 下面三行是桌面端安全的底线，不要让渲染进程直接拥有 Node 能力
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  // 首帧就绪再显示，避免白屏闪烁
  win.once('ready-to-show', () => win.show());

  // 外链一律交给系统浏览器，不在应用内开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 阻断页面被导航到外部站点（防钓鱼式跳转）
  win.webContents.on('will-navigate', (event, url) => {
    const allowedPrefix = LOAD_FROM_HOST ? hostOrigin : DEV_SERVER_URL;
    if (allowedPrefix && !url.startsWith(allowedPrefix)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  // 只授予必要权限，其余一律拒绝
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['notifications', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
  });

  // 常用的调试快捷键：Ctrl/Cmd+Shift+I 打开 DevTools
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key.toLowerCase() === 'i' && input.shift && (input.control || input.meta)) {
      win.webContents.toggleDevTools();
    }
  });

  const target = LOAD_FROM_HOST ? hostOrigin : DEV_SERVER_URL;
  win.loadURL(target);

  // 开发态常见事故：Vite 没起就打开了 Electron。给一个能看懂的提示页，而不是白屏
  win.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL) => {
    console.error(`[main] 加载失败 ${errorCode} ${errorDesc} -> ${validatedURL}`);
    const hint = IS_DEV
      ? '<p>开发模式需要 Vite dev server。请先在 <code>client/</code> 下执行 <code>npm run dev</code>，再执行 <code>npm run electron:dev</code>。</p>'
      : '<p>前端构建产物缺失或加载失败，请检查 <code>dist/</code> 是否随包一起发布。</p>';
    win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<body style="font-family:system-ui;padding:48px;color:#333">
             <h2>界面加载失败</h2><p>${errorDesc}（${errorCode}）</p>${hint}
           </body>`
        )
    );
  });

  // 关闭窗口不退出：桌面端定位是常驻工具，交给托盘
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
      sendToAll('app:hiddenToTray', { at: Date.now() });
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

/* ------------------------- 单实例锁 ------------------------- */
// 用户重复点击图标时，激活已有窗口而不是再开一个进程（否则本地后端会抢端口）
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    // Windows 上要显式设置 AppUserModelID，否则原生通知显示的是 electron.app.*
    if (process.platform === 'win32') app.setAppUserModelId('com.huxin.zhizhiagent');

    ensureUserDirs();
    registerAllIpc();

    // 更新状态要能推到界面
    updater.setBroadcaster((channel, payload) => sendToAll(channel, payload));
    updater.initUpdater();

    // 后端状态变化同样推送，界面可以据此提示"本地服务未就绪"
    backend.onStatusChange((state) => sendToAll('backend:status', state));

    // 生产态由主进程托管前端静态资源与 /api 反向代理；开发态直接连 Vite
    if (LOAD_FROM_HOST) {
      const host = await startHostServer();
      hostOrigin = host.origin;
      console.log('[main] 本地托管服务:', hostOrigin);
    }

    mainWindow = createWindow();

    // 后端不阻塞窗口显示：先把界面给用户，起来了再通知
    backend.ensureBackend().then((state) => {
      console.log('[main] 本地后端状态:', state.status, state.message);
    });

    const tray = createTray(getMainWindow, {
      onQuickAsk: () => sendToAll('shortcut:quickAsk', { at: Date.now() }),
      onCheckUpdate: () => updater.checkForUpdates(),
      onQuit: () => {
        isQuitting = true;
        app.quit();
      },
    });
    if (!tray) console.warn('[main] 托盘不可用，已降级为不常驻模式');

    // 全局快捷键唤起（被占用时不报错，只是不生效）
    const registered = globalShortcut.register(QUICK_ASK_SHORTCUT, () => {
      const win = getMainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        sendToAll('shortcut:quickAsk', { at: Date.now() });
      }
    });
    if (!registered) console.warn(`[main] 全局快捷键 ${QUICK_ASK_SHORTCUT} 注册失败（可能已被占用）`);
  });

  /* ------------------------- 平台差异处理 ------------------------- */
  // Windows/Linux：关掉所有窗口默认退出，但我们是常驻应用，所以保留进程；
  // macOS：本身就习惯不退出，且点击 Dock 图标要能重新拉起窗口
  app.on('window-all-closed', () => {
    if (process.platform === 'linux' && !isQuitting) {
      // Linux 下托盘不保证可用，避免出现"没窗口也没托盘"的僵尸进程
      app.quit();
    }
  });

  app.on('activate', () => {
    if (!getMainWindow()) mainWindow = createWindow();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  // 退出前一定要回收资源：后端子进程、本地服务、全局快捷键
  app.on('will-quit', async (e) => {
    e.preventDefault();
    globalShortcut.unregisterAll();
    destroyTray();
    try {
      await backend.stopBackend();
    } catch (err) {
      console.error('[main] 停止本地后端失败:', err.message);
    }
    try {
      await stopHostServer();
    } catch (_) {}
    console.log('[main] 已退出，用户数据目录:', USER_DIR.root);
    app.exit(0);
  });
}
