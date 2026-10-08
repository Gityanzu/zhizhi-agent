/**
 * workspace.ts — 代码工作台只读接口（IDE 式前端支撑）
 *
 * 提供：
 *   GET /api/workspace/tree?path=   返回目录树（递归，跳过 node_modules/.git 等），用于前端文件树
 *   GET /api/workspace/file?path=   读取单个文件内容（只读，带权限/敏感清单校验）
 *
 * 权限：复用 filePermission —— 敏感清单 deny；Web 端仅输出根内 allow、根外 deny；
 *   桌面端（或 allowWebWorkspace）可访问配置的工作区。保持"数据不出沙箱"的安全边界。
 */
import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import {
  resolveTarget,
  classify,
  isSensitive,
  getWorkspaceDir,
} from '../services/filePermission';
import { getAgentOutputDir } from '../services/agentOutput';

const router = Router();
import { requireAuth } from '../middleware/auth';

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

// 目录树
router.get('/tree', requireAuth, (req, res) => {
  try {
    const target = resolveTarget(resolveScope(req.query.path));
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

// 文件内容
router.get('/file', requireAuth, (req, res) => {
  try {
    const target = resolveTarget(resolveScope(req.query.path));
    if (classify('read', target, config.isDesktop) === 'deny') {
      return res.status(403).json({ error: `拒绝访问文件：${target.absPath}` });
    }
    if (isSensitive(target.absPath)) {
      return res.status(403).json({ error: '拒绝访问敏感文件' });
    }
    if (!fs.existsSync(target.absPath) || !fs.statSync(target.absPath).isFile()) {
      return res.status(400).json({ error: '不是有效文件' });
    }
    let content = '';
    try {
      content = fs.readFileSync(target.absPath, 'utf-8');
    } catch {
      return res.status(500).json({ error: '读取文件失败' });
    }
    res.json({ path: target.absPath, content, language: path.extname(target.absPath).slice(1).toLowerCase() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
