import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { usePostgres, query } from '../db';
import { getSessionInfo, getSessionMessages } from './session';

// ===== 功能17：对话分享 =====

export interface ShareInfo {
  id: string;
  sessionId: string;
  shareToken: string;
  password: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const PERSIST_DIR = path.resolve(__dirname, '../../data');
const SHARES_FILE = path.join(PERSIST_DIR, 'shares.json');

if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

const shares = new Map<string, ShareInfo>();
let loaded = false;

function loadFromFile(): void {
  if (loaded) return;
  if (fs.existsSync(SHARES_FILE)) {
    try {
      const raw = fs.readFileSync(SHARES_FILE, 'utf-8');
      const arr = JSON.parse(raw) as ShareInfo[];
      for (const s of arr) shares.set(s.id, s);
      console.log(`分享记录已加载: ${shares.size} 条`);
    } catch (e) {
      console.warn('加载分享记录失败:', e);
    }
  }
  loaded = true;
}

function saveToFile(): void {
  try {
    fs.writeFileSync(SHARES_FILE, JSON.stringify(Array.from(shares.values()), null, 2), 'utf-8');
  } catch (e) {
    console.error('保存分享记录失败:', e);
  }
}

loadFromFile();

function generateToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

// 创建分享
export async function createShare(
  sessionId: string,
  password?: string,
  expiresInHours?: number
): Promise<ShareInfo> {
  const id = uuidv4();
  const shareToken = generateToken();
  const now = new Date().toISOString();
  let expiresAt: string | null = null;
  if (expiresInHours && expiresInHours > 0) {
    expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();
  }

  const info: ShareInfo = {
    id,
    sessionId,
    shareToken,
    password: password || null,
    expiresAt,
    createdAt: now,
  };

  if (usePostgres) {
    await query(
      'INSERT INTO shares (id, session_id, share_token, password, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, sessionId, shareToken, password || null, expiresAt, now]
    );
  } else {
    shares.set(id, info);
    saveToFile();
  }
  return info;
}

// 通过 token 获取分享记录（不校验过期，由调用方决定）
export async function getShareByToken(token: string): Promise<ShareInfo | null> {
  if (usePostgres) {
    const result = await query(
      'SELECT id, session_id, share_token, password, expires_at, created_at FROM shares WHERE share_token = $1',
      [token]
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  } else {
    const found = Array.from(shares.values()).find(s => s.shareToken === token);
    return found || null;
  }
}

// 通过 id 获取分享记录
export async function getShareById(id: string): Promise<ShareInfo | null> {
  if (usePostgres) {
    const result = await query(
      'SELECT id, session_id, share_token, password, expires_at, created_at FROM shares WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  } else {
    return shares.get(id) || null;
  }
}

// 列出某会话的所有分享（用于撤销管理）
export async function listSharesBySession(sessionId: string): Promise<ShareInfo[]> {
  if (usePostgres) {
    const result = await query(
      'SELECT id, session_id, share_token, password, expires_at, created_at FROM shares WHERE session_id = $1 ORDER BY created_at DESC',
      [sessionId]
    );
    return result.rows.map(mapRow);
  } else {
    return Array.from(shares.values()).filter(s => s.sessionId === sessionId);
  }
}

function mapRow(row: any): ShareInfo {
  return {
    id: row.id,
    sessionId: row.session_id,
    shareToken: row.share_token,
    password: row.password || null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function isExpired(share: ShareInfo): boolean {
  if (!share.expiresAt) return false;
  return new Date(share.expiresAt).getTime() < Date.now();
}

// 获取分享的会话消息（只读）。需校验密码与过期。
export async function getShareSessionMessages(
  token: string,
  password?: string
): Promise<{ ok: true; title: string; messages: any[] } | { ok: false; reason: 'not_found' | 'expired' | 'bad_password' }> {
  const share = await getShareByToken(token);
  if (!share) return { ok: false, reason: 'not_found' };
  if (isExpired(share)) return { ok: false, reason: 'expired' };
  if (share.password) {
    if (!password || password !== share.password) {
      return { ok: false, reason: 'bad_password' };
    }
  }
  const info = await getSessionInfo(share.sessionId);
  if (!info) return { ok: false, reason: 'not_found' };
  const messages = await getSessionMessages(share.sessionId);
  // 只暴露只读需要的字段
  const safeMessages = messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    thinking: m.thinking,
    toolCalls: m.toolCalls,
    sources: m.sources,
  }));
  return { ok: true, title: info.title, messages: safeMessages };
}

// 撤销分享
export async function revokeShare(shareId: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query('DELETE FROM shares WHERE id = $1', [shareId]);
    return (result.rowCount || 0) > 0;
  } else {
    const existed = shares.delete(shareId);
    if (existed) saveToFile();
    return existed;
  }
}
