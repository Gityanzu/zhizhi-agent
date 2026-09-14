import { v4 as uuidv4 } from 'uuid';
import { usePostgres, query } from '../db';
import { getLLM } from './llm';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export interface Memory {
  id: string;
  content: string;
  category: string;
  importance: number;
  sourceSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

// 从对话中提取记忆
export async function extractMemories(
  messages: Array<{ role: string; content: string }>,
  sessionId?: string
): Promise<Memory[]> {
  if (!usePostgres || messages.length === 0) return [];
  
  try {
    const llm = getLLM();
    const conversationText = messages
      .slice(-10)
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n');
    
    const response = await llm.invoke([
      new SystemMessage(`你是一个记忆提取助手。请从以下对话中提取用户的偏好、习惯、重要事实和长期信息。
要求：
1. 只提取用户明确表达的信息，不要推测
2. 每条记忆简洁明了，不超过50字
3. 分类：preference（偏好）、fact（事实）、habit（习惯）、project（项目）、other（其他）
4. 重要性评分1-10，10最重要
5. 返回JSON格式：{"memories": [{"content": "...", "category": "...", "importance": 5}]}
6. 如果没有值得记忆的信息，返回空数组`),
      new HumanMessage(`对话内容：\n${conversationText}\n\n请提取记忆：`),
    ]);
    
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    
    // 解析 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[0]);
    const memories = parsed.memories || [];
    
    // 存储到数据库
    const results: Memory[] = [];
    for (const mem of memories) {
      if (mem.content && mem.content.length > 0) {
        const id = uuidv4();
        const now = new Date().toISOString();
        await query(
          `INSERT INTO memories (id, content, category, importance, source_session_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (content) DO UPDATE SET updated_at = $6, importance = $4`,
          [id, mem.content, mem.category || 'general', mem.importance || 5, sessionId || null, now, now]
        );
        results.push({
          id,
          content: mem.content,
          category: mem.category || 'general',
          importance: mem.importance || 5,
          sourceSessionId: sessionId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    
    return results;
  } catch (error) {
    console.warn('提取记忆失败:', error);
    return [];
  }
}

// 获取所有记忆
export async function getAllMemories(): Promise<Memory[]> {
  if (!usePostgres) return [];
  
  try {
    const result = await query(
      `SELECT * FROM memories ORDER BY importance DESC, created_at DESC LIMIT 100`
    );
    return result.rows.map(r => ({
      id: r.id,
      content: r.content,
      category: r.category,
      importance: r.importance,
      sourceSessionId: r.source_session_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  } catch (error) {
    console.warn('获取记忆失败:', error);
    return [];
  }
}

// 获取相关记忆（用于注入对话上下文）
export async function getRelevantMemories(limit: number = 5): Promise<string[]> {
  if (!usePostgres) return [];
  
  try {
    const result = await query(
      `SELECT content FROM memories ORDER BY importance DESC, updated_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(r => r.content);
  } catch (error) {
    console.warn('获取相关记忆失败:', error);
    return [];
  }
}

// 删除记忆
export async function deleteMemory(id: string): Promise<boolean> {
  if (!usePostgres) return false;
  
  try {
    await query('DELETE FROM memories WHERE id = $1', [id]);
    return true;
  } catch (error) {
    console.warn('删除记忆失败:', error);
    return false;
  }
}

// 清空所有记忆
export async function clearAllMemories(): Promise<boolean> {
  if (!usePostgres) return false;
  
  try {
    await query('DELETE FROM memories');
    return true;
  } catch (error) {
    console.warn('清空记忆失败:', error);
    return false;
  }
}
