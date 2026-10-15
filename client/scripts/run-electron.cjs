/**
 * run-electron.cjs — Electron 启动包装器
 *
 * 解决两个问题：
 * 1. Windows 控制台乱码：npm 管道下 Electron 的中文日志是 UTF-8 字节，
 *    而默认控制台代码页是 GBK(936) → 显示成乱码。启动前 chcp 65001 切 UTF-8。
 * 2. Chromium 内部日志噪音（INFO:CONSOLE / Security Warning ...）：删掉
 *    ELECTRON_ENABLE_LOGGING 变量回到默认静默，只保留我们自己的 [main]/[backend] 日志。
 *
 * 用法：node scripts/run-electron.cjs [electron 附加参数...]
 *   electron:dev  → node scripts/run-electron.cjs
 *   electron:start → node scripts/run-electron.cjs --host-server
 */
const { spawn, execSync } = require('child_process');
const path = require('path');

if (process.platform === 'win32') {
  try {
    // chcp 作用于整个共享控制台。注意不能加 windowsHide：那会给子进程
    // 分配一个新的隐藏控制台，chcp 就改不到当前可见终端的代码页了。
    // stdio ignore 只是不转发它的输出（"活动代码页: 65001"），不影响生效。
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {
    /* 非 cmd 环境失败时忽略，不影响启动 */
  }
}

// 解析 electron 可执行文件的真实路径（node_modules/electron 导出 dist/electron.exe 路径）。
// 不能 spawn 'electron.cmd'：Node ≥18.20 出于 CVE-2024-27980 禁止直接 spawn .cmd/.bat（EINVAL）。
let electronBin;
try {
  electronBin = require('electron');
} catch {
  console.error('[run-electron] 未找到 electron，请先 npm install');
  process.exit(1);
}
if (typeof electronBin !== 'string') {
  console.error('[run-electron] 请用 node 运行本脚本（不要在 Electron 内执行）');
  process.exit(1);
}

const args = process.argv.slice(2);
// 未显式指定应用路径时默认加载 client 目录（package.json main → electron/main.cjs）。
// 直接 spawn electron.exe 不像 electron.cmd 那样隐式带上 `.`，缺了它就会显示默认欢迎页。
const hasAppPath = args.some((a) => !a.startsWith('-'));
if (!hasAppPath) args.unshift(path.resolve(__dirname, '..'));

const childEnv = { ...process.env };
// ELECTRON_ENABLE_LOGGING 的判断是"变量存在即开启"（值是什么无所谓，'0' 也会开启）。
// 要回到默认静默（不转发渲染层 console、不打 Electron Security Warning），
// 必须把这个变量整个删掉，而不是设成 '0'。
delete childEnv.ELECTRON_ENABLE_LOGGING;
// 强制子进程输出 UTF-8（保险起见）
childEnv.PYTHONIOENCODING = 'utf-8';

const child = spawn(electronBin, args, {
  stdio: 'inherit',
  env: childEnv,
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

// 转发 Ctrl+C：父进程收到 SIGINT 时 electron 未必自动退出
process.on('SIGINT', () => {
  try { child.kill('SIGINT'); } catch { /* ignore */ }
  process.exit(0);
});
