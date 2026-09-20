/**
 * ipc.cjs — IPC 处理器注册中心
 *
 * 通信模型（面试必问，两条链路要分清楚）：
 *   请求-响应：ipcRenderer.invoke  →  ipcMain.handle       (返回 Promise，用于取数据/执行动作)
 *   单向推送：  webContents.send   →  ipcRenderer.on       (主进程主动通知，用于进度/状态)
 *
 * 所有 handler 统一用 safeHandler 包装：异常绝不能以 reject 的形式糊到渲染层，
 * 而是返回 { ok:false, error }，让界面能拿到可读的失败原因。
 */
const { ipcMain, dialog, shell, app, Notification, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const backend = require('./backend.cjs');
const updater = require('./updater.cjs');
const { USER_DIR, trayIconName } = require('./paths.cjs');

function safeHandler(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const data = await fn(event, ...args);
      return { ok: true, data };
    } catch (err) {
      console.error(`[ipc] ${channel} 失败:`, err);
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

function windowFrom(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

/** 推送通道统一收口，避免各处散落 webContents.send */
function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  });
}

function registerAllIpc() {
  /* ---------------- 应用信息 ---------------- */
  safeHandler('app:getInfo', () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    isPackaged: app.isPackaged,
    userData: USER_DIR.root,
    backend: backend.getState(),
    update: updater.getStatus(),
  }));

  safeHandler('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
    return true;
  });

  /* ---------------- 窗口控制（配合自定义标题栏） ---------------- */
  safeHandler('window:minimize', (e) => {
    windowFrom(e)?.minimize();
    return true;
  });
  safeHandler('window:toggleMaximize', (e) => {
    const win = windowFrom(e);
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  safeHandler('window:close', (e) => {
    windowFrom(e)?.close();
    return true;
  });
  safeHandler('window:isMaximized', (e) => Boolean(windowFrom(e)?.isMaximized()));

  /* ---------------- 本地文件能力（桌面端相对 Web 端的真正优势） ---------------- */

  // 知识库导入：走系统原生对话框，拿到的是真实路径，不受浏览器沙箱限制
  safeHandler('dialog:pickFiles', async (e, options = {}) => {
    const win = windowFrom(e);
    const result = await dialog.showOpenDialog(win, {
      title: options.title || '选择要入库的资料',
      properties: ['openFile', 'multiSelections'],
      filters: options.filters || [
        { name: '文档', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xlsx', 'json'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (result.canceled) return { canceled: true, files: [] };
    const files = result.filePaths.map((p) => {
      let size = 0;
      try {
        size = fs.statSync(p).size;
      } catch (_) {}
      return { path: p, name: path.basename(p), ext: path.extname(p).toLowerCase(), size };
    });
    return { canceled: false, files };
  });

  // 渲染层拿不到文件系统，由主进程读成 base64 回传，再在前端拼成 File 走原有上传逻辑
  safeHandler('fs:readAsBase64', async (_e, filePath, maxBytes = 200 * 1024 * 1024) => {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > maxBytes) throw new Error(`文件超过上限（${Math.round(maxBytes / 1024 / 1024)}MB）`);
    const buf = await fs.promises.readFile(filePath);
    return { base64: buf.toString('base64'), size: stat.size, name: path.basename(filePath) };
  });

  // 报告/结果导出到用户指定位置
  safeHandler('dialog:saveExport', async (e, payload) => {
    const win = windowFrom(e);
    const result = await dialog.showSaveDialog(win, {
      title: '导出到本地',
      defaultPath: path.join(USER_DIR.exports, payload.defaultName || 'export.txt'),
      filters: payload.filters || [{ name: '全部文件', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const content = payload.base64 ? Buffer.from(payload.base64, 'base64') : payload.content || '';
    await fs.promises.writeFile(result.filePath, content);
    return { canceled: false, filePath: result.filePath };
  });

  safeHandler('shell:showItemInFolder', (_e, filePath) => {
    shell.showItemInFolder(filePath);
    return true;
  });

  safeHandler('shell:openExternal', (_e, url) => {
    // 只放行 http/https，杜绝 file:// 或自定义协议被诱导打开
    if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http/https 链接');
    return shell.openExternal(url);
  });

  safeHandler('shell:openPath', (_e, targetPath) => shell.openPath(targetPath));

  /* ---------------- 系统通知（长任务完成提醒） ---------------- */
  safeHandler('notify:show', (_e, { title, body } = {}) => {
    if (!Notification.isSupported()) return false;
    const iconPath = path.join(__dirname, '..', 'resources', trayIconName());
    const notification = new Notification({
      title: title || app.getName(),
      body: body || '',
      icon: fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined,
    });
    notification.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });
    notification.show();
    return true;
  });

  /* ---------------- 自动更新 ---------------- */
  safeHandler('update:check', () => updater.checkForUpdates());
  safeHandler('update:download', () => updater.downloadUpdate());
  safeHandler('update:install', () => {
    updater.quitAndInstall();
    return true;
  });
  safeHandler('update:getStatus', () => updater.getStatus());

  /* ---------------- 本地后端进程 ---------------- */
  safeHandler('backend:getStatus', () => backend.getState());
  safeHandler('backend:restart', () => backend.restartBackend());
  safeHandler('backend:ping', () => backend.pingHealth());
}

module.exports = { registerAllIpc, sendToAll };
