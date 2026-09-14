import { v4 as uuidv4 } from 'uuid';
import { usePostgres, query, getClient } from '../db';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  isActive: boolean;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

// 内置提示词模板
const BUILTIN_TEMPLATES = [
  {
    name: '企业知识库助手',
    description: '专业的企业知识库问答助手，回答简洁准确',
    content: '你是智知，一个专业的企业知识库智能问答助手。请直接回答用户的问题，回答要简洁、准确、有帮助。',
  },
  {
    name: '代码专家',
    description: '专注于代码编写和技术问题解答',
    content: '你是一位资深软件工程师，擅长代码编写、调试和架构设计。回答技术问题时请给出具体的代码示例和最佳实践。代码要简洁、可运行、有注释。',
  },
  {
    name: '写作助手',
    description: '帮助用户撰写和润色各类文档',
    content: '你是一位专业写作助手，擅长撰写邮件、报告、文章等各类文档。请根据用户需求，提供结构清晰、语言流畅、专业得体的文本。',
  },
  {
    name: '数据分析',
    description: '专注于数据分析和洞察',
    content: '你是一位数据分析师，擅长从数据中发现规律和洞察。回答时请用数据说话，给出清晰的分析框架和可操作的建议。',
  },
  {
    name: '创意头脑风暴',
    description: '激发创意，提供多样化的想法',
    content: '你是一位创意导师，擅长头脑风暴和创新思维。请提供多样化、有创意、可落地的想法，不要局限于常规思路。',
  },
];

// 初始化内置模板（存在则更新内容）
export async function initBuiltinTemplates(): Promise<void> {
  if (!usePostgres) return;
  
  try {
    for (const tpl of BUILTIN_TEMPLATES) {
      const existing = await query('SELECT id FROM prompt_templates WHERE name = $1 AND is_builtin = true', [tpl.name]);
      const now = new Date().toISOString();
      if (existing.rows.length === 0) {
        const id = uuidv4();
        await query(
          `INSERT INTO prompt_templates (id, name, description, content, is_active, is_builtin, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, $6, $7)`,
          [id, tpl.name, tpl.description, tpl.content, tpl.name === '企业知识库助手', now, now]
        );
      } else {
        // 内置模板存在时更新内容（保持 is_active 不变）
        await query(
          `UPDATE prompt_templates SET description = $1, content = $2, updated_at = $3 
           WHERE name = $4 AND is_builtin = true`,
          [tpl.description, tpl.content, now, tpl.name]
        );
      }
    }
  } catch (error) {
    console.warn('初始化内置模板失败:', error);
  }
}

// 获取所有模板
export async function getAllTemplates(): Promise<PromptTemplate[]> {
  if (!usePostgres) return [];
  
  try {
    const result = await query(
      `SELECT * FROM prompt_templates ORDER BY is_builtin DESC, created_at ASC`
    );
    return result.rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      content: r.content,
      isActive: r.is_active,
      isBuiltin: r.is_builtin,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  } catch (error) {
    console.warn('获取模板失败:', error);
    return [];
  }
}

// 获取当前激活的模板
export async function getActiveTemplate(): Promise<PromptTemplate | null> {
  if (!usePostgres) return null;
  
  try {
    const result = await query('SELECT * FROM prompt_templates WHERE is_active = true LIMIT 1');
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      content: r.content,
      isActive: r.is_active,
      isBuiltin: r.is_builtin,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  } catch (error) {
    console.warn('获取激活模板失败:', error);
    return null;
  }
}

// 创建模板
export async function createTemplate(name: string, description: string, content: string): Promise<PromptTemplate | null> {
  if (!usePostgres) return null;
  
  try {
    const id = uuidv4();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO prompt_templates (id, name, description, content, is_active, is_builtin, created_at, updated_at)
       VALUES ($1, $2, $3, $4, false, false, $5, $6)`,
      [id, name, description, content, now, now]
    );
    return { id, name, description, content, isActive: false, isBuiltin: false, createdAt: now, updatedAt: now };
  } catch (error) {
    console.warn('创建模板失败:', error);
    return null;
  }
}

// 更新模板
export async function updateTemplate(id: string, name: string, description: string, content: string): Promise<boolean> {
  if (!usePostgres) return false;
  
  try {
    const now = new Date().toISOString();
    await query(
      `UPDATE prompt_templates SET name = $1, description = $2, content = $3, updated_at = $4 WHERE id = $5`,
      [name, description, content, now, id]
    );
    return true;
  } catch (error) {
    console.warn('更新模板失败:', error);
    return false;
  }
}

// 删除模板
export async function deleteTemplate(id: string): Promise<boolean> {
  if (!usePostgres) return false;
  
  try {
    await query('DELETE FROM prompt_templates WHERE id = $1 AND is_builtin = false', [id]);
    return true;
  } catch (error) {
    console.warn('删除模板失败:', error);
    return false;
  }
}

// 激活模板（事务保护）
export async function activateTemplate(id: string): Promise<boolean> {
  if (!usePostgres) return false;
  
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE prompt_templates SET is_active = false WHERE is_active = true');
    await client.query('UPDATE prompt_templates SET is_active = true WHERE id = $1', [id]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.warn('激活模板失败:', error);
    return false;
  } finally {
    client.release();
  }
}
