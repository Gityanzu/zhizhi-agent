/**
 * previewWindow.cjs — 独立预览窗口（文件预览 / 内置浏览器）
 *
 * 场景：把文件预览或网页单独开一个窗口，可以拖到第二块屏幕上，主窗口继续对话。
 *
 * 为什么 URL 由主进程拼，而不是渲染层传完整地址：
 *   这个窗口带着 preload（能碰文件系统、能驱动内置浏览器），属于**提权上下文**。
 *   渲染层只允许说"我想看哪个文件/哪个网址"，由主进程拼成同源的 /preview-window 地址；
 *   否则就等于开了一个能加载任意站点的特权窗口，等于把沙箱捅了个洞。
 *
 * 与主窗口的差异：
 *   - 关闭即真关闭（主窗口是「隐藏到托盘」常驻，预览窗口没必要跟着常驻）；
 *   - 可以多开，同一个文件开两个窗口对比也允许，用集合管理生命周期；
 *   - 外链硬化与主窗口一致：window.open 与站外导航统统丢给系统浏览器。
 */
const { BrowserWindow, shell } = require('electron');
const path = require('path');
const browserView = require('./browserView.cjs');

/** 由 main.cjs 注入：生产态是本地托管服务地址，开发态是 Vite 地址 */
let getBaseUrl = () => '';
/** 已打开的预览窗口：退出时要挨个关掉，否则 will-quit 会卡住 */
const windows = new Set();

function init(options = {}) {
  if (typeof options.getBaseUrl === 'function') getBaseUrl = options.getBaseUrl;
}

/** 与主窗口同一套外链策略：能开的只有本应用自己的页面 */
function harden(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const base = getBaseUrl();
    if (base && !url.startsWith(base)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
}

/**
 * 打开一个预览窗口。
 * @param {{ path?: string, url?: string, title?: string }} payload
 *   path = 工作台里的文件绝对路径；url = 要用内置浏览器打开的网址（两者至少给一个）
 */
function open(payload = {}) {
  const base = getBaseUrl();
  if (!base) throw new Error('本地服务尚未就绪，请稍后重试');

  const params = new URLSearchParams();
  if (typeof payload.path === 'string' && payload.path) params.set('path', payload.path);
  if (typeof payload.url === 'string' && payload.url) params.set('url', payload.url);
  if (!params.toString()) throw new Error('缺少要预览的文件或网址');

  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 520,
    minHeight: 420,
    show: false,
    backgroundColor: '#ffffff',
    title: typeof payload.title === 'string' && payload.title ? payload.title : '预览',
    // 与主窗口同源：共享 localStorage，所以登录态（token）自动带上，不需要再传凭据
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  windows.add(win);
  harden(win);

  win.once('ready-to-show', () => win.show());

  // 内置浏览器是原生视图，必须跟着窗口可见性同步收起（同主窗口，见 browserView.cjs）
  win.on('hide', () => browserView.onWindowVisibility(win, true));
  win.on('minimize', () => browserView.onWindowVisibility(win, true));
  win.on('show', () => browserView.onWindowVisibility(win, false));
  win.on('restore', () => browserView.onWindowVisibility(win, false));

  win.on('closed', () => {
    browserView.destroy(win);
    windows.delete(win);
  });

  win.loadURL(`${base.replace(/\/$/, '')}/preview-window?${params.toString()}`);
  return true;
}

/** 退出前统一关闭（will-quit 调用） */
function closeAll() {
  for (const win of Array.from(windows)) {
    windows.delete(win);
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch (e) {
      /* 退出路径上失败无所谓 */
    }
  }
}

module.exports = { init, open, closeAll };
