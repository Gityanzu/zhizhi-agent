/**
 * paths.cjs — 桌面端路径与环境解析
 *
 * 桌面端与 Web 端最大的差异之一是"运行位置"：
 *   - 开发态：文件散落在仓库里，渲染层来自 Vite dev server
 *   - 生产态：代码被 asar 打包，可写目录只能是 userData
 * 因此所有路径必须集中解析，禁止在业务代码里硬编码相对路径。
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const ROOT = path.join(__dirname, '..'); // client/
const DIST_DIR = path.join(ROOT, 'dist'); // vite 产物
const ELECTRON_DIR = __dirname;

// 后端源码/产物位置（client 与 server 是同级目录）
const SERVER_DIR = path.join(ROOT, '..', 'server');
const SERVER_ENTRY_BUILT = path.join(SERVER_DIR, 'dist', 'index.js');
const SERVER_ENTRY_DEV = path.join(SERVER_DIR, 'src', 'index.ts');

// 开发态是否让主进程接管 Vite（用环境变量显式声明，避免误判）
const IS_DEV = !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5678';

// 后端监听端口（与 server/src/config.ts 默认值保持一致）
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 3001);
const BACKEND_HOST = '127.0.0.1';

/**
 * 用户级可写目录。桌面端一定要把"用户数据"和"安装目录"分开：
 * 安装目录在 macOS/Linux 下可能是只读的，Windows 下也在 Program Files。
 */
const USER_DIR = {
  root: app.getPath('userData'),
  data: path.join(app.getPath('userData'), 'data'),
  uploads: path.join(app.getPath('userData'), 'data', 'uploads'),
  logs: path.join(app.getPath('userData'), 'logs'),
  exports: path.join(app.getPath('userData'), 'exports'),
};

function ensureUserDirs() {
  Object.values(USER_DIR).forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

/** 后端入口：优先用编译产物，开发态回退到源码（由 ts-node-dev 承载） */
function resolveServerEntry() {
  if (fs.existsSync(SERVER_ENTRY_BUILT)) return SERVER_ENTRY_BUILT;
  if (!app.isPackaged && fs.existsSync(SERVER_ENTRY_DEV)) return SERVER_ENTRY_DEV;
  return null;
}

/** 托盘图标格式按平台区分：Windows 用 .ico，macOS/Linux 用 .png */
function trayIconName() {
  if (process.platform === 'win32') return 'icon.ico';
  return 'icon.png';
}

module.exports = {
  ROOT,
  DIST_DIR,
  ELECTRON_DIR,
  SERVER_DIR,
  IS_DEV,
  DEV_SERVER_URL,
  BACKEND_HOST,
  BACKEND_PORT,
  USER_DIR,
  ensureUserDirs,
  resolveServerEntry,
  trayIconName,
};
