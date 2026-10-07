/**
 * serverConfig.cjs — 后端服务器地址配置（本地内嵌 vs 远程服务器）
 *
 * 背景：桌面端最初只会拉起内嵌后端（数据不出本机），但产品化方向是
 * "云端后端 + 瘦客户端"（ChatGPT/LobeChat 同款架构）。为了不写死 localhost，
 * 这里提供一个可被用户在设置页修改的配置：
 *   - mode: 'local'  → /api 反代到本机内嵌后端（127.0.0.1:BACKEND_PORT）
 *   - mode: 'remote' → /api 反代到用户配置的远程地址（http/https 均可）
 *
 * 存储位置：userData/server-config.json（与安装目录分离，卸载重装不丢配置）。
 * 环境变量 ZHI_SERVER_URL 可强制覆盖为远程模式（企业批量分发时免配置）。
 *
 * 关键约束：渲染层永远走同源相对路径，切换后端只影响主进程反代目标，
 * 前端业务代码零改动，也天然没有 CORS 问题。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { USER_DIR } = require('./paths.cjs');

const CONFIG_FILE = path.join(USER_DIR.root, 'server-config.json');

const DEFAULTS = { mode: 'local', url: '' };

/** 内存缓存：代理每个请求都要读配置，避免频繁同步 IO；按 mtime 失效 */
let cache = { raw: null, config: { ...DEFAULTS }, source: 'default' };

/** 校验并归一化配置；非法时抛错（由 IPC 层转成 { ok:false, error }） */
function normalizeConfig(raw) {
  const mode = raw && raw.mode === 'remote' ? 'remote' : 'local';
  let url = String((raw && raw.url) || '').trim();
  // 去掉末尾斜杠，避免拼出 //api 这种双斜杠路径
  url = url.replace(/\/+$/, '');
  if (mode === 'remote') {
    if (!url) throw new Error('远程模式必须填写服务器地址');
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      throw new Error(`服务器地址不是合法 URL：${url}`);
    }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('服务器地址仅支持 http/https');
  } else {
    url = '';
  }
  return { mode, url };
}

function loadConfig() {
  // 环境变量优先：便于企业分发/调试时强制指定后端
  if (process.env.ZHI_SERVER_URL) {
    return normalizeConfig({ mode: 'remote', url: process.env.ZHI_SERVER_URL });
  }
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(CONFIG_FILE).mtimeMs;
  } catch (_) {
    return { ...DEFAULTS };
  }
  if (cache.raw === CONFIG_FILE && cache.mtimeMs === mtimeMs) return { ...cache.config };
  try {
    // 去掉 BOM：用户可能用记事本/PowerShell 手工编辑这份配置，会写入 \uFEFF
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, ''));
    const config = normalizeConfig(parsed);
    cache = { raw: CONFIG_FILE, config, mtimeMs, source: 'file' };
    return { ...config };
  } catch (_) {
    // 文件损坏按默认值处理，不让配置异常卡死启动
    return { ...DEFAULTS };
  }
}

function saveConfig(raw) {
  const config = normalizeConfig(raw);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  try {
    cache = { raw: CONFIG_FILE, config, mtimeMs: fs.statSync(CONFIG_FILE).mtimeMs, source: 'file' };
  } catch (_) {}
  return config;
}

/** 远程目标：非 remote 或未填地址时返回 null（走本地内嵌后端） */
function getRemoteTarget() {
  const { mode, url } = loadConfig();
  return mode === 'remote' && url ? url : null;
}

/** 探测远程后端健康度：GET <url>/api/health，5 秒超时 */
function testConnection(rawUrl) {
  return new Promise((resolve) => {
    let target;
    try {
      target = normalizeConfig({ mode: 'remote', url: rawUrl }).url;
    } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }
    const started = Date.now();
    const url = new URL(target + '/api/health');
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(
      { host: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname, timeout: 5000 },
      (res) => {
        res.resume();
        resolve({
          ok: res.statusCode === 200,
          status: res.statusCode,
          latencyMs: Date.now() - started,
          error: res.statusCode === 200 ? undefined : `健康检查返回 ${res.statusCode}`,
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: '连接超时（5 秒）' });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

module.exports = {
  DEFAULTS,
  CONFIG_FILE,
  loadConfig,
  saveConfig,
  getRemoteTarget,
  testConnection,
};
