/**
 * browserView.cjs — 工作台「内置浏览器」的主进程实现
 *
 * 为什么用 WebContentsView 而不是 <webview> 标签：
 *   <webview> 是官方明确不推荐、并已列入移除计划的旧方案（它把内部实现细节当 API，
 *   有已知的稳定性与安全告警）。WebContentsView 是 Electron 30+ 的正式公开 API：
 *   原生视图 + 独立 WebContents，边界与可见性完全可控，是当前唯一的生产级选择。
 *
 * 必须理解的代价：它是**原生视图**，永远浮在渲染层之上（不存在"被某个 HTML 元素遮住"
 * 这回事）。所以：
 *   - 可见性只能靠挂载/卸载（本模块用 addChildView / removeChildView，而不是伪隐藏）；
 *   - 位置尺寸必须由渲染层上报，且窗口隐藏、最小化、切换页签时都要同步收起，
 *     否则恢复窗口后会莫名其妙浮在最上层盖住界面。
 *
 * 多窗口（主窗口 + 独立的预览窗口）：原生视图是**挂在某个窗口的 contentView 上**的，
 * 所以每个宿主窗口各持一份会话（view / bounds / visible）。会话表按宿主窗口的
 * webContents.id 索引，状态只推给所属窗口 —— 否则预览窗口里滚一下网页，
 * 主窗口的浏览器页签会跟着变地址。
 *
 * 安全：这是"能打开任意网页"的通道，加固与其它方案同等严格 ——
 * 独立 partition 隔离登录态、只放行 http(s)、window.open 转系统浏览器、权限全部拒绝。
 */
const { WebContentsView, shell } = require('electron');

/** 独立存储分区：内置浏览器的 Cookie / 登录态不与应用自身混用。
 *  各窗口共享同一分区，即同一用户在两个窗口里是同一套浏览器登录态 —— 这是期望行为。 */
const PARTITION = 'persist:zhizhi-browser';

/**
 * 宿主窗口 → 会话。
 * 用 WebContents.id 做键：窗口对象本身不可靠（重建后引用就旧了），而 id 在窗口存活期内稳定。
 * @type {Map<number, { host: import('electron').BrowserWindow, view: import('electron').WebContentsView|null, attached: boolean, visible: boolean, bounds: {x:number,y:number,width:number,height:number}, error: string }>}
 */
const sessions = new Map();

function keyOf(host) {
  return host && host.webContents && !host.webContents.isDestroyed() ? host.webContents.id : 0;
}

function hostUsable(host) {
  return !!host && !host.isDestroyed() && !!host.webContents && !host.webContents.isDestroyed();
}

/** 取（必要时建）某窗口的会话 */
function sessionFor(host) {
  const key = keyOf(host);
  if (!key) throw new Error('窗口不可用');
  let s = sessions.get(key);
  if (!s) {
    s = {
      host,
      view: null,
      attached: false,
      visible: false,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      error: '',
    };
    sessions.set(key, s);
  } else {
    // 窗口重建后 host 引用要刷新，否则 attach 到已销毁的窗口上
    s.host = host;
  }
  return s;
}

function hasView(s) {
  return !!s.view && !!s.view.webContents && !s.view.webContents.isDestroyed();
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

/** 兼容 Electron 33 的 webContents 直连方法与新版的 navigationHistory */
function history(wc) {
  return wc.navigationHistory || wc;
}

function normalizeBounds(b) {
  const n = (v) => {
    const num = Number(v);
    return Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
  };
  return { x: n(b?.x), y: n(b?.y), width: n(b?.width), height: n(b?.height) };
}

function stateOf(s) {
  if (!s || !hasView(s)) {
    return {
      exists: false,
      url: '',
      title: '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      error: '',
    };
  }
  const wc = s.view.webContents;
  const h = history(wc);
  return {
    exists: true,
    url: wc.getURL(),
    title: wc.getTitle(),
    loading: wc.isLoading(),
    canGoBack: typeof h.canGoBack === 'function' ? !!h.canGoBack() : false,
    canGoForward: typeof h.canGoForward === 'function' ? !!h.canGoForward() : false,
    error: s.error,
  };
}

/** 状态只推给所属窗口：别的窗口可能也挂着浏览器页签，不该收到无关状态 */
function pushState(s) {
  try {
    if (hostUsable(s.host)) s.host.webContents.send('browser:state', stateOf(s));
  } catch (e) {
    console.warn('[browserView] 推送状态失败:', e && e.message ? e.message : e);
  }
}

function detachView(s) {
  if (!hasView(s) || !hostUsable(s.host)) return;
  try {
    s.host.contentView.removeChildView(s.view);
  } catch (e) {
    // 窗口已销毁时 removeChildView 会抛，忽略即可
  }
  s.attached = false;
}

/** 可见性 → 挂载/卸载原生视图 */
function applyVisibility(s) {
  if (!hasView(s) || !hostUsable(s.host)) return;
  if (s.visible) {
    if (!s.attached) {
      s.host.contentView.addChildView(s.view);
      s.attached = true;
    }
    s.view.setBounds(s.bounds);
  } else if (s.attached) {
    detachView(s);
  }
}

/** 权限全拒 + 只允许 http(s) 导航 + window.open 交给系统浏览器 */
function harden(wc) {
  wc.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  wc.on('will-navigate', (event, url) => {
    if (!isHttpUrl(url)) {
      console.warn('[browserView] 已拦截非 http(s) 导航:', url);
      event.preventDefault();
    }
  });

  wc.on('will-redirect', (event, url) => {
    if (!isHttpUrl(url)) event.preventDefault();
  });

  try {
    const ses = wc.session;
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
  } catch (e) {
    console.warn('[browserView] 设置权限策略失败:', e && e.message ? e.message : e);
  }
}

function wireEvents(s, wc) {
  const push = () => pushState(s);
  wc.on('did-start-loading', () => {
    s.error = '';
    push();
  });
  wc.on('did-stop-loading', push);
  wc.on('did-navigate', push);
  wc.on('did-navigate-in-page', push);
  wc.on('page-title-updated', push);

  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // 只关心主框架：子资源失败不该弹错误页；-3 是重定向或主动中断
    if (!isMainFrame || errorCode === -3) {
      push();
      return;
    }
    s.error = `${errorDescription || '加载失败'}（${errorCode}）`;
    if (validatedURL) console.warn('[browserView] 加载失败:', s.error, validatedURL);
    push();
  });

  wc.on('render-process-gone', (_e, details) => {
    s.error = `页面进程异常退出（${details && details.reason ? details.reason : 'unknown'}）`;
    push();
  });
}

/**
 * 创建（或复用）某窗口的浏览视图并导航。
 * @param {import('electron').BrowserWindow} host 宿主窗口（由 IPC 层从 event.sender 解析）
 * @param {{ url?: string, bounds?: { x:number,y:number,width:number,height:number } }} payload
 */
function create(host, payload = {}) {
  const s = sessionFor(host);

  if (payload.bounds) s.bounds = normalizeBounds(payload.bounds);

  if (!hasView(s)) {
    s.view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
      },
    });
    s.attached = false;
    s.error = '';
    harden(s.view.webContents);
    wireEvents(s, s.view.webContents);
  }

  if (isHttpUrl(payload.url)) {
    s.error = '';
    s.view.webContents.loadURL(payload.url).catch((err) => {
      s.error = err && err.message ? err.message : String(err);
      pushState(s);
    });
  }

  s.visible = true;
  applyVisibility(s);
  pushState(s);
  return stateOf(s);
}

/** 渲染层上报位置与尺寸（CSS 像素，等价于 DIP） */
function setBounds(host, bounds) {
  const s = sessionFor(host);
  s.bounds = normalizeBounds(bounds || {});
  if (s.visible) applyVisibility(s);
}

function setVisible(host, next) {
  const s = sessionFor(host);
  s.visible = !!next;
  applyVisibility(s);
}

function navigate(host, url) {
  const s = sessionFor(host);
  if (!hasView(s)) throw new Error('浏览视图尚未创建');
  if (!isHttpUrl(url)) throw new Error('仅支持 http/https 地址');
  s.error = '';
  s.view.webContents.loadURL(url).catch((err) => {
    s.error = err && err.message ? err.message : String(err);
    pushState(s);
  });
  return true;
}

function action(host, kind) {
  const s = sessionFor(host);
  if (!hasView(s)) throw new Error('浏览视图尚未创建');
  const wc = s.view.webContents;
  const h = history(wc);
  switch (kind) {
    case 'back':
      if (typeof h.canGoBack === 'function' && h.canGoBack()) h.goBack();
      break;
    case 'forward':
      if (typeof h.canGoForward === 'function' && h.canGoForward()) h.goForward();
      break;
    case 'reload':
      s.error = '';
      wc.reload();
      break;
    case 'stop':
      wc.stop();
      break;
    default:
      throw new Error(`未知操作: ${kind}`);
  }
  return true;
}

function getState(host) {
  const key = keyOf(host);
  return stateOf(key ? sessions.get(key) : null);
}

/** 释放单个窗口的视图（窗口关闭时调用），防止残留 WebContents 泄漏 */
function destroy(host) {
  const key = keyOf(host);
  const s = key ? sessions.get(key) : null;
  if (!s) return true;
  sessions.delete(key);

  const view = s.view;
  s.view = null;
  s.visible = false;
  s.attached = false;
  s.error = '';
  try {
    if (view && view.webContents && !view.webContents.isDestroyed()) view.webContents.close();
  } catch (e) {
    console.warn('[browserView] 关闭视图失败:', e && e.message ? e.message : e);
  }
  return true;
}

/** 进程退出前统一回收（will-quit 调用） */
function destroyAll() {
  for (const [key, s] of Array.from(sessions.entries())) {
    sessions.delete(key);
    try {
      if (s.view && s.view.webContents && !s.view.webContents.isDestroyed()) s.view.webContents.close();
    } catch (e) {
      /* 退出路径上失败无所谓 */
    }
  }
  return true;
}

/** 窗口隐藏 / 最小化时必须同步收起原生视图，否则恢复窗口后它会浮在最上层 */
function onWindowVisibility(host, hidden) {
  const key = keyOf(host);
  const s = key ? sessions.get(key) : null;
  if (!s) return;
  if (hidden) detachView(s);
  else applyVisibility(s);
}

module.exports = {
  PARTITION,
  create,
  setBounds,
  setVisible,
  navigate,
  action,
  destroy,
  destroyAll,
  getState,
  onWindowVisibility,
};
