/**
 * hostServer.cjs — 主进程内置"静态托管 + API 反向代理"
 *
 * 为什么需要它？
 *   1. file:// 协议下，前端里所有相对路径请求（axios baseURL: '/'）都会失效；
 *      而把 axios 改成绝对地址又会让 Web 端和桌面端产生分叉。
 *   2. 前端代码里到处的 '/api/xxx' 依赖 Vite dev proxy，生产态没有 proxy。
 *   3. 用自定义协议去代理 SSE 很别扭，而 http 反向代理天然支持流式。
 *
 * 做法：主进程起一个本地 http 服务（只监听 127.0.0.1），
 *   - /api/*  → 反代到本地后端（含 SSE 流式透传，不缓冲）
 *   - 其它   → 直接吐 dist/ 下的静态文件，未命中则回落到 index.html（SPA）
 * 拿到随机端口后让 BrowserWindow 加载 http://127.0.0.1:<port>。
 *
 * 额外收益：渲染层与接口变成同源，彻底绕开 CORS 白名单问题。
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { DIST_DIR, BACKEND_HOST, BACKEND_PORT } = require('./paths.cjs');
const { getRemoteTarget } = require('./serverConfig.cjs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

let hostServer = null;

/** 防目录穿越：把请求路径归一化后必须仍落在 DIST_DIR 内 */
function safeJoin(rootDir, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, '');
  const target = path.join(rootDir, normalized);
  const rel = path.relative(rootDir, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('read error');
  });
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
  });
  stream.pipe(res);
}

/**
 * 反向代理到后端；SSE 场景必须原样透传、不能缓冲。
 * 目标由服务器配置决定：
 *   - 本地模式 → 127.0.0.1:BACKEND_PORT（内嵌后端）
 *   - 远程模式 → 用户配置的服务器地址（http/https）
 * 每个请求实时读取配置，用户在设置页保存后无需重启即生效。
 */
function proxyToBackend(req, res) {
  const remote = getRemoteTarget();
  let transport = http;
  let options;
  let describe;

  if (remote) {
    const target = new URL(remote);
    const isTls = target.protocol === 'https:';
    transport = isTls ? https : http;
    options = {
      host: target.hostname,
      port: target.port || (isTls ? 443 : 80),
      method: req.method,
      path: req.url,
      // 远程虚拟主机（nginx）按 Host 路由，必须换成目标地址的 host
      headers: { ...req.headers, host: target.host },
      // 远程 https 证书可能对应域名而非 IP，留默认 SNI（取 host）即可
      servername: /^[\d.]+$/.test(target.hostname) ? undefined : target.hostname,
    };
    describe = remote;
  } else {
    options = {
      host: BACKEND_HOST,
      port: BACKEND_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
    };
    describe = `${BACKEND_HOST}:${BACKEND_PORT}`;
  }

  const proxyReq = transport.request(options, (proxyRes) => {
    // 透传状态码与响应头（含 SSE 的 text/event-stream）
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (res.headersSent) return;
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: 'BACKEND_UNAVAILABLE',
        message: remote ? `远程服务器不可达（${describe}）` : `本地后端未就绪（${describe}）`,
        detail: err.message,
      })
    );
  });

  // SSE 长连接：禁用超时，避免流被中途掐断
  proxyReq.setTimeout(0);
  res.setTimeout(0);
  req.pipe(proxyReq);
}

/**
 * 启动本地托管服务
 * @returns {Promise<{origin: string, port: number, close: () => Promise<void>}>}
 */
function startHostServer() {
  return new Promise((resolve, reject) => {
    if (hostServer) {
      resolve({ origin: getOrigin(), port: hostServer.address().port, close: stopHostServer });
      return;
    }

    hostServer = http.createServer((req, res) => {
      if (req.url && req.url.startsWith('/api')) {
        proxyToBackend(req, res);
        return;
      }

      if (!fs.existsSync(DIST_DIR)) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<h1>缺少前端构建产物</h1><p>请先执行 <code>npm run build</code>，或使用 <code>npm run electron:dev</code> 以开发模式启动。</p>'
        );
        return;
      }

      const target = safeJoin(DIST_DIR, req.url === '/' ? '/index.html' : req.url || '/');
      if (target && fs.existsSync(target) && fs.statSync(target).isFile()) {
        sendFile(res, target);
        return;
      }

      // 带后缀的路径说明它想拿一个具体资源（.js / .css / 图片…），
      // 这种情况下回落到 index.html 是错的：浏览器会拿到 text/html 的"脚本"，
      // 然后报 MIME 类型不匹配，而且真正的缺失会被伪装成 200，极难排查。
      const ext = path.extname((req.url || '').split('?')[0]).toLowerCase();
      if (ext && ext !== '.html') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`asset not found: ${req.url}`);
        return;
      }

      // SPA 回落：只管无后缀的路由路径，交给前端 router 处理深链接
      sendFile(res, path.join(DIST_DIR, 'index.html'));
    });

    // 端口传 0 让系统分配空闲端口，避免与用户已占用的端口冲突
    hostServer.listen(0, '127.0.0.1', () => {
      resolve({
        origin: getOrigin(),
        port: hostServer.address().port,
        close: stopHostServer,
      });
    });

    hostServer.on('error', reject);
  });
}

function getOrigin() {
  if (!hostServer || !hostServer.address()) return '';
  return `http://127.0.0.1:${hostServer.address().port}`;
}

function stopHostServer() {
  return new Promise((resolve) => {
    if (!hostServer) return resolve();
    const server = hostServer;
    hostServer = null;
    server.close(() => resolve());
  });
}

module.exports = { startHostServer, stopHostServer, getOrigin };
