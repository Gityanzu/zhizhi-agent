import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// 数据库连接配置
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'zhizhi_agent',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// 全局存储状态：是否使用 PostgreSQL
export let usePostgres = false;

export function setUsePostgres(value: boolean) {
  usePostgres = value;
}

// 检查数据库是否可用
export async function checkDatabase(): Promise<boolean> {
  try {
    const client = await pool.connect();
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
    const client = await pool.connect();
    
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
    // 会话表新增字段：文件夹/置顶/标签/当前分支（第一阶段功能3 + 功能1）
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS folder_id UUID`);
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_branch_id VARCHAR(100)`);
    
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
    // 对话分支：父消息id + 分支标识（第一阶段功能1）
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_id UUID`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS branch_id VARCHAR(100)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(session_id, branch_id)`);
    
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
    // 功能8：文档归属知识库
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS collection_id UUID`);

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
  return pool.query(text, params);
}

// 获取连接（用于事务）
export async function getClient() {
  return pool.connect();
}

export default pool;
