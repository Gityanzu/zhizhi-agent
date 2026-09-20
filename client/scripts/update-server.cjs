/**
 * update-server.cjs — 本地更新源（演示与内网私有化部署都用得上）
 *
 * electron-updater 的 generic 源不需要任何后端服务，一个能吐静态文件的
 * http 服务就够了。这个脚本就干这一件事：把指定目录静态托管出来，
 * 顺带按 electron-updater 的规范补上 Range 支持（差量下载要靠它）。
 *
 * 用法：
 *   node scripts/update-server.cjs <发布目录> [端口]
 *   node scripts/update-server.cjs ./release/1.0.2 9876
 *
 * 然后让客户端指向它：
 *   UPDATE_FORCE_DEV=1 UPDATE_FEED_URL=http://127.0.0.1:9876 npm run electron:dev
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(process.argv[2] || './release');
const port = Number(process.argv[3] || 9876);

const MIME = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.exe': 'application/octet-stream',
  '.dmg': 'application/octet-stream',
  '.zip': 'application/zip',
  '.appimage': 'application/octet-stream',
  '.deb': 'application/vnd.debian.binary-package',
  '.blockmap': 'application/octet-stream',
};

function send(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';

  // 差量更新依赖 Range 请求，必须支持 206
  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
  const filePath = path.join(rootDir, rel);

  // 防目录穿越
  if (path.relative(rootDir, filePath).startsWith('..')) {
    res.writeHead(403).end('forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    console.log(`  404 ${req.url}`);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }

  console.log(`  200 ${req.url}${req.headers.range ? ` [range ${req.headers.range}]` : ''}`);
  send(req, res, filePath);
});

server.listen(port, '127.0.0.1', async () => {
  console.log(`更新源已启动: http://127.0.0.1:${port}`);
  console.log(`托管目录: ${rootDir}`);

  const expected = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml'];
  const found = expected.filter((f) => fs.existsSync(path.join(rootDir, f)));
  if (found.length === 0) {
    console.warn('\n[提示] 目录里没有找到 latest*.yml。');
    console.warn('electron-updater 是先读这个清单再比对版本的，缺了它客户端会报「找不到更新」。');
    console.warn('执行 npm run dist:win 之后，release/<version>/ 里会自动生成。\n');
  } else {
    console.log('发现更新清单:', found.join(', '));
    try {
      const text = fs.readFileSync(path.join(rootDir, found[0]), 'utf-8');
      const version = /version:\s*(.+)/.exec(text)?.[1]?.trim();
      const file = /path:\s*(.+)/.exec(text)?.[1]?.trim();
      console.log(`清单版本: ${version}  安装包: ${file}`);
    } catch (_) {}
  }
  console.log('\n按 Ctrl+C 停止');
});
