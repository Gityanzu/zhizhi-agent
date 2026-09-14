import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, SessionInfo, Folder, BranchInfo } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { usePostgres, query } from '../db';

// 持久化文件路径（JSON 模式）
const PERSIST_DIR = path.resolve(__dirname, '../../data');
const SESSIONS_FILE = path.join(PERSIST_DIR, 'sessions.json');
const FOLDERS_FILE = path.join(PERSIST_DIR, 'folders.json');

// 确保目录存在
if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

// 会话存储（JSON 文件模式）
interface SessionData {
  info: SessionInfo;
  messages: ChatMessage[];
}

const sessions = new Map<string, SessionData>();
const folders = new Map<string, Folder>();
let initialized = false;

// 从文件加载会话
function loadFromFile(): void {
  if (initialized) return;

  if (fs.existsSync(SESSIONS_FILE)) {
    try {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, SessionData>;
      for (const [id, session] of Object.entries(data)) {
        sessions.set(id, session);
      }
      console.log(`会话存储已加载: ${sessions.size} 个会话`);
    } catch (error) {
      console.warn('加载会话存储失败，将创建新存储:', error);
    }
  }

  if (fs.existsSync(FOLDERS_FILE)) {
    try {
      const raw = fs.readFileSync(FOLDERS_FILE, 'utf-8');
      const data = JSON.parse(raw) as Folder[];
      for (const folder of data) {
        folders.set(folder.id, folder);
      }
    } catch (error) {
      console.warn('加载文件夹存储失败:', error);
    }
  }

  initialized = true;
}

// 保存到文件
function saveToFile(): void {
  try {
    const data: Record<string, SessionData> = {};
    for (const [id, session] of sessions.entries()) {
      data[id] = session;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    fs.writeFileSync(FOLDERS_FILE, JSON.stringify(Array.from(folders.values()), null, 2), 'utf-8');
  } catch (error) {
    console.error('保存会话存储失败:', error);
  }
}

// 初始化
loadFromFile();

// ============ 工具函数 ============

// 将数据库行映射为 ChatMessage
function mapMessageRow(row: any): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    mode: row.mode,
    timestamp: row.created_at,
    toolCalls: row.tool_calls || [],
    sources: row.sources || [],
    thinking: row.thinking,
    plan: row.plan,
    agentTrace: row.agent_trace,
    tokenUsage: row.token_usage,
    parentId: row.parent_id || undefined,
    branchId: row.branch_id || undefined,
  };
}

// 将数据库行映射为 SessionInfo
function mapSessionRow(row: any): SessionInfo {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
    folderId: row.folder_id || null,
    isPinned: row.is_pinned || false,
    tags: Array.isArray(row.tags) ? row.tags : [],
    currentBranchId: row.current_branch_id || null,
    collectionIds: Array.isArray(row.collection_ids) ? row.collection_ids : [],
    mode: row.mode || 'agent',
    model: row.model || null,
  };
}

// 创建新会话
export async function createSession(title?: string, mode?: string, model?: string): Promise<SessionInfo> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const info: SessionInfo = {
    id,
    title: title || '新对话',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    folderId: null,
    isPinned: false,
    tags: [],
    currentBranchId: null,
  };

  if (usePostgres) {
    await query(
      'INSERT INTO sessions (id, title, mode, model, created_at, updated_at, message_count, folder_id, is_pinned, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [id, info.title, mode || 'agent', model || null, now, now, 0, null, false, '[]']
    );
  } else {
    sessions.set(id, { info, messages: [] });
    saveToFile();
  }

  return info;
}

// 获取会话消息（可选按分支；不传则返回当前活动分支=最新分支）
export async function getSessionMessages(sessionId: string, branchId?: string): Promise<ChatMessage[]> {
  if (usePostgres) {
    let targetBranch = branchId;
    if (!targetBranch) {
      // 活动分支 = 最新一条消息所属的分支
      const latest = await query(
        'SELECT branch_id FROM messages WHERE session_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
        [sessionId]
      );
      targetBranch = latest.rows[0]?.branch_id || null;
    }
    if (!targetBranch) return [];
    const result = await query(
      `SELECT id, role, content, mode, created_at, tool_calls, sources, thinking, plan, agent_trace, token_usage, parent_id, branch_id
       FROM messages WHERE session_id = $1 AND branch_id = $2 ORDER BY created_at ASC, id ASC`,
      [sessionId, targetBranch]
    );
    return result.rows.map(mapMessageRow);
  } else {
    const session = sessions.get(sessionId);
    if (!session) return [];
    let target = branchId;
    if (!target) {
      // 活动分支 = 最后一条消息的 branchId
      target = session.messages.length > 0 ? (session.messages[session.messages.length - 1].branchId || undefined) : undefined;
    }
    if (!target) return session.messages.filter(m => !m.branchId);
    return session.messages.filter(m => m.branchId === target);
  }
}

// 获取指定分支的消息链
export async function getMessageBranch(sessionId: string, branchId: string): Promise<ChatMessage[]> {
  return getSessionMessages(sessionId, branchId);
}

// 获取会话所有分支列表
export async function getMessageBranches(sessionId: string): Promise<BranchInfo[]> {
  // 统一在应用层聚合（PG / JSON 一致），避免两套 SQL 差异
  let allMessages: ChatMessage[] = [];
  if (usePostgres) {
    const result = await query(
      `SELECT id, role, content, created_at, branch_id FROM messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC`,
      [sessionId]
    );
    allMessages = result.rows.map(mapMessageRow);
  } else {
    allMessages = sessions.get(sessionId)?.messages || [];
  }

  const branchMap = new Map<string, ChatMessage[]>();
  for (const msg of allMessages) {
    const bid = msg.branchId || 'default';
    if (!branchMap.has(bid)) branchMap.set(bid, []);
    branchMap.get(bid)!.push(msg);
  }

  const branches: BranchInfo[] = [];
  for (const [branchId, msgs] of branchMap.entries()) {
    const firstUser = msgs.find(m => m.role === 'user');
    branches.push({
      branchId,
      rootMessageId: msgs[0]?.id,
      createdAt: msgs[0]?.timestamp || new Date().toISOString(),
      messageCount: msgs.length,
      preview: firstUser?.content?.slice(0, 40) || '(空分支)',
    });
  }
  // 按创建时间升序
  branches.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return branches;
}

// 添加消息到会话
export async function addMessage(
  sessionId: string,
  role: ChatMessage['role'],
  content: string,
  mode?: string,
  extra?: {
    toolCalls?: any[];
    sources?: any[];
    thinking?: string;
    plan?: any;
    agentTrace?: any[];
    tokenUsage?: any;
    parentId?: string;
    branchId?: string;
  }
): Promise<string> {
  const messageId = uuidv4();
  const now = new Date().toISOString();

  if (usePostgres) {
    await query(
      `INSERT INTO messages (id, session_id, role, content, mode, created_at, tool_calls, sources, thinking, plan, agent_trace, token_usage, parent_id, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        messageId, sessionId, role, content, mode || null, now,
        extra?.toolCalls ? JSON.stringify(extra.toolCalls) : '[]',
        extra?.sources ? JSON.stringify(extra.sources) : '[]',
        extra?.thinking || null,
        extra?.plan ? JSON.stringify(extra.plan) : null,
        extra?.agentTrace ? JSON.stringify(extra.agentTrace) : null,
        extra?.tokenUsage ? JSON.stringify(extra.tokenUsage) : null,
        extra?.parentId || null,
        extra?.branchId || null,
      ]
    );
    // 更新会话的 message_count 和 updated_at
    await query(
      'UPDATE sessions SET message_count = message_count + 1, updated_at = $1 WHERE id = $2',
      [now, sessionId]
    );
    // 如果是第一条用户消息，用它作为会话标题
    if (role === 'user') {
      const countResult = await query(
        'SELECT COUNT(*) as cnt FROM messages WHERE session_id = $1 AND role = $2',
        [sessionId, 'user']
      );
      if (parseInt(countResult.rows[0].cnt, 10) === 1) {
        const title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
        await query('UPDATE sessions SET title = $1 WHERE id = $2', [title, sessionId]);
      }
    }
  } else {
    const session = sessions.get(sessionId);
    if (session) {
      const msg: ChatMessage = {
        id: messageId,
        role,
        content,
        timestamp: now,
        mode,
        ...(extra?.toolCalls ? { toolCalls: extra.toolCalls } : {}),
        ...(extra?.sources ? { sources: extra.sources } : {}),
        ...(extra?.thinking ? { thinking: extra.thinking } : {}),
        ...(extra?.plan ? { plan: extra.plan } : {}),
        ...(extra?.agentTrace ? { agentTrace: extra.agentTrace } : {}),
        ...(extra?.tokenUsage ? { tokenUsage: extra.tokenUsage } : {}),
        ...(extra?.parentId ? { parentId: extra.parentId } : {}),
        ...(extra?.branchId ? { branchId: extra.branchId } : {}),
      };
      session.messages.push(msg);
      session.info.messageCount = session.messages.length;
      session.info.updatedAt = now;

      if (role === 'user' && session.messages.filter(m => m.role === 'user').length === 1) {
        session.info.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
      }
      saveToFile();
    }
  }

  return messageId;
}

// 编辑消息内容
export async function editMessage(messageId: string, content: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query('UPDATE messages SET content = $1 WHERE id = $2', [content, messageId]);
    return (result.rowCount || 0) > 0;
  } else {
    for (const session of sessions.values()) {
      const msg = session.messages.find(m => m.id === messageId);
      if (msg) {
        msg.content = content;
        saveToFile();
        return true;
      }
    }
    return false;
  }
}

// 切换会话当前分支
export async function switchBranch(sessionId: string, branchId: string): Promise<boolean> {
  if (usePostgres) {
    await query('UPDATE sessions SET current_branch_id = $1 WHERE id = $2', [branchId, sessionId]);
    return true;
  } else {
    const session = sessions.get(sessionId);
    if (!session) return false;
    session.info.currentBranchId = branchId;
    saveToFile();
    return true;
  }
}

// 获取所有会话（支持按文件夹/标签筛选，置顶优先排序）
export async function getAllSessions(opts?: { folderId?: string | null; tag?: string }): Promise<SessionInfo[]> {
  if (usePostgres) {
    let sql = 'SELECT id, title, created_at, updated_at, message_count, folder_id, is_pinned, tags, current_branch_id, collection_ids, mode, model FROM sessions WHERE 1=1';
    const params: any[] = [];
    if (opts?.folderId) {
      params.push(opts.folderId);
      sql += ` AND folder_id = $${params.length}`;
    } else if (opts?.folderId === null) {
      sql += ` AND folder_id IS NULL`;
    }
    if (opts?.tag) {
      params.push(opts.tag);
      sql += ` AND $${params.length} = ANY(tags)`;
    }
    sql += ' ORDER BY is_pinned DESC, updated_at DESC';
    const result = await query(sql, params);
    return result.rows.map(mapSessionRow);
  } else {
    let list = Array.from(sessions.values()).map(s => s.info);
    if (opts?.folderId) {
      list = list.filter(s => s.folderId === opts.folderId);
    } else if (opts?.folderId === null) {
      list = list.filter(s => !s.folderId);
    }
    if (opts?.tag) {
      list = list.filter(s => (s.tags || []).includes(opts.tag!));
    }
    return list.sort((a, b) => {
      const pinnedDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
      if (pinnedDiff !== 0) return pinnedDiff;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }
}

// 获取会话信息
export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  if (usePostgres) {
    const result = await query(
      'SELECT id, title, created_at, updated_at, message_count, folder_id, is_pinned, tags, current_branch_id, collection_ids, mode, model FROM sessions WHERE id = $1',
      [sessionId]
    );
    if (result.rows.length === 0) return null;
    return mapSessionRow(result.rows[0]);
  } else {
    return sessions.get(sessionId)?.info || null;
  }
}

// 删除会话
export async function deleteSession(sessionId: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    return (result.rowCount || 0) > 0;
  } else {
    const result = sessions.delete(sessionId);
    if (result) saveToFile();
    return result;
  }
}

// 清空会话消息
export async function clearSession(sessionId: string): Promise<boolean> {
  if (usePostgres) {
    await query('DELETE FROM messages WHERE session_id = $1', [sessionId]);
    await query(
      'UPDATE sessions SET message_count = 0, updated_at = $1 WHERE id = $2',
      [new Date().toISOString(), sessionId]
    );
    return true;
  } else {
    const session = sessions.get(sessionId);
    if (!session) return false;
    session.messages = [];
    session.info.messageCount = 0;
    session.info.updatedAt = new Date().toISOString();
    saveToFile();
    return true;
  }
}

// ============ 文件夹 CRUD ============

export async function createFolder(name: string, icon?: string): Promise<Folder> {
  const id = uuidv4();
  const now = new Date().toISOString();
  if (usePostgres) {
    await query('INSERT INTO folders (id, name, icon, sort_order, created_at) VALUES ($1, $2, $3, $4, $5)', [
      id, name, icon || '📁', 0, now,
    ]);
  } else {
    folders.set(id, { id, name, icon: icon || '📁', sortOrder: 0, createdAt: now });
    saveToFile();
  }
  return { id, name, icon: icon || '📁', sortOrder: 0, createdAt: now };
}

export async function getAllFolders(): Promise<Folder[]> {
  if (usePostgres) {
    const result = await query('SELECT id, name, icon, sort_order, created_at FROM folders ORDER BY sort_order ASC, created_at ASC');
    return result.rows.map(r => ({
      id: r.id, name: r.name, icon: r.icon, sortOrder: r.sort_order, createdAt: r.created_at,
    }));
  } else {
    return Array.from(folders.values()).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }
}

export async function updateFolder(folderId: string, name?: string, icon?: string): Promise<boolean> {
  if (usePostgres) {
    const sets: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`); }
    if (icon !== undefined) { params.push(icon); sets.push(`icon = $${params.length}`); }
    if (sets.length === 0) return true;
    params.push(folderId);
    await query(`UPDATE folders SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    return true;
  } else {
    const folder = folders.get(folderId);
    if (!folder) return false;
    if (name !== undefined) folder.name = name;
    if (icon !== undefined) folder.icon = icon;
    saveToFile();
    return true;
  }
}

export async function deleteFolder(folderId: string): Promise<boolean> {
  if (usePostgres) {
    // 删除文件夹时其内会话 folder_id 置空
    await query('UPDATE sessions SET folder_id = NULL WHERE folder_id = $1', [folderId]);
    const result = await query('DELETE FROM folders WHERE id = $1', [folderId]);
    return (result.rowCount || 0) > 0;
  } else {
    for (const session of sessions.values()) {
      if (session.info.folderId === folderId) session.info.folderId = null;
    }
    const result = folders.delete(folderId);
    if (result) saveToFile();
    return result;
  }
}

// ============ 会话归类 / 置顶 / 标签 ============

export async function updateSessionFolder(sessionId: string, folderId: string | null): Promise<boolean> {
  if (usePostgres) {
    await query('UPDATE sessions SET folder_id = $1 WHERE id = $2', [folderId, sessionId]);
    return true;
  } else {
    const session = sessions.get(sessionId);
    if (!session) return false;
    session.info.folderId = folderId;
    saveToFile();
    return true;
  }
}

export async function toggleSessionPin(sessionId: string): Promise<boolean> {
  if (usePostgres) {
    await query('UPDATE sessions SET is_pinned = NOT is_pinned WHERE id = $1', [sessionId]);
    return true;
  } else {
    const session = sessions.get(sessionId);
    if (!session) return false;
    session.info.isPinned = !session.info.isPinned;
    saveToFile();
    return true;
  }
}

export async function updateSessionTags(sessionId: string, tags: string[]): Promise<boolean> {
  if (usePostgres) {
    await query('UPDATE sessions SET tags = $1 WHERE id = $2', [JSON.stringify(tags), sessionId]);
    return true;
  } else {
    const session = sessions.get(sessionId);
    if (!session) return false;
    session.info.tags = tags;
    saveToFile();
    return true;
  }
}

// ============ 功能8：会话关联知识库 ============

export async function updateSessionCollections(sessionId: string, collectionIds: string[]): Promise<boolean> {
  if (usePostgres) {
    await query('UPDATE sessions SET collection_ids = $1 WHERE id = $2', [JSON.stringify(collectionIds || []), sessionId]);
    return true;
  } else {
    const session = sessions.get(sessionId);
    if (!session) return false;
    session.info.collectionIds = collectionIds || [];
    saveToFile();
    return true;
  }
}

// 更新会话的模型和模式
export async function updateSessionModelMode(sessionId: string, mode?: string, model?: string): Promise<boolean> {
  if (usePostgres) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (mode !== undefined) {
      updates.push(`mode = $${paramIndex}`);
      params.push(mode);
      paramIndex++;
    }
    if (model !== undefined) {
      updates.push(`model = $${paramIndex}`);
      params.push(model);
      paramIndex++;
    }
    
    if (updates.length === 0) return false;
    
    params.push(sessionId);
    await query(`UPDATE sessions SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);
    return true;
  } else {
    const session = sessions.get(sessionId);
    if (!session) return false;
    if (mode !== undefined) session.info.mode = mode;
    if (model !== undefined) session.info.model = model;
    saveToFile();
    return true;
  }
}
