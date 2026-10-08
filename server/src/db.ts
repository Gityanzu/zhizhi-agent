import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// 数据库连接配置（延迟初始化）
let pool: Pool | null = null;

function createPool(): Pool {
  return new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'zhizhi_agent',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

// 获取池（懒加载）
export function getPool(): Pool {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

// 全局存储状态：是否使用 PostgreSQL
export let usePostgres = false;

export function setUsePostgres(value: boolean) {
  usePostgres = value;
}

// 检查数据库是否可用
export async function checkDatabase(): Promise<boolean> {
  try {
    const currentPool = getPool();
    const client = await currentPool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.warn('PostgreSQL 连接失败，将使用 JSON 文件存储:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

// 初始化数据库表
export async function initDatabase(): Promise<boolean> {
  try {
    const currentPool = getPool();
    const client = await currentPool.connect();
    
    // 会话表
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        title VARCHAR(200),
        mode VARCHAR(20) DEFAULT 'agent',
        model VARCHAR(100),
        skill_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        message_count INTEGER DEFAULT 0
      )
    `);
    // 会话表新增字段：文件夹/置顶/标签/当前分支（第一阶段功能 3 + 功能 1）
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS folder_id UUID`);
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_branch_id VARCHAR(100)`);
        
    // 为会话表添加注释
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
    
    // 消息表
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY,
        session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT,
        mode VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // 为已有表添加复杂字段（JSONB 存储）
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_calls JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS thinking TEXT`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS plan JSONB`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_trace JSONB`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS token_usage JSONB`);
    // 对话分支：父消息 id + 分支标识（第一阶段功能 1）
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_id UUID`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS branch_id VARCHAR(100)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(session_id, branch_id)`);
        
    // 为消息表添加注释
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
    
    // 工具调用记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id UUID PRIMARY KEY,
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
        session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
        tool_name VARCHAR(100) NOT NULL,
        arguments JSONB,
        result TEXT,
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tool_calls_session_id ON tool_calls(session_id)`);
    
    // 为工具调用表添加注释
    await client.query(`COMMENT ON TABLE tool_calls IS '工具调用记录表：记录 AI 调用的外部工具'`);
    await client.query(`COMMENT ON COLUMN tool_calls.id IS '调用记录 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN tool_calls.message_id IS '关联的消息 ID'`);
    await client.query(`COMMENT ON COLUMN tool_calls.session_id IS '所属会话 ID'`);
    await client.query(`COMMENT ON COLUMN tool_calls.tool_name IS '工具名称'`);
    await client.query(`COMMENT ON COLUMN tool_calls.arguments IS '调用参数 [JSONB]'`);
    await client.query(`COMMENT ON COLUMN tool_calls.result IS '工具执行结果'`);
    await client.query(`COMMENT ON COLUMN tool_calls.duration_ms IS '执行耗时（毫秒）'`);
    await client.query(`COMMENT ON COLUMN tool_calls.created_at IS '创建时间'`);
    
    // Token 用量统计表
    await client.query(`
      CREATE TABLE IF NOT EXISTS usage_stats (
        id UUID PRIMARY KEY,
        session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
        model VARCHAR(100),
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost_cents NUMERIC(10,4) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_usage_session_id ON usage_stats(session_id)`);
    
    // 为 Token 用量表添加注释
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
    
    // 自动记忆表
    await client.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id UUID PRIMARY KEY,
        content TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        importance INTEGER DEFAULT 5,
        source_session_id UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_content ON memories(content)`);
    
    // 为记忆表添加注释
    await client.query(`COMMENT ON TABLE memories IS '自动记忆表：AI 自动保存的重要对话信息'`);
    await client.query(`COMMENT ON COLUMN memories.id IS '记忆 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN memories.content IS '记忆内容'`);
    await client.query(`COMMENT ON COLUMN memories.category IS '分类：general|personal|technical|etc'`);
    await client.query(`COMMENT ON COLUMN memories.importance IS '重要程度 1-10'`);
    await client.query(`COMMENT ON COLUMN memories.source_session_id IS '来源会话 ID'`);
    await client.query(`COMMENT ON COLUMN memories.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN memories.updated_at IS '更新时间'`);
    
    // 提示词模板表
    await client.query(`
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        is_active BOOLEAN DEFAULT FALSE,
        is_builtin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // 为提示词模板表添加注释
    await client.query(`COMMENT ON TABLE prompt_templates IS '提示词模板表：系统预设的提示词模板'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.id IS '模板 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.name IS '模板名称'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.description IS '模板描述'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.content IS '模板内容'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.is_active IS '是否启用'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.is_builtin IS '是否为内置模板'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.created_at IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN prompt_templates.updated_at IS '更新时间'`);
    
    // 向量存储表（优先使用 pgvector，否则用 JSONB）
    let usePgVector = false;
    try {
      const extResult = await client.query(`SELECT extname FROM pg_extension WHERE extname = 'vector'`);
      usePgVector = extResult.rows.length > 0;
    } catch {
      usePgVector = false;
    }
    
    if (usePgVector) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS vectors (
          id UUID PRIMARY KEY,
          content TEXT NOT NULL,
          embedding vector(1536),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_vectors_embedding ON vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`);
      console.log('向量存储：使用 pgvector (1536维, IVFFlat索引)');
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS vectors (
          id UUID PRIMARY KEY,
          content TEXT NOT NULL,
          vector JSONB NOT NULL,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('向量存储：使用 JSONB + 内存计算（pgvector 未安装）');
    }
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vectors_metadata ON vectors USING GIN(metadata)`);
    
    // 文档表
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY,
        name VARCHAR(255),
        size BIGINT,
        type VARCHAR(20),
        chunk_count INTEGER DEFAULT 0,
        file_path VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // 功能 8：文档归属知识库
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS collection_id UUID`);
        
    // 为文档表添加注释
    await client.query(`COMMENT ON TABLE documents IS '文档表：上传的知识库文档'`);
    await client.query(`COMMENT ON COLUMN documents.id IS '文档 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN documents.name IS '文档名称'`);
    await client.query(`COMMENT ON COLUMN documents.size IS '文件大小（字节）'`);
    await client.query(`COMMENT ON COLUMN documents.type IS '文件类型：pdf|docx|txt|etc'`);
    await client.query(`COMMENT ON COLUMN documents.chunk_count IS '分块数量'`);
    await client.query(`COMMENT ON COLUMN documents.file_path IS '文件存储路径'`);
    await client.query(`COMMENT ON COLUMN documents.collection_id IS '所属知识库 ID'`);
    await client.query(`COMMENT ON COLUMN documents.created_at IS '上传时间'`);

    // 功能8：知识库集合表
    await client.query(`
      CREATE TABLE IF NOT EXISTS collections (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 功能8：会话关联知识库（JSONB 数组）
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS collection_ids JSONB DEFAULT '[]'`);

    // 会话文件夹表（第一阶段功能3）
    await client.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(50),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 自定义Agent表（第二阶段功能5）
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        avatar VARCHAR(255),
        description TEXT,
        system_prompt TEXT,
        model VARCHAR(100),
        tools JSONB DEFAULT '[]',
        temperature REAL DEFAULT 0.7,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // agents 表新增字段：分类/标签/评分统计（customAgent 服务读写依赖，旧表存在时 CREATE IF NOT EXISTS 不会补列）
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS category VARCHAR(50)`);
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS rating DECIMAL(3,1) DEFAULT 0`);
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS template_count INTEGER DEFAULT 0`);
    await client.query(`COMMENT ON COLUMN agents.category IS 'Agent 分类'`);
    await client.query(`COMMENT ON COLUMN agents.tags IS '标签列表 (JSONB 数组)'`);
    await client.query(`COMMENT ON COLUMN agents.rating IS '平均评分'`);
    await client.query(`COMMENT ON COLUMN agents.rating_count IS '评分人数'`);
    await client.query(`COMMENT ON COLUMN agents.view_count IS '浏览次数'`);
    await client.query(`COMMENT ON COLUMN agents.template_count IS '关联模板数'`);

    // 自定义API工具表（第二阶段功能6）
    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_tools (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        method VARCHAR(10) DEFAULT 'GET',
        url TEXT NOT NULL,
        headers JSONB DEFAULT '{}',
        params_schema JSONB DEFAULT '{}',
        body_template TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 功能12：工作流编排表
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        nodes JSONB DEFAULT '[]',
        edges JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 功能15：数据库连接表
    await client.query(`
      CREATE TABLE IF NOT EXISTS db_connections (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) DEFAULT 'postgres',
        host VARCHAR(255),
        port INTEGER,
        database VARCHAR(100),
        username VARCHAR(100),
        password TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 功能17：对话分享表
    await client.query(`
      CREATE TABLE IF NOT EXISTS shares (
        id UUID PRIMARY KEY,
        session_id UUID NOT NULL,
        share_token VARCHAR(64) UNIQUE NOT NULL,
        password VARCHAR(100),
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(share_token)`);

    // 功能20：对外 API Key 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY,
        key_hash VARCHAR(64) UNIQUE NOT NULL,
        key_prefix VARCHAR(16) NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        last_used_at TIMESTAMP
      )
    `);

    // 用户表（多用户支持）
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(50),
        avatar VARCHAR(500),
        role VARCHAR(20) DEFAULT 'user',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 用户API Key表（每个用户可配置自己的大模型API Key）
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL DEFAULT 'dashscope',
        name VARCHAR(100) NOT NULL,
        encrypted_key TEXT NOT NULL,
        key_prefix VARCHAR(20),
        base_url VARCHAR(500),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, provider, name)
      )
    `);

    // 用户设置表（单用户本地配置）
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        profile JSONB DEFAULT '{"nickname":"用户","role":"AI助手使用者","avatar":""}'::jsonb,
        preferences JSONB DEFAULT '{"theme":"dark","defaultModel":"qwen3.8-flash","defaultMode":"agent","voiceEnabled":true,"ttsEnabled":false,"temperature":0.7,"topP":1.0,"maxTokens":2048}'::jsonb,
        llm_keys JSONB DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 确保有一条默认记录
    await client.query(`
      INSERT INTO user_settings (id) VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `);

    // 登录日志表（安全审计）
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(100),
        ip_address VARCHAR(45),
        user_agent TEXT,
        location VARCHAR(200),
        login_method VARCHAR(20) DEFAULT 'password',
        status VARCHAR(20) DEFAULT 'success',
        failure_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_login_logs_username ON login_logs(username)`);

    // 为登录日志表添加注释
    await client.query(`COMMENT ON TABLE login_logs IS '登录日志表：记录用户登录行为和安全性审计'`);
    await client.query(`COMMENT ON COLUMN login_logs.id IS '日志 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN login_logs.user_id IS '用户 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN login_logs.username IS '用户名（冗余字段，便于查询）'`);
    await client.query(`COMMENT ON COLUMN login_logs.ip_address IS 'IP 地址'`);
    await client.query(`COMMENT ON COLUMN login_logs.user_agent IS '浏览器 User-Agent'`);
    await client.query(`COMMENT ON COLUMN login_logs.location IS 'IP 地理位置'`);
    await client.query(`COMMENT ON COLUMN login_logs.login_method IS '登录方式：password|oauth|apikey'`);
    await client.query(`COMMENT ON COLUMN login_logs.status IS '登录状态：success|failed'`);
    await client.query(`COMMENT ON COLUMN login_logs.failure_reason IS '失败原因'`);
    await client.query(`COMMENT ON COLUMN login_logs.created_at IS '登录时间'`);

    // 审计日志表（logAudit 服务依赖，此前缺失导致写入失败）
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(100),
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50),
        resource_id VARCHAR(100),
        ip_address VARCHAR(45),
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id)`);

    // 为审计日志表添加注释
    await client.query(`COMMENT ON TABLE audit_logs IS '审计日志表：记录用户关键操作行为'`);
    await client.query(`COMMENT ON COLUMN audit_logs.id IS '日志 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN audit_logs.user_id IS '用户 ID (UUID)'`);
    await client.query(`COMMENT ON COLUMN audit_logs.username IS '用户名（冗余字段，便于查询）'`);
    await client.query(`COMMENT ON COLUMN audit_logs.action IS '操作类型'`);
    await client.query(`COMMENT ON COLUMN audit_logs.resource_type IS '资源类型'`);
    await client.query(`COMMENT ON COLUMN audit_logs.resource_id IS '资源 ID'`);
    await client.query(`COMMENT ON COLUMN audit_logs.ip_address IS 'IP 地址'`);
    await client.query(`COMMENT ON COLUMN audit_logs.details IS '操作详情 (JSONB)'`);
    await client.query(`COMMENT ON COLUMN audit_logs.created_at IS '操作时间'`);

    // 令牌管理表（刷新令牌、密码找回令牌等）
    await client.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_type VARCHAR(20) NOT NULL,  -- 'access', 'refresh', 'password_reset'
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tokens_token_hash ON tokens(token_hash)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at)`);

    // 邮箱验证表
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        email VARCHAR(100) NOT NULL,
        verification_code VARCHAR(10) NOT NULL,
        purpose VARCHAR(50) DEFAULT 'email_verify',  -- 'email_verify', 'password_reset'
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_verifications_code ON email_verifications(verification_code)`);

    // Agent 市场相关表
    await client.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        system_prompt TEXT,
        model VARCHAR(100),
        tools JSONB DEFAULT '[]',
        temperature REAL DEFAULT 0.7,
        category VARCHAR(50),
        tags JSONB DEFAULT '[]',
        type VARCHAR(20) DEFAULT 'public',  -- 'public', 'private', 'premium'
        status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
        version VARCHAR(20) DEFAULT '1.0.0',
        view_count INTEGER DEFAULT 0,
        download_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        rating DECIMAL(3,1) DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        author_id UUID REFERENCES users(id),
        features JSONB DEFAULT '[]',
        screenshots JSONB DEFAULT '[]',
        demo_url VARCHAR(500),
        documentation VARCHAR(500),
        license VARCHAR(50) DEFAULT 'MIT',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        published_at TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_templates_author ON templates(author_id)`);

    // 模板评论表
    await client.query(`
      CREATE TABLE IF NOT EXISTS template_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        parent_id UUID REFERENCES template_comments(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        rating DECIMAL(3,1),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_template_comments_template_id ON template_comments(template_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_template_comments_user_id ON template_comments(user_id)`);

    // 模板评分表
    await client.query(`
      CREATE TABLE IF NOT EXISTS template_ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        rating DECIMAL(3,1) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(template_id, user_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_template_ratings_template_id ON template_ratings(template_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_template_ratings_user_id ON template_ratings(user_id)`);

    // 模板收藏表
    await client.query(`
      CREATE TABLE IF NOT EXISTS template_favorites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(template_id, user_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_template_favorites_user_id ON template_favorites(user_id)`);

    // Agent 市场评论和评分表
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_comments_agent_id ON agent_comments(agent_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_comments_user_id ON agent_comments(user_id)`);

    // Agent 市场评分表
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        rating DECIMAL(3,1) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(agent_id, user_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_ratings_agent_id ON agent_ratings(agent_id)`);

    // Agent 市场搜索历史记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS search_histories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        query VARCHAR(500) NOT NULL,
        filters JSONB,
        result_count INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_search_histories_user_id ON search_histories(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_search_histories_created_at ON search_histories(created_at)`);

    // Analytics 分析数据表
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        metric_name VARCHAR(100) NOT NULL,
        metric_value INTEGER DEFAULT 0,
        period_start TIMESTAMP,
        period_end TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_analytics_metric ON analytics(metric_name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_analytics_period ON analytics(period_start)`);

    // Skill 系统表（用户自定义技能）
    await client.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        trigger_keywords JSONB DEFAULT '[]',
        system_prompt TEXT,
        allowed_tools JSONB DEFAULT '[]',
        examples JSONB DEFAULT '[]',
        is_builtin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_skills_user_id ON skills(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_skills_builtin ON skills(is_builtin)`);

    // 为常用查询添加复合索引

    // sessions 表：按更新时间排序（兼容无 user_id 的存量/匿名会话全局排序）
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC)`);
    
    // messages 表：按会话和创建时间排序
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at)`);
    
    // usage_stats 表：按会话和时间范围查询优化
    await client.query(`CREATE INDEX IF NOT EXISTS idx_usage_session_time ON usage_stats(session_id, created_at)`);
    
    // memories 表：按重要性排序
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC)`);
    
    // documents 表：按知识库和创建时间
    await client.query(`CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_id, created_at)`);
    
    // agents 表：按创建时间
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at DESC)`);
    
    // workflows 表：按更新时间
    await client.query(`CREATE INDEX IF NOT EXISTS idx_workflows_updated ON workflows(updated_at DESC)`);
    
    // db_connections 表：按类型
    await client.query(`CREATE INDEX IF NOT EXISTS idx_db_connections_type ON db_connections(type)`);

    // 多用户隔离：sessions / folders 归属用户。users 表已在前面创建，此处才能安全地补列 + 外键。
    // 存量无主数据 user_id 为 NULL（仅未登录/匿名可见），由迁移脚本按策略归属。
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions(user_id, updated_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id)`);
    await client.query(`COMMENT ON COLUMN sessions.user_id IS '会话归属用户 ID，用于多用户隔离'`);
    await client.query(`COMMENT ON COLUMN folders.user_id IS '文件夹归属用户 ID，用于多用户隔离'`);

    // 多用户隔离：数据库连接 / 对外 API Key（均仅被路由使用，不涉及 agent 运行时/市场聚合，可安全按用户隔离）
    // 存量无主数据 user_id 为 NULL，读取时对所有人可见（兼容旧数据），新建数据归属创建者。
    await client.query(`ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_db_connections_user ON db_connections(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`);

    client.release();
    console.log('✅ PostgreSQL 数据库初始化完成');
    return true;
  } catch (error) {
    console.error('PostgreSQL 初始化失败:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

// 执行查询
export async function query(text: string, params?: any[]) {
  const currentPool = getPool();
  return currentPool.query(text, params);
}

// 获取连接（用于事务）
export async function getClient() {
  const currentPool = getPool();
  return currentPool.connect();
}

export default pool;
