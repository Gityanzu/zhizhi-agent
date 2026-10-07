/**
 * SKILL.md 文件化技能加载器（对标 Claude Skills 机制）
 *
 * 技能库目录结构（每个技能一个文件夹）：
 *   skills-library/<skill-id>/
 *     SKILL.md            — frontmatter（元数据）+ 正文（system prompt）
 *     references/*.md     — 可选深度文档（渐进披露：详情页展示、按需注入）
 *
 * SKILL.md 格式：
 *   ---
 *   id: rag-search
 *   name: RAG 文档检索
 *   description: 面向企业知识库的检索问答
 *   icon: 🔍
 *   version: 1.0.0
 *   trigger_keywords:
 *     - 检索
 *     - 知识库
 *   allowed_tools: [search_knowledge_base]   # 支持行内数组或列表两种写法
 *   ---
 *   正文 Markdown 即 system prompt…
 */

import fs from 'fs';
import path from 'path';
import type { SkillDefinition } from './index';

export interface SkillReference {
  name: string;
  file: string;
}

export interface LoadedFileSkill {
  skill: SkillDefinition;
  dir: string;                     // 技能文件夹绝对路径
  body: string;                    // SKILL.md 正文（system prompt）
  references: SkillReference[];    // references/ 下的深度文档
  version: string;
}

// ==================== frontmatter 解析（极简 YAML 子集，零依赖） ====================

/**
 * 解析 SKILL.md：返回 { meta, body }；无合法 frontmatter 返回 null
 */
export function parseSkillMarkdown(content: string): { meta: Record<string, string | string[]>; body: string } | null {
  // 容忍 BOM 与 CRLF
  const text = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const [, front, body] = match;
  const meta: Record<string, string | string[]> = {};
  let currentKey: string | null = null;

  for (const rawLine of front.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // 列表项："  - 值"（归属最近的 key）
    const listItem = line.match(/^\s+-\s*(.*)$/);
    if (listItem && currentKey) {
      const cur = meta[currentKey];
      const arr = Array.isArray(cur) ? cur : (cur ? [String(cur)] : []);
      arr.push(stripQuotes(listItem[1].trim()));
      meta[currentKey] = arr;
      continue;
    }

    // 键值行："key: value"
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) {
      const key = normalizeKey(kv[1]);
      const value = kv[2].trim();
      currentKey = key;
      if (!value) {
        meta[key] = [];              // 下一行开始是列表
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // 行内数组：[a, b, c]
        const inner = value.slice(1, -1).trim();
        meta[key] = inner ? inner.split(',').map(s => stripQuotes(s.trim())).filter(Boolean) : [];
      } else {
        meta[key] = stripQuotes(value);
      }
    }
  }

  return { meta, body: body.trim() };
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// trigger_keywords / triggerKeywords 两种写法都接受
function normalizeKey(key: string): string {
  const map: Record<string, string> = {
    trigger_keywords: 'triggerKeywords',
    allowed_tools: 'allowedTools',
  };
  return map[key] || key;
}

// ==================== 目录扫描 ====================

/**
 * 从技能库根目录加载全部文件型技能。
 * 目录不存在返回空数组；单个技能解析失败只告警跳过，不影响其他技能。
 */
export function loadSkillsFromLibrary(rootDir: string): LoadedFileSkill[] {
  const loaded: LoadedFileSkill[] = [];
  if (!fs.existsSync(rootDir)) return loaded;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return loaded;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(rootDir, entry.name);
    const skillFile = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;

    try {
      const loadedSkill = loadOneSkill(dir, skillFile, entry.name);
      if (loadedSkill) loaded.push(loadedSkill);
    } catch (err) {
      console.warn(`[skills] 解析技能失败（跳过）${dir}:`, err);
    }
  }

  return loaded;
}

function loadOneSkill(dir: string, skillFile: string, fallbackId: string): LoadedFileSkill | null {
  const parsed = parseSkillMarkdown(fs.readFileSync(skillFile, 'utf-8'));
  if (!parsed) {
    console.warn(`[skills] ${skillFile} 缺少合法 frontmatter，已跳过`);
    return null;
  }
  const { meta, body } = parsed;

  const id = String(meta.id || fallbackId).trim();
  const name = String(meta.name || id).trim();
  if (!body) {
    console.warn(`[skills] ${skillFile} 正文为空，已跳过`);
    return null;
  }

  const asArray = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : (v ? [v] : []);

  const skill: SkillDefinition = {
    id,
    name,
    description: String(meta.description || ''),
    icon: String(meta.icon || '📚'),
    triggerKeywords: asArray(meta.triggerKeywords as string[]),
    systemPrompt: body,
    allowedTools: asArray(meta.allowedTools as string[]),
    examples: [],
    source: 'file',
  };

  // references/*.md（按文件名排序）
  const refsDir = path.join(dir, 'references');
  const references: SkillReference[] = [];
  if (fs.existsSync(refsDir)) {
    for (const f of fs.readdirSync(refsDir).sort()) {
      if (f.toLowerCase().endsWith('.md')) {
        references.push({ name: f.replace(/\.md$/i, ''), file: path.join(refsDir, f) });
      }
    }
  }

  return { skill, dir, body, references, version: String(meta.version || '1.0.0') };
}

/**
 * 读取某个技能的全部 reference 内容（详情页/注入用）
 */
export function readSkillReferences(loaded: LoadedFileSkill): Array<{ name: string; content: string }> {
  return loaded.references.map(ref => ({
    name: ref.name,
    content: fs.readFileSync(ref.file, 'utf-8'),
  }));
}
