import { v4 as uuidv4 } from 'uuid';
import { usePostgres, query } from '../db';
import type {
  PublicTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  ReviewTemplateRequest,
  TemplateListParams,
  TemplateListResponse,
  TemplateFacets,
  FacetOption,
  DownloadRecord,
  TemplateFavorite,
  TemplateStats,
  TemplateVersionHistory,
  TemplateReport,
  TemplateStatus,
  TemplateType,
} from '../types/template';

/**
 * 验证模板数据
 */
function validateTemplate(data: CreateTemplateRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.name || data.name.trim().length < 2) {
    errors.push('模板名称至少需要 2 个字符');
  }

  if (!data.title || data.title.trim().length < 3) {
    errors.push('模板标题至少需要 3 个字符');
  }

  if (!data.description || data.description.trim().length < 10) {
    errors.push('模板描述至少需要 10 个字符');
  }

  if (!data.systemPrompt || data.systemPrompt.trim().length < 50) {
    errors.push('系统提示词至少需要 50 个字符');
  }

  if (!data.model) {
    errors.push('模型不能为空');
  }

  if (!Array.isArray(data.tools) || data.tools.length === 0) {
    errors.push('至少需要一个工具');
  }

  if (data.temperature < 0 || data.temperature > 2) {
    errors.push('温度值必须在 0-2 之间');
  }

  if (!data.category) {
    errors.push('分类不能为空');
  }

  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    errors.push('至少需要一个标签');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 将数据库行转换为模板对象
 */
function mapTemplateRow(row: any): PublicTemplate {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    description: row.description || '',
    systemPrompt: row.system_prompt,
    model: row.model,
    tools: row.tools || [],
    temperature: row.temperature || 0.7,
    category: row.category,
    tags: row.tags || [],
    type: row.type || 'public',
    status: row.status || 'pending',
    version: row.version || '1.0.0',
    viewCount: row.view_count || 0,
    downloadCount: row.download_count || 0,
    likeCount: row.like_count || 0,
    rating: parseFloat(row.rating) || 0,
    reviewCount: row.review_count || 0,
    author: {
      id: row.author_id,
      name: row.author_name || '未知作者',
      avatar: row.author_avatar,
      bio: row.author_bio,
    },
    features: row.features || [],
    screenshots: row.screenshots || [],
    demoUrl: row.demo_url,
    documentation: row.documentation,
    license: row.license || 'MIT',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

/**
 * 获取所有模板
 */
export async function getAllTemplates(): Promise<PublicTemplate[]> {
  if (!usePostgres) return [];
  
  try {
    const result = await query(`
      SELECT t.*, u.username as author_name, u.avatar as author_avatar, u.bio as author_bio
      FROM templates t
      LEFT JOIN users u ON t.author_id = u.id
      WHERE t.status = 'approved'
      ORDER BY t.created_at DESC
    `);
    
    return result.rows.map(mapTemplateRow);
  } catch (error) {
    console.error('获取所有模板失败:', error);
    return [];
  }
}

/**
 * 获取模板列表
 */
export async function getTemplates(params: TemplateListParams): Promise<TemplateListResponse> {
  if (!usePostgres) {
    return { templates: [], total: 0, page: 1, pageSize: 10, totalPages: 0, facets: {} as TemplateFacets };
  }
  
  try {
    let queryStr = `
      SELECT t.*, u.username as author_name, u.avatar as author_avatar, u.bio as author_bio
      FROM templates t
      LEFT JOIN users u ON t.author_id = u.id
      WHERE t.status = 'approved'
    `;
    const paramsArr: any[] = [];
    let paramIndex = 1;

    // 筛选
    if (params.query) {
      queryStr += ` AND (t.name ILIKE $${paramIndex} OR t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
      paramsArr.push(`%${params.query}%`);
      paramIndex++;
    }

    if (params.category) {
      queryStr += ` AND t.category = $${paramIndex}`;
      paramsArr.push(params.category);
      paramIndex++;
    }

    if (params.type) {
      queryStr += ` AND t.type = $${paramIndex}`;
      paramsArr.push(params.type);
      paramIndex++;
    }

    if (params.authorId) {
      queryStr += ` AND t.author_id = $${paramIndex}`;
      paramsArr.push(params.authorId);
      paramIndex++;
    }

    // 排序
    let orderBy = 'ORDER BY';
    switch (params.sortBy) {
      case 'latest':
        orderBy += ' t.updated_at DESC';
        break;
      case 'popular':
        orderBy += ' (t.view_count + t.download_count * 2) DESC';
        break;
      case 'rating':
        orderBy += ' t.rating DESC';
        break;
      case 'downloads':
        orderBy += ' t.download_count DESC';
        break;
      default:
        orderBy += ' t.created_at DESC';
    }

    // 分页
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 10, 50);
    const offset = (page - 1) * pageSize;

    queryStr += `${orderBy} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    paramsArr.push(pageSize, offset);

    const result = await query(queryStr, paramsArr);
    
    // 获取总数
    const countResult = await query(`
      SELECT COUNT(*) as total FROM templates WHERE status = 'approved'
    `);
    const total = parseInt(countResult.rows[0].total);

    // 获取聚合信息
    const facets = await getTemplateFacets();

    return {
      templates: result.rows.map(mapTemplateRow),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      facets,
    };
  } catch (error) {
    console.error('获取模板列表失败:', error);
    return { templates: [], total: 0, page: 1, pageSize: 10, totalPages: 0, facets: {} as TemplateFacets };
  }
}

/**
 * 获取模板详情
 */
export async function getTemplate(templateId: string): Promise<PublicTemplate | null> {
  if (!usePostgres) return null;
  
  try {
    const result = await query(`
      SELECT t.*, u.username as author_name, u.avatar as author_avatar, u.bio as author_bio
      FROM templates t
      LEFT JOIN users u ON t.author_id = u.id
      WHERE t.id = $1
    `, [templateId]);
    
    if (result.rows.length === 0) return null;
    
    const template = mapTemplateRow(result.rows[0]);
    
    // 增加查看次数
    await query('UPDATE templates SET view_count = view_count + 1 WHERE id = $1', [templateId]);
    
    return template;
  } catch (error) {
    console.error('获取模板详情失败:', error);
    return null;
  }
}

/**
 * 创建模板
 */
export async function createTemplate(
  data: CreateTemplateRequest,
  authorId: string,
  authorName: string
): Promise<PublicTemplate> {
  if (!usePostgres) {
    throw new Error('数据库未配置');
  }
  
  const validation = validateTemplate(data);
  if (!validation.valid) {
    throw new Error(`模板验证失败：${validation.errors.join(', ')}`);
  }

  const now = new Date().toISOString();
  
  try {
    const result = await query(
      `INSERT INTO templates (
        id, name, title, description, system_prompt, model, tools, temperature,
        category, tags, type, status, version, author_id, author_name,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        uuidv4(),
        data.name,
        data.title,
        data.description,
        data.systemPrompt,
        data.model,
        JSON.stringify(data.tools),
        data.temperature,
        data.category,
        JSON.stringify(data.tags),
        data.type || 'public',
        'pending',
        '1.0.0',
        authorId,
        authorName,
        now,
        now,
      ]
    );
    
    return mapTemplateRow(result.rows[0]);
  } catch (error) {
    console.error('创建模板失败:', error);
    throw error;
  }
}

/**
 * 更新模板
 */
export async function updateTemplate(
  templateId: string,
  data: UpdateTemplateRequest,
  updaterId: string
): Promise<PublicTemplate> {
  if (!usePostgres) {
    throw new Error('数据库未配置');
  }
  
  try {
    const result = await query(
      `UPDATE templates SET 
        title = $1, description = $2, system_prompt = $3, model = $4,
        tools = $5, temperature = $6, tags = $7, updated_at = $8
      WHERE id = $9 AND author_id = $10
      RETURNING *`,
      [
        data.title,
        data.description,
        data.systemPrompt,
        data.model,
        JSON.stringify(data.tools),
        data.temperature,
        JSON.stringify(data.tags),
        new Date().toISOString(),
        templateId,
        updaterId,
      ]
    );
    
    if (result.rows.length === 0) {
      throw new Error('模板不存在或无权限修改');
    }
    
    return mapTemplateRow(result.rows[0]);
  } catch (error) {
    console.error('更新模板失败:', error);
    throw error;
  }
}

/**
 * 审核模板
 */
export async function reviewTemplate(
  templateId: string,
  data: ReviewTemplateRequest,
  reviewerId: string
): Promise<PublicTemplate> {
  if (!usePostgres) {
    throw new Error('数据库未配置');
  }
  
  const statusMap: Record<string, string> = { approved: 'approved', rejected: 'rejected', pending: 'pending' };
  const status = statusMap[data.status] || 'pending';
  
  try {
    const result = await query(
      `UPDATE templates SET 
        status = $1, updated_at = $2, published_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE published_at END
      WHERE id = $3
      RETURNING *`,
      [status, new Date().toISOString(), templateId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('模板不存在');
    }
    
    return mapTemplateRow(result.rows[0]);
  } catch (error) {
    console.error('审核模板失败:', error);
    throw error;
  }
}

/**
 * 删除模板
 */
export async function deleteTemplate(templateId: string, userId: string): Promise<boolean> {
  if (!usePostgres) return false;
  
  try {
    const result = await query(
      'DELETE FROM templates WHERE id = $1 AND author_id = $2',
      [templateId, userId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('删除模板失败:', error);
    return false;
  }
}

/**
 * 获取模板聚合信息
 */
async function getTemplateFacets(): Promise<TemplateFacets> {
  if (!usePostgres) {
    return { categories: [], types: [], statuses: [], tags: [], models: [], authors: [] };
  }
  
  try {
    const result = await query(`
      SELECT 
        category, COUNT(*) as count FROM templates 
      WHERE status = 'approved' GROUP BY category
    `);
    const categories = result.rows.map((r: any) => ({ value: r.category, count: parseInt(r.count), label: r.category }));
    
    const typeResult = await query(`
      SELECT type, COUNT(*) as count FROM templates 
      WHERE status = 'approved' GROUP BY type
    `);
    const types = typeResult.rows.map((r: any) => ({ value: r.type, count: parseInt(r.count), label: r.type }));
    
    const statusResult = await query(`
      SELECT status, COUNT(*) as count FROM templates GROUP BY status
    `);
    const statuses = statusResult.rows.map((r: any) => ({ value: r.status, count: parseInt(r.count), label: r.status }));
    
    const tagResult = await query(`
      SELECT unnest(tags) as tag, COUNT(*) as count FROM templates 
      WHERE status = 'approved' GROUP BY tag ORDER BY count DESC LIMIT 20
    `);
    const tags = tagResult.rows.map((r: any) => ({ value: r.tag, count: parseInt(r.count), label: r.tag }));
    
    const modelResult = await query(`
      SELECT model, COUNT(*) as count FROM templates 
      WHERE status = 'approved' GROUP BY model
    `);
    const models = modelResult.rows.map((r: any) => ({ value: r.model, count: parseInt(r.count), label: r.model }));
    
    const authorResult = await query(`
      SELECT author_id, COUNT(*) as count FROM templates 
      WHERE status = 'approved' GROUP BY author_id ORDER BY count DESC LIMIT 10
    `);
    const authors = authorResult.rows.map((r: any) => ({ value: r.author_id, count: parseInt(r.count), label: r.author_id }));
    
    return { categories, types, statuses, tags, models, authors };
  } catch (error) {
    console.error('获取模板聚合信息失败:', error);
    return { categories: [], types: [], statuses: [], tags: [], models: [], authors: [] };
  }
}

/**
 * 获取模板分类列表
 */
export async function getTemplateCategories(): Promise<FacetOption[]> {
  const facets = await getTemplateFacets();
  return facets.categories;
}

/**
 * 获取模板版本历史
 */
export async function getTemplateVersionHistory(templateId: string): Promise<TemplateVersionHistory | null> {
  return {
    templateId,
    versions: [{
      version: '1.0.0',
      changelog: '初始版本',
      publishedAt: new Date().toISOString(),
      size: 1024,
      downloadUrl: `/api/agent-market/templates/${templateId}/download`,
      checksum: 'abc123...',
    }],
  };
}

/**
 * 获取模板统计信息
 */
export async function getTemplateStats(): Promise<TemplateStats> {
  if (!usePostgres) {
    return {
      totalTemplates: 0,
      totalDownloads: 0,
      totalViews: 0,
      averageRating: 0,
      topCategories: [],
      topAuthors: [],
      trendingTemplates: [],
    };
  }
  
  try {
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total_templates,
        SUM(download_count) as total_downloads,
        SUM(view_count) as total_views,
        AVG(rating) as average_rating
      FROM templates WHERE status = 'approved'
    `);
    
    const stat = statsResult.rows[0];
    
    const categoryResult = await query(`
      SELECT category FROM templates 
      WHERE status = 'approved' GROUP BY category 
      ORDER BY COUNT(*) DESC LIMIT 5
    `);
    const topCategories = categoryResult.rows.map((r: any) => r.category);
    
    const authorResult = await query(`
      SELECT author_id FROM templates 
      WHERE status = 'approved' GROUP BY author_id 
      ORDER BY COUNT(*) DESC LIMIT 5
    `);
    const topAuthors = authorResult.rows.map((r: any) => r.author_id);
    
    const trendingResult = await query(`
      SELECT id, name, title, description, system_prompt, model, tools, temperature,
        category, tags, type, version, view_count, download_count, like_count, rating, review_count
      FROM templates 
      WHERE status = 'approved' ORDER BY download_count DESC LIMIT 5
    `);
    const trendingTemplates: PublicTemplate[] = trendingResult.rows.map((r: any) => mapTemplateRow(r));
    
    return {
      totalTemplates: parseInt(stat.total_templates),
      totalDownloads: parseInt(stat.total_downloads) || 0,
      totalViews: parseInt(stat.total_views) || 0,
      averageRating: parseFloat(stat.average_rating) || 0,
      topCategories,
      topAuthors,
      trendingTemplates,
    };
  } catch (error) {
    console.error('获取模板统计信息失败:', error);
    return {
      totalTemplates: 0,
      totalDownloads: 0,
      totalViews: 0,
      averageRating: 0,
      topCategories: [],
      topAuthors: [],
      trendingTemplates: [],
    };
  }
}

/**
 * 下载模板
 */
export async function downloadTemplate(
  templateId: string,
  userId: string,
  version?: string
): Promise<{ downloadUrl: string; record: DownloadRecord }> {
  try {
    // 增加下载次数
    await query('UPDATE templates SET download_count = download_count + 1 WHERE id = $1', [templateId]);
    
    const record: DownloadRecord = {
      id: uuidv4(),
      templateId,
      version: version || '1.0.0',
      userId,
      downloadAt: new Date().toISOString(),
      ipAddress: '127.0.0.1',
      userAgent: 'Unknown',
    };
    
    const downloadUrl = `/api/agent-market/templates/${templateId}/download?v=${record.version}`;
    
    return { downloadUrl, record };
  } catch (error) {
    console.error('下载模板失败:', error);
    throw error;
  }
}

/**
 * 收藏模板
 */
export async function favoriteTemplate(templateId: string, userId: string): Promise<TemplateFavorite> {
  if (!usePostgres) {
    throw new Error('数据库未配置');
  }
  
  try {
    const result = await query(
      `INSERT INTO templateFavorites (id, template_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (template_id, user_id) DO NOTHING
       RETURNING *`,
      [uuidv4(), templateId, userId]
    );
    
    // 增加点赞数
    await query('UPDATE templates SET like_count = like_count + 1 WHERE id = $1', [templateId]);
    
    return result.rows[0];
  } catch (error) {
    console.error('收藏模板失败:', error);
    throw error;
  }
}

/**
 * 取消收藏模板
 */
export async function unfavoriteTemplate(templateId: string, userId: string): Promise<boolean> {
  if (!usePostgres) return false;
  
  try {
    const result = await query(
      'DELETE FROM templateFavorites WHERE template_id = $1 AND user_id = $2',
      [templateId, userId]
    );
    
    // 减少点赞数
    await query('UPDATE templates SET like_count = GREATEST(0, like_count - 1) WHERE id = $1', [templateId]);
    
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('取消收藏失败:', error);
    return false;
  }
}

/**
 * 获取用户收藏的模板
 */
export async function getUserFavorites(userId: string): Promise<PublicTemplate[]> {
  if (!usePostgres) return [];
  
  try {
    const result = await query(`
      SELECT t.* FROM templates t
      INNER JOIN templateFavorites tf ON t.id = tf.template_id
      WHERE tf.user_id = $1 AND t.status = 'approved'
    `, [userId]);
    
    return result.rows.map(mapTemplateRow);
  } catch (error) {
    console.error('获取用户收藏失败:', error);
    return [];
  }
}

/**
 * 获取模板报告列表
 */
export async function getTemplateReports(status?: TemplateReport['status']): Promise<TemplateReport[]> {
  return [];
}

/**
 * 提交模板报告
 */
export async function reportTemplate(
  templateId: string,
  reportedBy: string,
  reason: string,
  description: string
): Promise<TemplateReport> {
  return {
    id: uuidv4(),
    templateId,
    reportedBy,
    reason,
    description,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

/**
 * 处理模板报告
 */
export async function resolveTemplateReport(
  reportId: string,
  resolverId: string,
  resolution: string,
  status: 'reviewed' | 'resolved'
): Promise<TemplateReport> {
  return {
    id: reportId,
    templateId: 'template-1',
    reportedBy: 'user-1',
    reason: '内容不当',
    description: '模板中包含敏感内容',
    status,
    reviewedBy: resolverId,
    reviewedAt: new Date().toISOString(),
    resolution,
    createdAt: '2024-01-15T10:00:00Z',
  };
}
