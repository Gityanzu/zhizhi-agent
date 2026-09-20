/**
 * updater.cjs — 自动更新
 *
 * 桌面端和 Web 端最本质的差异之一：Web 端发布即生效，
 * 桌面端装出去之后，用户机器上就冻结了一个版本。
 * 所以"自动更新"不是锦上添花，是桌面端能不能持续迭代的前提。
 *
 * 方案：electron-updater + generic 静态源（也可以用 OSS / S3 / 自建 CDN）
 *   - autoDownload = false：是否下载交给用户，避免在客户侧偷偷占带宽
 *   - 全量更新走安装包；electron-builder 会同时产出 latest.yml / blockmap，
 *     支持差量下载，用户只需要拉变动的部分
 *   - 所有状态都通过 IPC 推给渲染层，界面自己决定怎么提示
 *
 * 已知的真坑（这也是面试最容易被追问的点）：
 *   - Windows：没有代码签名证书，SmartScreen 会拦安装包；升级包同理
 *   - macOS：需要 Developer ID 签名 + 公证（notarization），否则 Gatekeeper 拦截；
 *     且 electron-updater 在 mac 上要求 zip 目标存在于 build 配置里
 *   - Linux：AppImage 才支持自更新，deb/rpm 一般交给系统包管理器
 */
const { app, BrowserWindow } = require('electron');

let autoUpdater = null;
let lastStatus = { state: 'idle', message: '尚未检查更新' };
let sendToRenderer = () => {};

function broadcast(payload) {
  lastStatus = { ...lastStatus, ...payload, at: Date.now() };
  sendToRenderer('update:status', getStatus());
}

function getStatus() {
  return { ...lastStatus };
}

function setBroadcaster(fn) {
  sendToRenderer = fn;
}

function loadUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    // 懒加载：electron-updater 缺失时不应该让整个应用起不来
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (err) {
    broadcast({ state: 'unavailable', message: `未安装 electron-updater：${err.message}` });
    return null;
  }
  return autoUpdater;
}

function initUpdater() {
  const updater = loadUpdater();
  if (!updater) return;

  // 开发态默认不检查（未打包时 electron-updater 会直接抛错），
  // 用 UPDATE_FORCE_DEV=1 + dev-app-update.yml 可以在本地把整条更新链路跑通
  const forceDev = process.env.UPDATE_FORCE_DEV === '1';
  if (!app.isPackaged && !forceDev) {
    broadcast({ state: 'disabled', message: '开发模式未启用更新检查' });
    return;
  }
  if (forceDev) {
    updater.forceDevUpdateConfig = true;
    updater.updateConfigPath = require('path').join(__dirname, '..', 'dev-app-update.yml');
  }

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;

  // 私有化部署常见需求：同一份安装包要能指向不同客户的更新源。
  // 靠环境变量在运行时覆盖，比重新打包一份便宜得多。
  if (process.env.UPDATE_FEED_URL) {
    updater.setFeedURL({ provider: 'generic', url: process.env.UPDATE_FEED_URL });
    console.log('[updater] 更新源已覆盖为', process.env.UPDATE_FEED_URL);
  }

  updater.on('checking-for-update', () => broadcast({ state: 'checking', message: '正在检查更新…' }));
  updater.on('update-available', (info) =>
    broadcast({
      state: 'available',
      message: `发现新版本 ${info.version}`,
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
    })
  );
  updater.on('update-not-available', (info) =>
    broadcast({ state: 'up-to-date', message: `已是最新版本 ${info.version}`, version: info.version })
  );
  updater.on('download-progress', (p) =>
    broadcast({
      state: 'downloading',
      message: `下载中 ${Math.round(p.percent)}%`,
      percent: Math.round(p.percent),
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    })
  );
  updater.on('update-downloaded', (info) =>
    broadcast({
      state: 'downloaded',
      message: `新版本 ${info.version} 已下载，重启后生效`,
      version: info.version,
    })
  );
  updater.on('error', (err) =>
    broadcast({ state: 'error', message: `更新失败：${err == null ? 'unknown' : err.message}` })
  );

  broadcast({ state: 'idle', message: `当前版本 ${app.getVersion()}` });
}

async function checkForUpdates() {
  const updater = loadUpdater();
  if (!updater) return getStatus();
  if (!app.isPackaged && process.env.UPDATE_FORCE_DEV !== '1') {
    broadcast({ state: 'disabled', message: '开发模式未启用更新检查' });
    return getStatus();
  }
  try {
    await updater.checkForUpdates();
  } catch (err) {
    broadcast({ state: 'error', message: `检查更新失败：${err.message}` });
  }
  return getStatus();
}

async function downloadUpdate() {
  const updater = loadUpdater();
  if (!updater) return getStatus();
  try {
    await updater.downloadUpdate();
  } catch (err) {
    broadcast({ state: 'error', message: `下载失败：${err.message}` });
  }
  return getStatus();
}

function quitAndInstall() {
  const updater = loadUpdater();
  if (!updater) return;
  // isSilent=false 让用户看得到安装进度；isForceRunAfter=true 装完自动拉起
  setImmediate(() => updater.quitAndInstall(false, true));
}

module.exports = { initUpdater, setBroadcaster, checkForUpdates, downloadUpdate, quitAndInstall, getStatus };
