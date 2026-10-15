/**
 * run-electron.cjs — Electron 启动包装器
 *
 * 解决两个问题：
 * 1. Windows 控制台乱码：npm 管道下 Electron 的中文日志是 UTF-8 字节，
 *    而默认控制台代码页是 GBK(936) → 显示成乱码。启动前 chcp 65001 切 UTF-8。
 * 2. Chromium 内部调试日志噪音（ERROR:debug_utils.cc ...）：默认关闭
 *    ELECTRON_ENABLE_LOGGING，只保留我们自己的 [main]/[backend] 日志。
 *
 * 用法：node scripts/run-electron.cjs [electron 附加参数...]
 *   electron:dev  → node scripts/run-electron.cjs
 *   electron:start → node scripts/run-electron.cjs --host-server
 */
const { spawn, execSync } = require('child_process');

if (process.platform === 'win32') {
  try {
    // chcp 作用于整个共享控制台，子进程执行即可生效；输出静默避免多余行
    execSync('chcp 65001', { stdio: 'ignore', windowsHide: true });
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

const child = spawn(electronBin, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    // 关闭 Chromium 内部日志转发（debug_utils.cc / gpu 等噪音）
    ELECTRON_ENABLE_LOGGING: '0',
    // 强制子进程输出 UTF-8（保险起见）
    PYTHONIOENCODING: 'utf-8',
  },
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

// 转发 Ctrl+C：父进程收到 SIGINT 时 electron 未必自动退出
process.on('SIGINT', () => {
  try { child.kill('SIGINT'); } catch { /* ignore */ }
  process.exit(0);
});
