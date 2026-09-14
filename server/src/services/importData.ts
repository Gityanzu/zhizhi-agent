import { createSession, addMessage } from './session';

// ===== 功能18：数据导入（ChatGPT / Claude） =====

export interface ImportResult {
  successCount: number;
  failCount: number;
  sessionIds: string[];
  errors: string[];
}

function textOf(content: any): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content.parts)) {
    return content.parts.filter((p: any) => typeof p === 'string').join('\n');
  }
  if (typeof content.text === 'string') return content.text;
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('\n');
  }
  return '';
}

function safeTime(ts: any): string {
  if (!ts) return new Date().toISOString();
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ChatGPT 导出：{ conversations: [ { title, mapping: { nodeId: { message, children } } } ] }
function parseChatGPT(conversations: any[]): Array<{ role: 'user' | 'assistant'; content: string; time: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string; time: string }> = [];
  for (const conv of conversations) {
    const mapping = conv && conv.mapping;
    if (!mapping || typeof mapping !== 'object') continue;
    for (const node of Object.values(mapping) as any[]) {
      const msg = node && node.message;
      if (!msg) continue;
      const role = msg.author && msg.author.role;
      if (role !== 'user' && role !== 'assistant') continue;
      const content = textOf(msg.content);
      if (!content.trim()) continue;
      out.push({ role, content, time: safeTime(msg.create_time) });
    }
  }
  out.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return out;
}

// Claude 导出：兼容 { conversations: [ { chat_messages: [{sender, text, created_at}] } ] }
// 或顶层直接为 [{ chat_messages: [...] }] / [{ messages: [...] }]
function parseClaudeConversations(list: any[]): Array<{ role: 'user' | 'assistant'; content: string; time: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string; time: string }> = [];
  for (const conv of list) {
    const msgs = (conv && (conv.chat_messages || conv.messages)) || [];
    for (const m of msgs) {
      const sender = (m.sender || m.role || '').toLowerCase();
      const role = sender === 'human' || sender === 'user' ? 'user' : 'assistant';
      const content = textOf(m.text || m.content);
      if (!content.trim()) continue;
      out.push({ role, content, time: safeTime(m.created_at || m.timestamp) });
    }
  }
  out.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return out;
}

async function importOneConversation(
  titleRaw: string | undefined,
  turns: Array<{ role: 'user' | 'assistant'; content: string; time: string }>
): Promise<string | null> {
  if (turns.length === 0) return null;
  const firstUser = turns.find(t => t.role === 'user');
  const title = (titleRaw || (firstUser ? firstUser.content.slice(0, 30) : '导入对话')).slice(0, 200);
  const session = await createSession(title, 'qa');
  for (const turn of turns) {
    await addMessage(session.id, turn.role, turn.content, 'qa');
  }
  return session.id;
}

// 导入 ChatGPT 导出的 JSON
export async function importChatGPTConversations(jsonData: any): Promise<ImportResult> {
  const result: ImportResult = { successCount: 0, failCount: 0, sessionIds: [], errors: [] };
  try {
    const conversations = Array.isArray(jsonData) ? jsonData : jsonData?.conversations;
    if (!Array.isArray(conversations)) {
      throw new Error('格式错误：未找到 conversations 数组');
    }
    for (const conv of conversations) {
      try {
        const turns = parseChatGPT([conv]);
        const sid = await importOneConversation(conv?.title, turns);
        if (sid) {
          result.successCount++;
          result.sessionIds.push(sid);
        } else {
          result.failCount++;
          result.errors.push(`跳过空会话：${conv?.title || '(无标题)'}`);
        }
      } catch (e) {
        result.failCount++;
        result.errors.push(`会话「${conv?.title || '(无标题)'}」导入失败：${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }
  return result;
}

// 导入 Claude 导出的 JSON
export async function importClaudeConversations(jsonData: any): Promise<ImportResult> {
  const result: ImportResult = { successCount: 0, failCount: 0, sessionIds: [], errors: [] };
  try {
    let list: any[] = [];
    if (Array.isArray(jsonData)) {
      list = jsonData;
    } else if (Array.isArray(jsonData?.conversations)) {
      list = jsonData.conversations;
    } else if (jsonData?.chat_messages) {
      // 单个对话文件
      list = [jsonData];
    } else {
      throw new Error('格式错误：无法识别的 Claude 对话格式');
    }
    for (const conv of list) {
      try {
        const turns = parseClaudeConversations([conv]);
        const sid = await importOneConversation(conv?.name || conv?.title, turns);
        if (sid) {
          result.successCount++;
          result.sessionIds.push(sid);
        } else {
          result.failCount++;
          result.errors.push(`跳过空会话：${conv?.name || conv?.title || '(无标题)'}`);
        }
      } catch (e) {
        result.failCount++;
        result.errors.push(`会话「${conv?.name || conv?.title || '(无标题)'}」导入失败：${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }
  return result;
}
