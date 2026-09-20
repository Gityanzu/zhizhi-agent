/**
 * 为数据库表和字段添加注释的脚本
 * 运行方式：npx ts-node scripts/add-table-comments.ts
 */

import db from '../src/db';

async function addComments() {
  const pool = db;
  if (!pool) {
    console.error('数据库未初始化');
    return;
  }
  const client = await pool.connect();
  
  try {
    console.log('开始为数据库表和字段添加注释...\n');
    
    // sessions 表
    await client.query(`COMMENT ON TABLE sessions IS '对话会话表：存储用户的对话会话信息'`);
    await client.query(`COMMENT ON COLUMN sessions.id IS '会话 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN sessions.title IS '会话标题'`);
    await client.query(`COMMENT ON COLUMN sessions.mode IS '会话模式：agent|chat|assistant'`);
    await client.query(`COMMENT ON COLUMN sessions.model IS '使用的模型名称'`);
    await client.query(`COMMENT ON COLUMN sessions.skill_id IS '关联的技能 ID'`);
    await client.query(`COMMENT ON COLUMN sessions.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN sessions.updated_at IS '更新时间'`);
    await client.query(`COMMENT ON COLUMN sessions.message_count IS '消息数量'`);
    await client.query(`COMMENT ON COLUMN sessions.folder_id IS '所属文件夹 ID，用于会话分组'`);
    await client.query(`COMMENT ON COLUMN sessions.is_pinned IS '是否置顶会话'`);
    await client.query(`COMMENT ON COLUMN sessions.tags IS '会话标签数组 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN sessions.current_branch_id IS '当前对话分支 ID'`);
    console.log('✅ sessions 表注释完成');
    
    // messages 表
    await client.query(`COMMENT ON TABLE messages IS '对话消息表：存储会话中的每条消息'`);
    await client.query(`COMMENT ON COLUMN messages.id IS '消息 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN messages.session_id IS '所属会话 ID'`);
    await client.query(`COMMENT ON COLUMN messages.role IS '角色：user|assistant|system|tool'`);
    await client.query(`COMMENT ON COLUMN messages.content IS '消息内容'`);
    await client.query(`COMMENT ON COLUMN messages.mode IS '消息模式'`);
    await client.query(`COMMENT ON COLUMN messages.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN messages.tool_calls IS '工具调用记录数组 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN messages.sources IS '引用来源数组 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN messages.thinking IS '思考过程文本'`);
    await client.query(`COMMENT ON COLUMN messages.plan IS '执行计划 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN messages.agent_trace IS 'Agent 追踪信息 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN messages.token_usage IS 'Token 使用情况 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN messages.parent_id IS '父消息 ID，支持对话分支'`);
    await client.query(`COMMENT ON COLUMN messages.branch_id IS '对话分支标识'`);
    console.log('✅ messages 表注释完成');
    
    // tool_calls 表
    await client.query(`COMMENT ON TABLE tool_calls IS '工具调用记录表：记录 AI 调用的外部工具'`);
    await client.query(`COMMENT ON COLUMN tool_calls.id IS '调用记录 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN tool_calls.message_id IS '关联的消息 ID'`);
    await client.query(`COMMENT ON COLUMN tool_calls.session_id IS '所属会话 ID'`);
    await client.query(`COMMENT ON COLUMN tool_calls.tool_name IS '工具名称'`);
    await client.query(`COMMENT ON COLUMN tool_calls.arguments IS '调用参数 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN tool_calls.result IS '工具执行结果'`);
    await client.query(`COMMENT ON COLUMN tool_calls.duration_ms IS '执行耗时（毫秒）'`);
    await client.query(`COMMENT ON COLUMN tool_calls.created_at IS '创建时间'`);
    console.log('✅ tool_calls 表注释完成');
    
    // usage_stats 表
    await client.query(`COMMENT ON TABLE usage_stats IS 'Token 用量统计表：记录每次对话的 Token 消耗和费用'`);
    await client.query(`COMMENT ON COLUMN usage_stats.id IS '统计记录 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN usage_stats.session_id IS '所属会话 ID'`);
    await client.query(`COMMENT ON COLUMN usage_stats.message_id IS '关联的消息 ID'`);
    await client.query(`COMMENT ON COLUMN usage_stats.model IS '使用的模型名称'`);
    await client.query(`COMMENT ON COLUMN usage_stats.prompt_tokens IS '输入 Token 数量'`);
    await client.query(`COMMENT ON COLUMN usage_stats.completion_tokens IS '输出 Token 数量'`);
    await client.query(`COMMENT ON COLUMN usage_stats.total_tokens IS '总 Token 数量'`);
    await client.query(`COMMENT ON COLUMN usage_stats.cost_cents IS '费用（美分）'`);
    await client.query(`COMMENT ON COLUMN usage_stats.created_at IS '统计时间'`);
    console.log('✅ usage_stats 表注释完成');
    
    // memories 表
    await client.query(`COMMENT ON TABLE memories IS '自动记忆表：AI 自动保存的重要对话信息'`);
    await client.query(`COMMENT ON COLUMN memories.id IS '记忆 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN memories.content IS '记忆内容'`);
    await client.query(`COMMENT ON COLUMN memories.category IS '分类：general|personal|technical|etc'`);
    await client.query(`COMMENT ON COLUMN memories.importance IS '重要程度 1-10'`);
    await client.query(`COMMENT ON COLUMN memories.source_session_id IS '来源会话 ID'`);
    await client.query(`COMMENT ON COLUMN memories.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN memories.updated_at IS '更新时间'`);
    console.log('✅ memories 表注释完成');
    
    // prompt_templates 表
    await client.query(`COMMENT ON TABLE prompt_templates IS '提示词模板表：系统预设的提示词模板'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.id IS '模板 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.name IS '模板名称'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.description IS '模板描述'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.content IS '模板内容'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.is_active IS '是否启用'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.is_builtin IS '是否为内置模板'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.updated_at IS '更新时间'`);
    console.log('✅ prompt_templates 表注释完成');
    
    // vectors 表
    await client.query(`COMMENT ON TABLE vectors IS '向量存储表：用于语义搜索的向量数据'`);
    await client.query(`COMMENT ON COLUMN vectors.id IS '向量 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN vectors.content IS '原始文本内容'`);
    await client.query(`COMMENT ON COLUMN vectors.embedding IS '向量嵌入 (1536 维，仅 pgvector)'`);
    await client.query(`COMMENT ON COLUMN vectors.vector IS '向量数据 [JSONB]，非 pgvector 模式'`);
    await client.query(`COMMENT ON COLUMN vectors.metadata IS '元数据 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN vectors.created_at IS '创建时间'`);
    console.log('✅ vectors 表注释完成');
    
    // documents 表
    await client.query(`COMMENT ON TABLE documents IS '文档表：上传的知识库文档'`);
    await client.query(`COMMENT ON COLUMN documents.id IS '文档 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN documents.name IS '文档名称'`);
    await client.query(`COMMENT ON COLUMN documents.size IS '文件大小（字节）`);
    await client.query(`COMMENT ON COLUMN documents.type IS '文件类型：pdf|docx|txt|etc'`);
    await client.query(`COMMENT ON COLUMN documents.chunk_count IS '分块数量'`);
    await client.query(`COMMENT ON COLUMN documents.file_path IS '文件存储路径'`);
    await client.query(`COMMENT ON COLUMN documents.collection_id IS '所属知识库 ID'`);
    await client.query(`COMMENT ON COLUMN documents.created_at IS '上传时间'`);
    console.log('✅ documents 表注释完成');
    
    // collections 表
    await client.query(`COMMENT ON TABLE collections IS '知识库集合表：文档的知识库分类'`);
    await client.query(`COMMENT ON COLUMN collections.id IS '知识库 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN collections.name IS '知识库名称'`);
    await client.query(`COMMENT ON COLUMN collections.description IS '知识库描述'`);
    await client.query(`COMMENT ON COLUMN collections.icon IS '图标名称'`);
    await client.query(`COMMENT ON COLUMN collections.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN collections.updated_at IS '更新时间'`);
    console.log('✅ collections 表注释完成');
    
    // folders 表
    await client.query(`COMMENT ON TABLE folders IS '会话文件夹表：用于会话分组管理'`);
    await client.query(`COMMENT ON COLUMN folders.id IS '文件夹 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN folders.name IS '文件夹名称'`);
    await client.query(`COMMENT ON COLUMN folders.icon IS '图标名称'`);
    await client.query(`COMMENT ON COLUMN folders.sort_order IS '排序顺序'`);
    await client.query(`COMMENT ON COLUMN folders.created_at IS '创建时间'`);
    console.log('✅ folders 表注释完成');
    
    // agents 表
    await client.query(`COMMENT ON TABLE agents IS '自定义 Agent 表：用户创建的 AI Agent 配置'`);
    await client.query(`COMMENT ON COLUMN agents.id IS 'Agent ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN agents.name IS 'Agent 名称'`);
    await client.query(`COMMENT ON COLUMN agents.avatar IS '头像 URL'`);
    await client.query(`COMMENT ON COLUMN agents.description IS 'Agent 描述'`);
    await client.query(`COMMENT ON COLUMN agents.system_prompt IS '系统提示词'`);
    await client.query(`COMMENT ON COLUMN agents.model IS '使用的模型'`);
    await client.query(`COMMENT ON COLUMN agents.tools IS '可用工具列表 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN agents.temperature IS '温度参数'`);
    await client.query(`COMMENT ON COLUMN agents.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN agents.updated_at IS '更新时间'`);
    console.log('✅ agents 表注释完成');
    
    // custom_tools 表
    await client.query(`COMMENT ON TABLE custom_tools IS '自定义 API 工具表：用户配置的 API 接口'`);
    await client.query(`COMMENT ON COLUMN custom_tools.id IS '工具 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN custom_tools.name IS '工具名称'`);
    await client.query(`COMMENT ON COLUMN custom_tools.description IS '工具描述'`);
    await client.query(`COMMENT ON COLUMN custom_tools.method IS 'HTTP 方法'`);
    await client.query(`COMMENT ON COLUMN custom_tools.url IS 'API 地址'`);
    await client.query(`COMMENT ON COLUMN custom_tools.headers IS '请求头 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN custom_tools.params_schema IS '参数 Schema [JSONB]'`);
    await client.query(`COMMENT ON COLUMN custom_tools.body_template IS '请求体模板'`);
    await client.query(`COMMENT ON COLUMN custom_tools.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN custom_tools.updated_at IS '更新时间'`);
    console.log('✅ custom_tools 表注释完成');
    
    // workflows 表
    await client.query(`COMMENT ON TABLE workflows IS '工作流编排表：定义多步骤任务流程'`);
    await client.query(`COMMENT ON COLUMN workflows.id IS '工作流 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN workflows.name IS '工作流名称'`);
    await client.query(`COMMENT ON COLUMN workflows.description IS '工作流描述'`);
    await client.query(`COMMENT ON COLUMN workflows.nodes IS '节点定义 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN workflows.edges IS '连接关系 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN workflows.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN workflows.updated_at IS '更新时间'`);
    console.log('✅ workflows 表注释完成');
    
    // db_connections 表
    await client.query(`COMMENT ON TABLE db_connections IS '数据库连接表：外部数据库连接配置'`);
    await client.query(`COMMENT ON COLUMN db_connections.id IS '连接 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN db_connections.name IS '连接名称'`);
    await client.query(`COMMENT ON COLUMN db_connections.type IS '数据库类型'`);
    await client.query(`COMMENT ON COLUMN db_connections.host IS '主机地址'`);
    await client.query(`COMMENT ON COLUMN db_connections.port IS '端口号'`);
    await client.query(`COMMENT ON COLUMN db_connections.database IS '数据库名'`);
    await client.query(`COMMENT ON COLUMN db_connections.username IS '用户名'`);
    await client.query(`COMMENT ON COLUMN db_connections.password IS '密码（加密）'`);
    await client.query(`COMMENT ON COLUMN db_connections.created_at IS '创建时间'`);
    console.log('✅ db_connections 表注释完成');
    
    // shares 表
    await client.query(`COMMENT ON TABLE shares IS '对话分享表：分享的对话链接'`);
    await client.query(`COMMENT ON COLUMN shares.id IS '分享 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN shares.session_id IS '会话 ID'`);
    await client.query(`COMMENT ON COLUMN shares.share_token IS '分享令牌'`);
    await client.query(`COMMENT ON COLUMN shares.password IS '访问密码（加密）'`);
    await client.query(`COMMENT ON COLUMN shares.expires_at IS '过期时间'`);
    await client.query(`COMMENT ON COLUMN shares.created_at IS '创建时间'`);
    console.log('✅ shares 表注释完成');
    
    // api_keys 表
    await client.query(`COMMENT ON TABLE api_keys IS '对外 API Key 表：系统级 API 密钥'`);
    await client.query(`COMMENT ON COLUMN api_keys.id IS 'API Key ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN api_keys.key_hash IS '密钥哈希'`);
    await client.query(`COMMENT ON COLUMN api_keys.key_prefix IS '密钥前缀'`);
    await client.query(`COMMENT ON COLUMN api_keys.name IS 'API Key 名称'`);
    await client.query(`COMMENT ON COLUMN api_keys.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN api_keys.last_used_at IS '最后使用时间'`);
    console.log('✅ api_keys 表注释完成');
    
    // users 表
    await client.query(`COMMENT ON TABLE users IS '用户表：系统用户账户'`);
    await client.query(`COMMENT ON COLUMN users.id IS '用户 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN users.username IS '用户名'`);
    await client.query(`COMMENT ON COLUMN users.email IS '邮箱地址'`);
    await client.query(`COMMENT ON COLUMN users.password_hash IS '密码哈希'`);
    await client.query(`COMMENT ON COLUMN users.nickname IS '昵称'`);
    await client.query(`COMMENT ON COLUMN users.avatar IS '头像 URL'`);
    await client.query(`COMMENT ON COLUMN users.role IS '角色：admin|user|guest'`);
    await client.query(`COMMENT ON COLUMN users.status IS '状态：active|inactive|suspended'`);
    await client.query(`COMMENT ON COLUMN users.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN users.updated_at IS '更新时间'`);
    console.log('✅ users 表注释完成');
    
    // user_api_keys 表
    await client.query(`COMMENT ON TABLE user_api_keys IS '用户 API Key 表：用户配置的大模型 API 密钥'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.id IS 'API Key ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.provider IS '服务商：dashscope|openai|etc'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.name IS 'API Key 名称'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.encrypted_key IS '加密后的密钥'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.key_prefix IS '密钥前缀'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.base_url IS 'API 基础 URL'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.is_default IS '是否为默认密钥'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN user_api_keys.updated_at IS '更新时间'`);
    console.log('✅ user_api_keys 表注释完成');
    
    // user_settings 表
    await client.query(`COMMENT ON TABLE user_settings IS '用户设置表：用户个性化配置'`);
    await client.query(`COMMENT ON COLUMN user_settings.id IS '设置 ID (通常为 1)'`);
    await client.query(`COMMENT ON COLUMN user_settings.profile IS '用户资料 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN user_settings.preferences IS '偏好设置 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN user_settings.llm_keys IS 'LLM 密钥列表 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN user_settings.updated_at IS '更新时间'`);
    console.log('✅ user_settings 表注释完成');
    
    // login_logs 表
    await client.query(`COMMENT ON TABLE login_logs IS '登录日志表：用户登录历史记录'`);
    await client.query(`COMMENT ON COLUMN login_logs.id IS '日志 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN login_logs.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN login_logs.ip_address IS 'IP 地址'`);
    await client.query(`COMMENT ON COLUMN login_logs.user_agent IS '浏览器信息'`);
    await client.query(`COMMENT ON COLUMN login_logs.location IS '地理位置'`);
    await client.query(`COMMENT ON COLUMN login_logs.login_method IS '登录方式'`);
    await client.query(`COMMENT ON COLUMN login_logs.status IS '状态：success|failed'`);
    await client.query(`COMMENT ON COLUMN login_logs.failure_reason IS '失败原因'`);
    await client.query(`COMMENT ON COLUMN login_logs.created_at IS '创建时间'`);
    console.log('✅ login_logs 表注释完成');
    
    // tokens 表
    await client.query(`COMMENT ON TABLE tokens IS '令牌管理表：刷新令牌、密码找回令牌等'`);
    await client.query(`COMMENT ON COLUMN tokens.id IS '令牌 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN tokens.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN tokens.token_type IS '令牌类型：access|refresh|password_reset'`);
    await client.query(`COMMENT ON COLUMN tokens.token_hash IS '令牌哈希'`);
    await client.query(`COMMENT ON COLUMN tokens.expires_at IS '过期时间'`);
    await client.query(`COMMENT ON COLUMN tokens.revoked_at IS '撤销时间'`);
    await client.query(`COMMENT ON COLUMN tokens.ip_address IS 'IP 地址'`);
    await client.query(`COMMENT ON COLUMN tokens.user_agent IS '浏览器信息'`);
    await client.query(`COMMENT ON COLUMN tokens.created_at IS '创建时间'`);
    console.log('✅ tokens 表注释完成');
    
    // email_verifications 表
    await client.query(`COMMENT ON TABLE email_verifications IS '邮箱验证表：邮箱验证和密码找回'`);
    await client.query(`COMMENT ON COLUMN email_verifications.id IS '验证记录 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN email_verifications.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN email_verifications.email IS '邮箱地址'`);
    await client.query(`COMMENT ON COLUMN email_verifications.verification_code IS '验证码'`);
    await client.query(`COMMENT ON COLUMN email_verifications.purpose IS '用途：email_verify|password_reset'`);
    await client.query(`COMMENT ON COLUMN email_verifications.expires_at IS '过期时间'`);
    await client.query(`COMMENT ON COLUMN email_verifications.used_at IS '使用时间'`);
    await client.query(`COMMENT ON COLUMN email_verifications.created_at IS '创建时间'`);
    console.log('✅ email_verifications 表注释完成');
    
    // templates 表
    await client.query(`COMMENT ON TABLE templates IS 'Agent 模板市场表：可下载的 AI Agent 配置'`);
    await client.query(`COMMENT ON COLUMN templates.id IS '模板 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN templates.name IS '模板名称'`);
    await client.query(`COMMENT ON COLUMN templates.title IS '显示标题'`);
    await client.query(`COMMENT ON COLUMN templates.description IS '模板描述'`);
    await client.query(`COMMENT ON COLUMN templates.system_prompt IS '系统提示词'`);
    await client.query(`COMMENT ON COLUMN templates.model IS '推荐模型'`);
    await client.query(`COMMENT ON COLUMN templates.tools IS '可用工具 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN templates.temperature IS '温度参数'`);
    await client.query(`COMMENT ON COLUMN templates.category IS '分类'`);
    await client.query(`COMMENT ON COLUMN templates.tags IS '标签数组 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN templates.type IS '类型：public|private|premium'`);
    await client.query(`COMMENT ON COLUMN templates.status IS '状态：pending|approved|rejected'`);
    await client.query(`COMMENT ON COLUMN templates.version IS '版本号'`);
    await client.query(`COMMENT ON COLUMN templates.view_count IS '浏览次数'`);
    await client.query(`COMMENT ON COLUMN templates.download_count IS '下载次数'`);
    await client.query(`COMMENT ON COLUMN templates.like_count IS '点赞数'`);
    await client.query(`COMMENT ON COLUMN templates.rating IS '评分 (0-10)'`);
    await client.query(`COMMENT ON COLUMN templates.review_count IS '评论数'`);
    await client.query(`COMMENT ON COLUMN templates.author_id IS '作者用户 ID'`);
    await client.query(`COMMENT ON COLUMN templates.features IS '功能特性 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN templates.screenshots IS '截图 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN templates.demo_url IS '演示地址'`);
    await client.query(`COMMENT ON COLUMN templates.documentation IS '文档地址'`);
    await client.query(`COMMENT ON COLUMN templates.license IS '许可证'`);
    await client.query(`COMMENT ON COLUMN templates.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN templates.updated_at IS '更新时间'`);
    await client.query(`COMMENT ON COLUMN templates.published_at IS '发布时间'`);
    console.log('✅ templates 表注释完成');
    
    // template_comments 表
    await client.query(`COMMENT ON TABLE template_comments IS '模板评论表：用户对模板的评价'`);
    await client.query(`COMMENT ON COLUMN template_comments.id IS '评论 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN template_comments.template_id IS '模板 ID'`);
    await client.query(`COMMENT ON COLUMN template_comments.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN template_comments.parent_id IS '父评论 ID，支持回复'`);
    await client.query(`COMMENT ON COLUMN template_comments.content IS '评论内容'`);
    await client.query(`COMMENT ON COLUMN template_comments.rating IS '评分 (0-10)'`);
    await client.query(`COMMENT ON COLUMN template_comments.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN template_comments.updated_at IS '更新时间'`);
    console.log('✅ template_comments 表注释完成');
    
    // template_ratings 表
    await client.query(`COMMENT ON TABLE template_ratings IS '模板评分表：用户对模板的评分'`);
    await client.query(`COMMENT ON COLUMN template_ratings.id IS '评分 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN template_ratings.template_id IS '模板 ID'`);
    await client.query(`COMMENT ON COLUMN template_ratings.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN template_ratings.rating IS '评分 (0-10)'`);
    await client.query(`COMMENT ON COLUMN template_ratings.created_at IS '评分时间'`);
    console.log('✅ template_ratings 表注释完成');
    
    // template_favorites 表
    await client.query(`COMMENT ON TABLE template_favorites IS '模板收藏表：用户收藏的模板'`);
    await client.query(`COMMENT ON COLUMN template_favorites.id IS '收藏 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN template_favorites.template_id IS '模板 ID'`);
    await client.query(`COMMENT ON COLUMN template_favorites.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN template_favorites.created_at IS '收藏时间'`);
    console.log('✅ template_favorites 表注释完成');
    
    // agent_comments 表
    await client.query(`COMMENT ON TABLE agent_comments IS 'Agent 评论表：用户对 Agent 的评价'`);
    await client.query(`COMMENT ON COLUMN agent_comments.id IS '评论 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN agent_comments.agent_id IS 'Agent ID'`);
    await client.query(`COMMENT ON COLUMN agent_comments.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN agent_comments.content IS '评论内容'`);
    await client.query(`COMMENT ON COLUMN agent_comments.created_at IS '创建时间'`);
    console.log('✅ agent_comments 表注释完成');
    
    // agent_ratings 表
    await client.query(`COMMENT ON TABLE agent_ratings IS 'Agent 评分表：用户对 Agent 的评分'`);
    await client.query(`COMMENT ON COLUMN agent_ratings.id IS '评分 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN agent_ratings.agent_id IS 'Agent ID'`);
    await client.query(`COMMENT ON COLUMN agent_ratings.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN agent_ratings.rating IS '评分 (0-10)'`);
    await client.query(`COMMENT ON COLUMN agent_ratings.created_at IS '评分时间'`);
    console.log('✅ agent_ratings 表注释完成');
    
    // search_histories 表
    await client.query(`COMMENT ON TABLE search_histories IS '搜索历史表：用户搜索记录'`);
    await client.query(`COMMENT ON COLUMN search_histories.id IS '搜索记录 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN search_histories.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN search_histories.query IS '搜索关键词'`);
    await client.query(`COMMENT ON COLUMN search_histories.filters IS '筛选条件 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN search_histories.result_count IS '结果数量'`);
    await client.query(`COMMENT ON COLUMN search_histories.created_at IS '创建时间'`);
    console.log('✅ search_histories 表注释完成');
    
    // analytics 表
    await client.query(`COMMENT ON TABLE analytics IS 'Analytics 分析数据表：系统统计数据'`);
    await client.query(`COMMENT ON COLUMN analytics.id IS '分析记录 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN analytics.metric_name IS '指标名称'`);
    await client.query(`COMMENT ON COLUMN analytics.metric_value IS '指标值'`);
    await client.query(`COMMENT ON COLUMN analytics.period_start IS '周期开始时间'`);
    await client.query(`COMMENT ON COLUMN analytics.period_end IS '周期结束时间'`);
    await client.query(`COMMENT ON COLUMN analytics.metadata IS '元数据 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN analytics.created_at IS '创建时间'`);
    console.log('✅ analytics 表注释完成');
    
    // skills 表
    await client.query(`COMMENT ON TABLE skills IS 'Skill 系统表：用户自定义技能'`);
    await client.query(`COMMENT ON COLUMN skills.id IS '技能 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN skills.user_id IS '用户 ID'`);
    await client.query(`COMMENT ON COLUMN skills.name IS '技能名称'`);
    await client.query(`COMMENT ON COLUMN skills.description IS '技能描述'`);
    await client.query(`COMMENT ON COLUMN skills.icon IS '图标名称'`);
    await client.query(`COMMENT ON COLUMN skills.trigger_keywords IS '触发关键词 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN skills.system_prompt IS '系统提示词'`);
    await client.query(`COMMENT ON COLUMN skills.allowed_tools IS '允许的工具 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN skills.examples IS '示例 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN skills.is_builtin IS '是否为内置技能'`);
    await client.query(`COMMENT ON COLUMN skills.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN skills.updated_at IS '更新时间'`);
    console.log('✅ skills 表注释完成');
    
    console.log('\n🎉 所有表和字段注释添加完成！');
    
  } catch (error) {
    console.error('添加注释失败:', error);
    throw error;
  } finally {
    client.release();
  }
}

addComments().catch(console.error);
