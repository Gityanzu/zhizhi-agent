/**
 * filePermission.ts — Agent 文件工具的权限判定（allow / ask / deny）
 *
 * 对齐主流本地编程代理（Claude Code / Cursor / Codex）的模型：
 *   - 读：输出根目录内 → 静默 allow；根目录外（绝对路径）→ ask（需用户确认）
 *   - 写/覆盖：一律 ask（带 diff 预览，对齐 Cursor/Copilot 的 apply 审批）
 *   - 命中敏感清单（凭据/密钥/浏览器数据等）→ deny，绝不询问、绝不读写
 *   - 目录穿越（.. 越出根）→ 归一化后判定，根外读走 ask、写走 ask、命中敏感走 deny
 *
 * 非桌面端（Web 托管后端）：仅允许在输出根目录内读写（allow），根外一律 deny，
 * 保持"数据不出服务器沙箱"的零风险现状。
 */
import * as os from 'os';
import * as path from 'path';
import { getAgentOutputDir } from './agentOutput';
import { config } from '../config';

export type FileOperation = 'read' | 'write';
export type Permission = 'allow' | 'ask' | 'deny';

export interface ResolvedTarget {
  absPath: string;
  inRoot: boolean;
  inWorkspace: boolean; // 是否位于信任工作区（配置的工作目录）内
}

/** 敏感文件名/扩展名（正则匹配归一化后的路径，大小写不敏感） */
const SENSITIVE_PATTERNS: RegExp[] = [
  /(^|[\\/])\.env($|[\\/])/i,        // .env 文件或 .env 目录
  /[\\/]\.env\.[^\\/]+$/i,            // .env.local / .env.production 等
  /(^|[\\/])\.env$/i,                 // 根级 .env
  /[\\/]\.ssh([\\/]|$)/i,             // SSH 私钥目录
  /(^|[\\/])id_rsa($|[^.])/i,         // 私钥
  /(^|[\\/])id_dsa($|[^.])/i,
  /(^|[\\/])id_ecdsa($|[^.])/i,
  /(^|[\\/])id_ed25519($|[^.])/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /(login data|cookies|cookies-journal|web data|logins\.json|signons\.txt)$/i, // 浏览器凭据
  /[\\/]\.aws([\\/]|$)/i,             // AWS 凭据
  /[\\/]\.gnupg([\\/]|$)/i,
  /[\\/]credentials($|[\\/])/i,
  /[\\/]\.kube([\\/]|$)/i,            // Kubernetes 配置
];

/** 敏感凭据目录（家目录下），命中即 deny */
function sensitiveDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.ssh'),
    path.join(home, '.aws'),
    path.join(home, '.gnupg'),
    path.join(home, '.kube'),
  ].map(p => path.resolve(p));
}

/** 是否命中敏感清单 */
export function isSensitive(absPath: string): boolean {
  const normalized = path.resolve(absPath);
  if (SENSITIVE_PATTERNS.some(re => re.test(normalized))) return true;
  for (const dir of sensitiveDirs()) {
    const rel = path.relative(dir, normalized);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return true;
  }
  return false;
}

/**
 * 解析目标绝对路径并判断是否位于输出根目录内。
 * 相对路径基于根目录；绝对路径原样归一化。越界（.. 逃出根）会体现在 inRoot=false。
 */
/** 获取信任工作区目录（绝对路径）；未配置返回 undefined。可在 .env 设置 WORKSPACE_DIR。 */
export function getWorkspaceDir(): string | undefined {
  const w = config.agent?.workspaceDir;
  if (!w || !w.trim()) return undefined;
  return path.resolve(w.trim());
}

export function resolveTarget(inputPath: string): ResolvedTarget {
  const root = path.resolve(getAgentOutputDir());
  const trimmed = (inputPath || '').trim();
  const absPath = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(root, trimmed);
  const rel = path.relative(root, absPath);
  const inRoot = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  const ws = getWorkspaceDir();
  let inWorkspace = false;
  if (ws) {
    const relWs = path.relative(ws, absPath);
    inWorkspace = relWs === '' || (!relWs.startsWith('..') && !path.isAbsolute(relWs));
  }
  return { absPath, inRoot, inWorkspace };
}

/** 权限判定 */
export function classify(
  operation: FileOperation,
  target: ResolvedTarget,
  isDesktop: boolean
): Permission {
  // 敏感清单优先：无论读/写、桌面/非桌面，一律拒绝
  if (isSensitive(target.absPath)) return 'deny';

  // 信任工作区：配置且（桌面端 或 显式允许 Web 工作区）。工作区内读直接放行，写需审批（对齐主流本地编程代理）。
  const ws = getWorkspaceDir();
  if (ws && target.inWorkspace && (isDesktop || config.agent?.allowWebWorkspace)) {
    return operation === 'read' ? 'allow' : 'ask';
  }

  if (!isDesktop) {
    // Web 端：只在根内放开，根外直接拒绝（不弹确认，保持零风险现状）
    return target.inRoot ? 'allow' : 'deny';
  }

  if (operation === 'read') {
    // 桌面读：根内静默放行，根外需确认
    return target.inRoot ? 'allow' : 'ask';
  }

  // 桌面写/覆盖：一律 diff 审批（对齐主流）
  return 'ask';
}
