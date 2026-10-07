/**
 * codeIndex.ts — 代码库语义索引（让 Agent 能"读懂整个代码库"）
 *
 * 设计：
 *  - 对指定目录（默认代码工作区）递归扫描源码文件，做"语法感知分块"（函数/类/定义级），
 *    再对每个代码块生成 embedding 存入既有向量库（独立 collectionId='codebase'，与企业知识库隔离）。
 *  - 提供 index_codebase（建索引）与 search_codebase（语义检索）两个工具，供 Agent 在任务中调用。
 *
 * 分块策略：轻量零依赖实现——按语言识别顶层定义边界（function/class/def/func/const=...）切分，
 *   超长定义按固定行数再切。无定义匹配的文件（如纯文本/配置）按行数兜底分块。
 *   注：该正则切分比 tree-sitter 粗糙，但零原生编译依赖、可立即运行；后续可平滑替换为 tree-sitter。
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { getWorkspaceDir, resolveTarget, classify, isSensitive, type ToolContext } from './filePermission';
import { getAgentOutputDir } from './agentOutput';
import { addDocuments, hybridSearch, deleteDocumentsBySource } from './vectorStore';

/** 代码索引使用的独立 collection，避免污染企业知识库检索 */
export const CODEBASE_COLLECTION = 'codebase';

/** 各扩展名对应的语言标签（仅用于元信息展示） */
const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python',
  java: 'java', kt: 'kotlin', scala: 'scala',
  go: 'go',
  rs: 'rust',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  vue: 'vue',
  swift: 'swift',
};
const CODE_EXT = new Set(Object.keys(LANG_BY_EXT));

/** 递归扫描时跳过的目录 */
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.vscode', '.idea', 'vendor', 'target', 'bin', 'obj',
]);

/** 单个文件最大字节数（超过跳过，避免二进制/超大文件拖垮索引） */
const MAX_FILE_BYTES = 512 * 1024;
/** 单个定义块最大行数（超过按此再切） */
const MAX_CHUNK_LINES = 240;
/** 单次索引全局代码块上限（防止超大仓库 embedding 爆炸） */
const MAX_TOTAL_CHUNKS = 6000;

interface CodeChunk {
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbol: string;
  language: string;
}

// 顶层定义起始（缩进为 0 才视为顶层切分点）
const DEF_RE = /^(export\s+)?(async\s+)?(public\s+|private\s+|protected\s+|static\s+|final\s+|virtual\s+|override\s+)?(?:(?:function|func|def|class|interface|struct|enum|impl|trait)\s+[\w$]+|(?:const|let|var)\s+[\w$]+\s*=|[\w$]+(?!(?:if|for|while|switch|catch|else|do|return|new|typeof|await|delete)\b)\s*\([^)]*\)\s*\{)/;

function extractSymbol(line: string): string {
  const m =
    line.match(/(?:function|func|def|class|interface|struct|enum|impl|trait)\s+([\w$]+)/) ||
    line.match(/(?:const|let|var)\s+([\w$]+)/) ||
    line.match(/([\w$]+)\s*\([^)]*\)\s*\{/);
  return m ? m[1] : '<block>';
}

/** 对单个源码文件做语法感知分块 */
function chunkCodeFile(content: string, filePath: string, language: string): CodeChunk[] {
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];
  let curStart = -1;
  let curLines: string[] = [];
  let curSymbol = '';

  const push = () => {
    if (curLines.length > 0) {
      chunks.push({
        content: curLines.join('\n'),
        filePath,
        startLine: curStart,
        endLine: curStart + curLines.length - 1,
        symbol: curSymbol,
        language,
      });
      curLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.length - line.trimStart().length;
    const isDef = indent === 0 && DEF_RE.test(line);
    if (isDef) {
      push();
      curStart = i + 1;
      curSymbol = extractSymbol(line);
      curLines = [line];
    } else if (curStart >= 0) {
      curLines.push(line);
    } else {
      // 文件头部（imports/注释/顶部声明）：归入一个 preamble 块
      curStart = 1;
      curSymbol = '<file header>';
      curLines.push(line);
    }
  }
  push();

  // 超长块再切
  const out: CodeChunk[] = [];
  for (const c of chunks) {
    const cl = c.content.split('\n');
    if (cl.length <= MAX_CHUNK_LINES) {
      out.push(c);
      continue;
    }
    for (let s = 0; s < cl.length; s += MAX_CHUNK_LINES) {
      const seg = cl.slice(s, s + MAX_CHUNK_LINES);
      out.push({
        content: seg.join('\n'),
        filePath,
        startLine: c.startLine + s,
        endLine: c.startLine + s + seg.length - 1,
        symbol: c.symbol + (s > 0 ? ` (p${Math.floor(s / MAX_CHUNK_LINES) + 1})` : ''),
        language,
      });
    }
  }
  return out;
}

/** 递归收集源码文件 */
function collectCodeFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue;
        walk(p);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).slice(1).toLowerCase();
        if (CODE_EXT.has(ext)) {
          try {
            if (fs.statSync(p).size <= MAX_FILE_BYTES) out.push(p);
          } catch { /* ignore */ }
        }
      }
    }
  };
  walk(root);
  return out;
}

/** 建索引：扫描目录 → 分块 → embedding → 存入向量库（独立 collection） */
export async function indexCodebase(dir?: string, context?: ToolContext): Promise<string> {
  const wsDir = getWorkspaceDir();
  const useWs = !!(wsDir && (context?.isDesktop || config.agent?.allowWebWorkspace));
  const targetRaw = dir && dir.trim() ? dir.trim() : (useWs ? wsDir! : getAgentOutputDir());
  const target = resolveTarget(targetRaw);

  const perm = classify('read', target, !!context?.isDesktop);
  if (perm === 'deny') return `已拒绝访问目录（根外且非桌面端或命中敏感清单）：${target.absPath}`;
  if (perm === 'ask') {
    if (!context?.requestApproval) return `该目录需用户确认，但当前环境无法交互（已安全拒绝）：${target.absPath}`;
    const approved = await context.requestApproval({
      requestId: randomUUID(),
      kind: 'read',
      path: target.absPath,
      inRoot: target.inRoot,
    });
    if (!approved) return `用户已拒绝索引目录：${target.absPath}`;
  }

  if (isSensitive(target.absPath)) return `拒绝索引敏感目录：${target.absPath}`;
  if (!fs.existsSync(target.absPath) || !fs.statSync(target.absPath).isDirectory()) {
    return `目录不存在或不是目录：${target.absPath}`;
  }

  const files = collectCodeFiles(target.absPath);
  if (files.length === 0) return `未找到代码文件（支持的扩展名：${[...CODE_EXT].join('/')}）：${target.absPath}`;

  // 清除该目录旧索引（以目录绝对路径作为 source 标识）
  await deleteDocumentsBySource(target.absPath);

  const texts: string[] = [];
  const metadatas: Record<string, any>[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = fs.readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    if (!content.trim()) continue;
    const ext = path.extname(f).slice(1).toLowerCase();
    const lang = LANG_BY_EXT[ext] || 'text';
    const chunks = chunkCodeFile(content, f, lang);
    for (const c of chunks) {
      if (texts.length >= MAX_TOTAL_CHUNKS) break;
      texts.push(`[${c.filePath}:${c.startLine}-${c.endLine}] (${c.language}/${c.symbol})\n${c.content}`);
      metadatas.push({
        collectionId: CODEBASE_COLLECTION,
        filePath: c.filePath,
        startLine: c.startLine,
        endLine: c.endLine,
        symbol: c.symbol,
        language: c.language,
        source: target.absPath,
        docType: 'code',
      });
    }
    if (texts.length >= MAX_TOTAL_CHUNKS) break;
  }

  if (texts.length === 0) return `未生成代码块：${target.absPath}`;
  await addDocuments(texts, metadatas);
  const capped = texts.length >= MAX_TOTAL_CHUNKS;
  return `代码库索引完成：${target.absPath}\n扫描 ${files.length} 个文件，生成 ${texts.length} 个代码块${capped ? '（已达上限，仅索引部分内容）' : ''}。可调用 search_codebase 进行语义检索。`;
}

/** 语义检索已索引的代码库 */
export async function searchCodebase(query: string, topK = 8): Promise<string> {
  if (!query || !query.trim()) return '请提供检索描述，例如"用户登录校验逻辑"';
  const results = await hybridSearch(query, topK, [CODEBASE_COLLECTION]);
  if (!results || results.length === 0) {
    return '代码库中未找到相关内容。可先调用 index_codebase 对目标目录建立索引。';
  }
  return results
    .map((r, i) => {
      const m = (r.metadata as Record<string, any>) || {};
      const score = typeof r.score === 'number' ? r.score.toFixed(2) : '?';
      return `#${i + 1} ${m.filePath}:${m.startLine}-${m.endLine} (${m.language}/${m.symbol}) [score ${score}]\n${r.content}`;
    })
    .join('\n\n---\n\n');
}
