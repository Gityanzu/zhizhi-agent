/**
 * backend.cjs — 本地后端进程托管
 *
 * 桌面端的核心价值之一是"数据不出本机"：把 Express + LangChain + Chroma
 * 这套后端直接跑在用户电脑上，而不是要求客户把地质资料传到云上。
 * 这带来一个工程问题——后端进程的生命周期必须由桌面端自己管。
 *
 * 三个关键设计：
 *   1. 用 process.execPath + ELECTRON_RUN_AS_NODE=1 拉起子进程，
 *      这样客户机器上不需要预装 Node，也不会出现"用户的 Node 版本不对"。
 *   2. 启动前先探测端口，开发态后端已经在跑时直接复用，不重复拉起。
 *   3. 健康检查轮询而不是 sleep 固定时长；失败也不阻断窗口显示，
 *      而是把状态推给渲染层，让界面自己提示"本地服务未就绪"。
 */
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { BACKEND_HOST, BACKEND_PORT, USER_DIR, resolveServerEntry } = require('./paths.cjs');
const { getRemoteTarget } = require('./serverConfig.cjs');

let child = null;
let state = { status: 'idle', message: '未启动', managed: false };
let statusListener = null;

function setState(next) {
  state = { ...state, ...next };
  if (typeof statusListener === 'function') statusListener({ ...state });
}

function onStatusChange(fn) {
  statusListener = fn;
}

function getState() {
  return { ...state };
}

/** 健康检查：后端暴露 /api/health */
function pingHealth(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: BACKEND_HOST, port: BACKEND_PORT, path: '/api/health', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

/** 远程模式的健康检查：直接探目标服务器的 /api/health（http/https 均可） */
function pingRemote(baseurl, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(baseurl + '/api/health');
    } catch (_) {
      resolve(false);
      return;
    }
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(
      {
        host: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitForHealthy(totalMs = 30000, intervalMs = 700) {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    if (await pingHealth()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * 确保后端可用：
 *   - 远程模式 → 不拉起内嵌后端，只探测远程健康（/api 反代由 hostServer 指向远程）
 *   - 已有本地实例在跑 → 直接复用（开发态最常见）
 *   - 否则拉起子进程并等待健康
 */
async function ensureBackend({ required = false } = {}) {
  const remote = getRemoteTarget();
  if (remote) {
    setState({ status: 'starting', message: `正在连接远程服务器 ${remote}…`, managed: false });
    const healthy = await pingRemote(remote);
    setState({
      status: healthy ? 'remote' : 'remote-error',
      message: healthy ? `已连接远程服务器 ${remote}` : `远程服务器健康检查失败（${remote}），请检查地址与网络`,
      managed: false,
    });
    return getState();
  }

  if (await pingHealth()) {
    setState({ status: 'ok', message: '复用已有本地后端', managed: false });
    return getState();
  }

  const entry = resolveServerEntry();
  if (!entry) {
    setState({
      status: required ? 'error' : 'unavailable',
      message: '未找到后端入口（server/dist/index.js）',
      managed: false,
    });
    return getState();
  }

  setState({ status: 'starting', message: '正在启动本地后端…', managed: true });

  const env = {
    ...process.env,
    // 关键：让 Electron 可执行文件以纯 Node 模式运行子进程
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(BACKEND_PORT),
    NODE_ENV: process.env.NODE_ENV || 'production',
    ZHI_USER_DATA: USER_DIR.root,
    // 打包后的桌面应用不随包携带 server/.env，内嵌后端会缺少 PostgreSQL 连接参数，
    // 导致登录时 pg 因空密码被解析为 null 而抛 “SASL: client password must be a string”。
    // 这里补一组与项目约定一致的默认值（外部已显式设置的环境变量优先），指向本机标准 Postgres。
    PG_HOST: process.env.PG_HOST || 'localhost',
    PG_PORT: process.env.PG_PORT || '5432',
    PG_DATABASE: process.env.PG_DATABASE || 'zhizhi_agent',
    PG_USER: process.env.PG_USER || 'postgres',
    PG_PASSWORD: process.env.PG_PASSWORD || 'postgres',
  };

  const isTs = entry.endsWith('.ts');
  const args = isTs ? [require.resolve('ts-node-dev/cli.js'), '--respawn', '--transpile-only', entry] : [entry];

  try {
    child = spawn(process.execPath, args, {
      cwd: path.dirname(path.join(entry, '..')),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (err) {
    setState({ status: 'error', message: `子进程启动失败：${err.message}` });
    return getState();
  }

  child.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`));

  child.on('exit', (code, signal) => {
    child = null;
    setState({
      status: code === 0 ? 'stopped' : 'error',
      message: `本地后端已退出（code=${code}, signal=${signal || '-'}）`,
      managed: false,
    });
  });

  const healthy = await waitForHealthy(30000);
  setState({
    status: healthy ? 'ok' : 'error',
    message: healthy ? '本地后端就绪' : '本地后端启动超时，界面可继续使用但接口不可用',
  });
  return getState();
}

/** 退出时务必回收，否则用户卸载重装会遇到端口占用 */
async function stopBackend() {
  if (!child) return;
  const proc = child;
  child = null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (_) {}
      resolve();
    }, 4000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      if (process.platform === 'win32') proc.kill();
      else proc.kill('SIGTERM');
    } catch (_) {
      clearTimeout(timer);
      resolve();
    }
  });
}

/** 供界面手动重启（比如用户改了模型配置） */
async function restartBackend() {
  await stopBackend();
  await new Promise((r) => setTimeout(r, 600));
  return ensureBackend();
}

module.exports = {
  ensureBackend,
  stopBackend,
  restartBackend,
  getState,
  onStatusChange,
  pingHealth,
  pingRemote,
};
