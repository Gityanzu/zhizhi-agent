/**
 * tray.cjs — 系统托盘与全局快捷键
 *
 * 桌面端的另一类价值：常驻。用户在浏览器里得先找到标签页，
 * 而桌面应用按一个快捷键就能唤起，这对"随时问一句"的场景差别很大。
 *
 * 跨平台差异（这里全是坑）：
 *   - Windows/Linux：托盘图标用 .ico / .png，双击通常触发显示
 *   - macOS：图标建议用 template image（纯黑+alpha），系统会自动适配深浅色；
 *     且 macOS 的托盘点击默认弹出菜单而不是切换窗口
 *   - Linux 部分桌面环境不保证托盘可用，必须能优雅降级
 *
 * 为了不依赖外部图片资源（避免打包时漏带资源导致托盘空白），
 * 这里直接用 BGRA 位图在内存里画一个图标。
 */
const { Tray, Menu, nativeImage, app } = require('electron');

const BRAND = { r: 64, g: 158, b: 255 }; // #409EFF，与 index.html 的 theme-color 一致

/** 在内存中绘制图标：圆角方块 + 中心圆点 */
function createTrayIcon(size = 32, monochrome = false) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;
  const dotR = size * 0.2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      // 圆角矩形内外判定
      const dx = Math.max(radius - px, px - (size - radius), 0);
      const dy = Math.max(radius - py, py - (size - radius), 0);
      const outsideCorner = Math.sqrt(dx * dx + dy * dy) > radius;
      if (outsideCorner) continue;

      const inDot = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) <= dotR;
      const idx = (y * size + x) * 4;

      // BGRA 顺序
      if (inDot) {
        buf[idx] = 255;
        buf[idx + 1] = 255;
        buf[idx + 2] = 255;
        buf[idx + 3] = 255;
      } else if (monochrome) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 255;
      } else {
        buf[idx] = BRAND.b;
        buf[idx + 1] = BRAND.g;
        buf[idx + 2] = BRAND.r;
        buf[idx + 3] = 255;
      }
    }
  }

  try {
    return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 1 });
  } catch (_) {
    return null;
  }
}

let tray = null;

/**
 * @param {() => BrowserWindow|null} getWindow 用 getter 而不是直接持有窗口引用，
 *        避免窗口被销毁后托盘菜单拿到过期对象。
 * @param {{ onQuickAsk?: Function, onCheckUpdate?: Function, onQuit?: Function }} handlers
 */
function createTray(getWindow, handlers = {}) {
  if (tray) return tray;

  const isMac = process.platform === 'darwin';
  const icon = isMac ? createTrayIcon(18, true) : createTrayIcon(32, false);
  if (!icon || icon.isEmpty()) {
    console.warn('[tray] 图标创建失败，跳过托盘');
    return null;
  }
  if (isMac) icon.setTemplateImage(true);

  try {
    tray = new Tray(icon);
  } catch (err) {
    // Linux 某些桌面环境没有托盘支持，这里不能让它把应用拖死
    console.warn('[tray] 当前环境不支持托盘:', err.message);
    return null;
  }

  const showWindow = () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  const menu = Menu.buildFromTemplate([
    { label: '打开智知 Agent', click: () => showWindow() },
    { label: '快速提问', click: () => { showWindow(); handlers.onQuickAsk?.(); } },
    { type: 'separator' },
    { label: '检查更新', click: () => { handlers.onCheckUpdate?.(); } },
    { label: `版本 ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        handlers.onQuit?.();
      },
    },
  ]);

  tray.setToolTip('智知 - 企业知识库智能问答 Agent');
  tray.setContextMenu(menu);

  // Windows/Linux 单击切换窗口；macOS 交给菜单
  if (!isMac) {
    tray.on('click', () => {
      const win = getWindow();
      if (win && win.isVisible() && !win.isMinimized()) win.hide();
      else showWindow();
    });
  }

  return tray;
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

function getTray() {
  return tray;
}

module.exports = { createTray, destroyTray, getTray, createTrayIcon };
