/**
 * menu.cjs — 应用菜单栏
 *
 * 为什么需要这个文件：
 *   Electron 默认给的是英文 File/Edit/View/Window/Help，内容只有浏览器级别的
 *   通用项，既不本地化，也用不上桌面端的系统能力。桌面端真正的价值是把
 *   "应用自己的操作"和"系统级能力"放到用户顺手的位置 —— 参考 VS Code /
 *   Slack / Notion 的做法，拆成 文件 / 编辑 / 视图 / 转到 / 窗口 / 帮助 六组。
 *
 * 分工原则（与 ipc.cjs 保持一致）：
 *   1. 纯系统能力的菜单项（打开目录、缩放、全屏、开发者工具、关于、复制诊断
 *      信息）在主进程内直接做完，不需要渲染层配合。
 *   2. 涉及业务状态的菜单项（新建对话、导入、导出、切主题）这里不写任何业务，
 *      只把语义化的命令 id 通过 COMMAND_CHANNEL 推给渲染层，由渲染层决定怎么做。
 *      好处是主进程不需要知道 chatStore 长什么样，菜单也不会随业务演进而腐烂。
 *   3. 能用 role 的一律用 role（undo/copy/paste/zoom/fullscreen…），
 *      让 Electron 去适配平台差异，而不是自己再写一遍。
 *
 * 平台差异：
 *   macOS 的第一组必须是"应用菜单"（关于/隐藏/退出都归 Apple 要求放这里），
 *   且 关闭窗口/退出 不能出现在"文件"里，否则会出现两组重复快捷键。
 */
const { app, Menu, dialog, shell, clipboard, BrowserWindow } = require('electron');
const fs = require('fs');

const { USER_DIR } = require('./paths.cjs');
const backend = require('./backend.cjs');
const updater = require('./updater.cjs');

/** 主进程 → 渲染层的菜单命令通道（preload 里必须同步加入白名单） */
const COMMAND_CHANNEL = 'menu:command';

/** 项目地址与反馈入口（与 origin 仓库一致） */
const PROJECT_URL = 'https://github.com/Gityanzu/zhizhi-agent';

/**
 * macOS 应用菜单的标题，必须显式写中文。
 * 不能用 app.getName()：它取的是 electron-builder.yml 里的 productName（ZhizhiAgent），
 * 而 productName 同时决定安装目录名与 userData 路径，为了一个菜单标题去改它
 * 会让老用户的本地数据"搬家"，代价太大。所以这里只覆盖显示名。
 */
const APP_MENU_LABEL = '智知';

const isMac = process.platform === 'darwin';

/** 由 main.cjs 注入的依赖，避免 menu.cjs 反向持有窗口引用 */
let deps = {
  getWindow: () => null,
  onCheckUpdate: () => {},
  onQuit: () => {},
};

/* ------------------------- 主进程内部动作 ------------------------- */

/**
 * 把命令推给渲染层。主进程只表达"用户点了什么"，不替渲染层做决定。
 * @param {string} id 语义化命令 id
 * @param {object} [payload] 附加参数（如要跳转的路由）
 */
function sendCommand(id, payload) {
  const message = { id, payload, at: Date.now() };
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(COMMAND_CHANNEL, message);
  });
}

function showMessageBox(options) {
  const win = deps.getWindow();
  const opts = { noLink: true, buttons: ['好'], ...options };
  return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts);
}

function showError(title, detail) {
  return showMessageBox({ type: 'warning', title, message: title, detail: String(detail || '') });
}

/** 打开用户目录：不存在就先建出来，避免点了菜单"毫无反应" */
async function openUserDir(dirPath, label) {
  try {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    const err = await shell.openPath(dirPath);
    if (err) throw new Error(err);
  } catch (e) {
    await showError(`无法打开${label}`, `${dirPath}\n\n${e && e.message ? e.message : e}`);
  }
}

/** 诊断信息：把环境问题一次问清楚，省掉"你的版本是多少"这种来回沟通 */
function buildDiagnostics() {
  const b = backend.getState();
  const u = updater.getStatus();
  return [
    `${app.getName()} ${app.getVersion()}`,
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
    `平台: ${process.platform} ${process.arch}`,
    `打包运行: ${app.isPackaged ? '是' : '否'}`,
    `本地后端: ${b.status}（${b.managed ? '内嵌进程' : '复用已有服务'}）${b.message ? ' - ' + b.message : ''}`,
    `更新状态: ${u.state}${u.version ? ' -> ' + u.version : ''}`,
    `用户数据目录: ${USER_DIR.root}`,
  ].join('\n');
}

/** 快捷键一览：内容必须与真实绑定一致，写文档时容易过期，这里以菜单定义为唯一事实源 */
const SHORTCUTS = [
  ['新建对话', 'Ctrl/Cmd + N'],
  ['导入对话', 'Ctrl/Cmd + O'],
  ['导出当前对话', 'Ctrl/Cmd + S'],
  ['清空输入框', 'Ctrl/Cmd + L'],
  ['设置', 'Ctrl/Cmd + ,'],
  ['切换深色模式', 'Ctrl/Cmd + Shift + D'],
  ['放大 / 缩小 / 实际大小', 'Ctrl/Cmd + = / - / 0'],
  ['切换到各功能页', 'Ctrl/Cmd + 1 ~ 6'],
  ['切换全屏', isMac ? 'Ctrl + Cmd + F' : 'F11'],
  ['切换侧边栏', 'Ctrl/Cmd + B'],
  ['开发者工具', 'Ctrl/Cmd + Shift + I'],
  ['停止生成', 'Esc'],
  ['关闭窗口', 'Ctrl/Cmd + W'],
  ['全局唤起快速提问', 'Ctrl/Cmd + Shift + Space'],
];

async function showShortcuts() {
  const detail = SHORTCUTS.map(([name, key]) => `${name.padEnd(24, '　')}${key}`).join('\n');
  await showMessageBox({
    type: 'info',
    title: '快捷键一览',
    message: '快捷键一览',
    detail,
  });
}

async function showAbout() {
  const { response } = await showMessageBox({
    type: 'info',
    title: '关于智知',
    message: `智知 - 企业知识库智能问答 Agent`,
    detail: buildDiagnostics(),
    buttons: ['复制诊断信息', '好'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0) clipboard.writeText(buildDiagnostics());
}

async function restartBackend() {
  try {
    const state = await backend.restartBackend();
    if (state && state.status === 'error') {
      await showError('本地后端重启失败', state.message || '未知错误');
    }
  } catch (e) {
    await showError('本地后端重启失败', e && e.message ? e.message : e);
  }
}

function openExternal(url) {
  return shell.openExternal(url);
}

/**
 * 打开/关闭主窗口的开发者工具。
 * detached=true 用独立窗口，便于把控制台和界面并排看。
 */
function toggleDevTools(detached) {
  const win = deps.getWindow();
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents;
  if (wc.isDevToolsOpened()) {
    wc.closeDevTools();
    return;
  }
  // 显式拿主窗口的 webContents 再打开，不依赖"当前焦点在哪个窗口"
  wc.openDevTools({ mode: detached ? 'detach' : 'right' });
}

function toggleMaximize() {
  const win = deps.getWindow();
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
}

/* ------------------------- 菜单模板 ------------------------- */

/**
 * macOS 专属的"应用菜单"，Apple 人机指南要求第一组固定是它。
 * Windows/Linux 上这些项（关于、设置、退出）按惯例落在 文件 / 帮助 里。
 */
function macAppMenu() {
  return {
    label: APP_MENU_LABEL,
    submenu: [
      { label: '关于智知', click: () => showAbout() },
      { label: '检查更新…', click: () => deps.onCheckUpdate() },
      { type: 'separator' },
      { label: '设置…', accelerator: 'Cmd+,', click: () => sendCommand('app:settings') },
      { type: 'separator' },
      { role: 'services', label: '服务' },
      { type: 'separator' },
      { role: 'hide', label: '隐藏智知' },
      { role: 'hideOthers', label: '隐藏其他' },
      { role: 'unhide', label: '全部显示' },
      { type: 'separator' },
      { role: 'quit', label: '退出智知' },
    ],
  };
}

function fileMenu() {
  return {
    label: '文件',
    submenu: [
      { label: '新建对话', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('chat:new') },
      { label: '导入对话…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('chat:import') },
      { type: 'separator' },
      { label: '导出当前对话…', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('chat:export') },
      { label: '打开导出目录', click: () => openUserDir(USER_DIR.exports, '导出目录') },
      { type: 'separator' },
      // 桌面端排障最常用的三个目录，放到随手可点的位置
      { label: '打开数据目录', click: () => openUserDir(USER_DIR.data, '数据目录') },
      { label: '打开日志目录', click: () => openUserDir(USER_DIR.logs, '日志目录') },
      // macOS 的设置/退出在应用菜单里，这里不能再出现一次（快捷键会冲突）。
      // 分隔线一并放进条件里，避免 macOS 上留下一条悬空的尾部空行。
      ...(isMac
        ? []
        : [
            { type: 'separator' },
            { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => sendCommand('app:settings') },
            { type: 'separator' },
            { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => deps.onQuit() },
          ]),
    ],
  };
}

function editMenu() {
  return {
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      ...(isMac ? [{ role: 'pasteAndMatchStyle', label: '粘贴为纯文本' }] : []),
      { role: 'delete', label: '删除' },
      { role: 'selectAll', label: '全选' },
      { type: 'separator' },
      // 输入框相关的两个动作交给渲染层，主进程不碰输入框状态
      { label: '清空输入框', accelerator: 'CmdOrCtrl+L', click: () => sendCommand('chat:clearInput') },
      { label: '停止生成', click: () => sendCommand('chat:stop') },
    ],
  };
}

function viewMenu() {
  return {
    label: '视图',
    submenu: [
      { role: 'reload', label: '重新加载界面' },
      { role: 'forceReload', label: '强制重新加载' },
      // DevTools 用显式 click 而不是 role: toggleDevTools：
      // role 的实现要从原生事件对象上解析目标窗口（该对象无法伪造，测试里驱动不了），
      // 显式拿主窗口的 webContents 更可控、可验证，也不受焦点影响。
      {
        label: '开发者工具（控制台）',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => toggleDevTools(false),
      },
      {
        label: '开发者工具（独立窗口）',
        accelerator: 'CmdOrCtrl+Shift+Alt+I',
        click: () => toggleDevTools(true),
      },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '切换全屏' },
      { label: '切换深色模式', accelerator: 'CmdOrCtrl+Shift+D', click: () => sendCommand('view:theme') },
      // 布局类命令：对话页的三栏开关（WorkBuddy 式，收起/展开左侧会话栏）
      { label: '切换侧边栏', accelerator: 'CmdOrCtrl+B', click: () => sendCommand('layout:toggleSidebar') },
    ],
  };
}

/** 「转到」是主流客户端的标配（Slack 的 Navigate、VS Code 的 Go），用数字键直达 */
function goMenu() {
  const items = [
    ['对话', '/chat'],
    ['知识库', '/knowledge'],
    ['Agent 市场', '/agents'],
    ['工作流', '/workflow'],
    ['数据分析', '/analytics'],
    ['代码工作台', '/code-workbench'],
  ];
  return {
    label: '转到',
    submenu: items.map(([label, path], index) => ({
      label,
      accelerator: `CmdOrCtrl+${index + 1}`,
      click: () => sendCommand('app:navigate', { path }),
    })),
  };
}

function windowMenu() {
  return {
    label: '窗口',
    submenu: [
      { role: 'minimize', label: '最小化' },
      isMac ? { role: 'zoom', label: '缩放' } : { label: '最大化 / 还原', click: () => toggleMaximize() },
      { type: 'separator' },
      {
        // 常驻工具类应用的刚需：边看资料边提问时不被其他窗口盖住
        label: '窗口置顶',
        type: 'checkbox',
        checked: Boolean(deps.getWindow() && deps.getWindow().isAlwaysOnTop()),
        click: (item) => {
          const win = deps.getWindow();
          if (win) win.setAlwaysOnTop(Boolean(item.checked));
        },
      },
      { type: 'separator' },
      { role: 'close', label: '关闭窗口' },
    ],
  };
}

function helpMenu() {
  return {
    label: '帮助',
    submenu: [
      { label: '快捷键一览', accelerator: 'CmdOrCtrl+/', click: () => showShortcuts() },
      { label: '使用文档', click: () => openExternal(`${PROJECT_URL}#readme`) },
      { label: '问题反馈', click: () => openExternal(`${PROJECT_URL}/issues`) },
      { type: 'separator' },
      { label: '检查更新…', click: () => deps.onCheckUpdate() },
      { label: '复制诊断信息', click: () => clipboard.writeText(buildDiagnostics()) },
      { label: '重启本地后端', click: () => restartBackend() },
      { label: '打开日志目录', click: () => openUserDir(USER_DIR.logs, '日志目录') },
      ...(isMac
        ? []
        : [{ type: 'separator' }, { label: '关于智知', click: () => showAbout() }]),
    ],
  };
}

/**
 * 安装应用菜单。必须在 app ready 之后、窗口创建之后调用：
 * 「窗口置顶」的初始勾选状态要读当前窗口。
 *
 * @param {{ getWindow: () => BrowserWindow|null, onCheckUpdate?: Function, onQuit?: Function }} options
 */
function installAppMenu(options = {}) {
  deps = {
    getWindow: typeof options.getWindow === 'function' ? options.getWindow : () => null,
    onCheckUpdate: options.onCheckUpdate || (() => updater.checkForUpdates()),
    onQuit: options.onQuit || (() => app.quit()),
  };

  const template = [
    ...(isMac ? [macAppMenu()] : []),
    fileMenu(),
    editMenu(),
    viewMenu(),
    goMenu(),
    windowMenu(),
    helpMenu(),
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

module.exports = { installAppMenu, COMMAND_CHANNEL, buildDiagnostics };
