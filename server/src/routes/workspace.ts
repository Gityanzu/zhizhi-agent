/**
 * workspace.ts — 代码工作台只读接口（IDE 式前端支撑）
 *
 * 提供：
 *   GET /api/workspace/tree?path=   返回目录树（递归，跳过 node_modules/.git 等），用于前端文件树
 *   GET /api/workspace/file?path=   读取单个文件内容（只读，带权限/敏感清单校验）
 *   GET /api/workspace/raw?path=    原始二进制（pdf/图片/音视频内联预览）
 *   GET /api/workspace/docx?path=   Word 转 HTML（mammoth）
 *   GET /api/workspace/sheet?path=  Excel 转 HTML 表格（exceljs）
 *
 * 权限：复用 filePermission —— 敏感清单 deny；Web 端仅输出根内 allow、根外 deny；
 *   桌面端（或 allowWebWorkspace）可访问配置的工作区。保持"数据不出沙箱"的安全边界。
 */
import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import { config } from '../config';
import {
  resolveTarget,
  classify,
  isSensitive,
  getWorkspaceDir,
} from '../services/filePermission';
import { getAgentOutputDir, runWithAgentOutputDir } from '../services/agentOutput';
import { resolveUserOutputDir } from '../services/userOutputPreference';
import { renderWorkbookHtml } from '../services/sheetPreview';

const router = Router();
import { requireAuth, AuthRequest } from '../middleware/auth';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.vscode', '.idea', 'vendor', 'target', 'bin', 'obj',
]);
const MAX_TREE_FILES = 3000;
const MAX_TREE_DEPTH = 6;

interface TreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  children?: TreeNode[];
}

function buildTree(dir: string, depth: number, counter: { n: number }): TreeNode | null {
  if (depth > MAX_TREE_DEPTH || counter.n > MAX_TREE_FILES) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const children: TreeNode[] = [];
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = buildTree(p, depth + 1, counter);
      if (sub) children.push(sub);
    } else {
      counter.n++;
      children.push({ name: e.name, path: p, type: 'file' });
    }
  }
  return { name: path.basename(dir), path: dir, type: 'dir', children };
}

function resolveScope(raw?: string | string[]): string {
  const wsDir = getWorkspaceDir();
  const useWs = !!(wsDir && (config.isDesktop || config.agent?.allowWebWorkspace));
  const q = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;
  return q && q.trim() ? q.trim() : useWs ? wsDir! : getAgentOutputDir();
}

/** 在「当前用户的输出目录」上下文里执行：否则默认根目录还是全局那份，
 *  会出现"产物落在我的目录、文件树却显示别人的目录"的不一致。 */
async function inUserScope<T>(req: AuthRequest, fn: () => T): Promise<T> {
  return runWithAgentOutputDir(await resolveUserOutputDir(req.userId), fn);
}

// 预览需要的 MIME 表：缺了它浏览器会把 pdf/图片当二进制下载，而不是内联渲染
const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** 校验路径可读并返回绝对路径；与 /file、/raw、/docx 共用同一套权限规则 */
function checkReadable(rawPath: unknown):
  | { ok: true; absPath: string }
  | { ok: false; status: number; error: string } {
  const target = resolveTarget(resolveScope(rawPath as string | string[] | undefined));
  if (classify('read', target, config.isDesktop) === 'deny') {
    return { ok: false, status: 403, error: `拒绝访问文件：${target.absPath}` };
  }
  if (isSensitive(target.absPath)) {
    return { ok: false, status: 403, error: '拒绝访问敏感文件' };
  }
  if (!fs.existsSync(target.absPath) || !fs.statSync(target.absPath).isFile()) {
    return { ok: false, status: 400, error: '不是有效文件' };
  }
  return { ok: true, absPath: target.absPath };
}

// 目录树
router.get('/tree', requireAuth, async (req: AuthRequest, res) => {
  try {
    const target = await inUserScope(req, () => resolveTarget(resolveScope(req.query.path as string | string[] | undefined)));
    if (classify('read', target, config.isDesktop) === 'deny') {
      return res.status(403).json({ error: `拒绝访问目录：${target.absPath}` });
    }
    if (!fs.existsSync(target.absPath) || !fs.statSync(target.absPath).isDirectory()) {
      return res.status(400).json({ error: '不是有效目录' });
    }
    const tree = buildTree(target.absPath, 0, { n: 0 });
    res.json({ root: target.absPath, tree });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 文件内容（纯文本，供代码查看器）
router.get('/file', requireAuth, async (req: AuthRequest, res) => {
  try {
    const checked = await inUserScope(req, () => checkReadable(req.query.path));
    if (!checked.ok) return res.status(checked.status).json({ error: checked.error });

    let content = '';
    try {
      content = fs.readFileSync(checked.absPath, 'utf-8');
    } catch {
      return res.status(500).json({ error: '读取文件失败' });
    }
    res.json({
      path: checked.absPath,
      content,
      language: path.extname(checked.absPath).slice(1).toLowerCase(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 原始文件（二进制 + 正确 MIME）：pdf / 图片 / html / 音视频等工作台内联预览。
// 前端用 axios 以 blob 取回再交给 iframe，所以这里不需要额外的 URL 鉴权通道。
router.get('/raw', requireAuth, async (req: AuthRequest, res) => {
  try {
    const checked = await inUserScope(req, () => checkReadable(req.query.path));
    if (!checked.ok) return res.status(checked.status).json({ error: checked.error });

    const ext = path.extname(checked.absPath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    // 默认内联供预览；?download=1 强制另存。文件名走 RFC 5987，中文名才不会乱码
    if (req.query.download === '1') {
      const name = path.basename(checked.absPath);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    }
    const stream = fs.createReadStream(checked.absPath);
    stream.on('error', () => {
      if (res.headersSent) res.end();
      else res.status(500).json({ error: '读取文件失败' });
    });
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Word 预览：浏览器无法直接渲染 docx，交给 mammoth 转 HTML（内嵌图片会转成 data URI）
router.get('/docx', requireAuth, async (req: AuthRequest, res) => {
  try {
    const checked = await inUserScope(req, () => checkReadable(req.query.path));
    if (!checked.ok) return res.status(checked.status).json({ error: checked.error });
    if (path.extname(checked.absPath).toLowerCase() !== '.docx') {
      return res.status(400).json({ error: '仅支持 .docx 预览' });
    }

    const result = await mammoth.convertToHtml({ path: checked.absPath });
    res.json({
      path: checked.absPath,
      html: result.value,
      // 只回前几条告警，避免刷满前端
      messages: (result.messages || []).slice(0, 5).map((m: any) => m.message),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Excel 预览：xlsx/xlsm 本质是一包 XML 的 zip，浏览器无法渲染，交给 exceljs 转表格 HTML。
// 老格式 .xls 是二进制 BIFF，exceljs 读不了 —— 给出明确指引，而不是让用户对着"读取失败"猜。
const SHEET_EXTS = new Set(['.xlsx', '.xlsm']);
router.get('/sheet', requireAuth, async (req: AuthRequest, res) => {
  try {
    const checked = await inUserScope(req, () => checkReadable(req.query.path));
    if (!checked.ok) return res.status(checked.status).json({ error: checked.error });

    const ext = path.extname(checked.absPath).toLowerCase();
    if (ext === '.xls') {
      return res.status(400).json({ error: '暂不支持旧版 .xls 预览，请在 Excel 中另存为 .xlsx 后重试' });
    }
    if (!SHEET_EXTS.has(ext)) {
      return res.status(400).json({ error: '仅支持 .xlsx / .xlsm 预览' });
    }

    const result = await renderWorkbookHtml(checked.absPath);
    res.json({ path: checked.absPath, ...result });
  } catch (err) {
    // 受密码保护/文件损坏/后缀被改：统一按"无法解析该表格"回，附上原因便于排查
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Workspace] Excel 预览失败：${msg}`);
    res.status(400).json({ error: `无法解析该表格文件：${msg}` });
  }
});

export default router;
