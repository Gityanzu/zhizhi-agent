import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { initVectorStore } from './services/vectorStore';
import { isLLMConfigured, getCurrentModel } from './services/llm';
import { detectOllamaModels, isOllamaAvailable } from './services/llmProvider';
import { checkDatabase, initDatabase, setUsePostgres } from './db';
import {
  chatRoutes, compareRoutes, documentRoutes, sessionRoutes, modelRoutes,
  skillRoutes, usageRoutes, statsRoutes, memoryRoutes, promptRoutes,
  codeRoutes, agentsRoutes, customToolsRoutes, workflowsRoutes, dbConnectionsRoutes,
  shareRoutes, importRoutes, apiKeysRoutes, externalApiRoutes, userRoutes,
  authRoutes, userApiKeysRoutes, agentMarketRoutes, ratingRoutes,
} from './routes';
import commentRoutes from './routes/comment';
import searchRoutes from './routes/search';
import templateMarketRoutes from './routes/templateMarket';
import { initBuiltinTemplates } from './services/prompt';
import { handleMCPRequest, getMCPServerInfo } from './mcp/server';

// 全局存储状态：是否使用 PostgreSQL（从 db.ts 导入）
export { usePostgres } from './db';

const app = express();

// 中间件
// CORS 配置（限制来源）
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL || '',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如 curl/Postman）和白名单内的来源
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('不允许的跨域来源'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 确保数据目录存在
if (!fs.existsSync(config.upload.dir)) {
  fs.mkdirSync(config.upload.dir, { recursive: true });
}
if (!fs.existsSync(config.chroma.persistDirectory)) {
  fs.mkdirSync(config.chroma.persistDirectory, { recursive: true });
}

// 健康检查
app.get('/api/health', (req, res) => {
  const model = getCurrentModel();
  res.json({
    status: 'ok',
    llmConfigured: isLLMConfigured(),
    model: model.id,
    modelName: model.name,
    timestamp: new Date().toISOString(),
  });
});

// API 路由
app.use('/api/chat', chatRoutes);
app.use('/api/chat', compareRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/model', modelRoutes);
app.use('/api/skill', skillRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/prompt', promptRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/custom-tools', customToolsRoutes);
app.use('/api/workflows', workflowsRoutes);
app.use('/api/db-connections', dbConnectionsRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/import', importRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/v1', externalApiRoutes);
app.use('/api/user', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user-api-keys', userApiKeysRoutes);
app.use('/api/agent-market', agentMarketRoutes);
app.use('/api/agent-market/ratings', ratingRoutes);
app.use('/api/agent-market/comments', commentRoutes);
app.use('/api/agent-market/search', searchRoutes);
app.use('/api/agent-market/templates', templateMarketRoutes);

// 功能17：分享页面静态服务（server/public 目录）
app.use(express.static(path.join(__dirname, '../public')));
// /share/<token> 与 /share.html 都指向只读分享页
app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/share.html'));
});

// MCP 协议端点
app.post('/mcp', async (req, res) => {
  const result = await handleMCPRequest(req.body);
  if (result === null) {
    res.status(204).send(); // 通知不需要响应
  } else {
    res.json(result);
  }
});

// MCP 服务器信息
app.get('/mcp/info', (req, res) => {
  res.json(getMCPServerInfo());
});

// 错误处理中间件
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('未处理的错误:', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: '服务器内部错误',
    ...(!isProd && { detail: err.message }),
  });
});

// 启动服务器
async function startServer() {
  console.log('========================================');
  console.log('  智知 - 企业知识库智能问答 Agent');
  console.log('========================================');
  console.log(`LLM 模型: ${config.llm.modelName}`);
  console.log(`API 地址: ${config.llm.baseUrl}`);
  console.log(`LLM 配置: ${isLLMConfigured() ? '已配置' : '未配置（请设置 .env 中的 LLM_API_KEY）'}`);
  console.log('----------------------------------------');

  // 功能10：异步检测 Ollama（3秒超时，不阻塞启动）
  detectOllamaModels(true).then((models) => {
    if (isOllamaAvailable()) {
      console.log(`Ollama 本地模型已检测到 ${models.length} 个`);
    } else {
      console.log('Ollama未运行（可后续在模型下拉中点击刷新）');
    }
  });
  
  // 初始化向量数据库
  try {
    await initVectorStore();
    console.log('向量数据库初始化成功');
  } catch (error) {
    console.warn('向量数据库初始化失败:', error instanceof Error ? error.message : error);
  }
  
  // 初始化 PostgreSQL（可选，失败则回退到 JSON 文件存储）
  const dbAvailable = await checkDatabase();
  if (dbAvailable) {
    const initOk = await initDatabase();
    if (initOk) {
      setUsePostgres(true);
      console.log('PostgreSQL 存储已启用');
      await initBuiltinTemplates();
      console.log('内置提示词模板已初始化');
    }
  } else {
    console.log('PostgreSQL 不可用，使用 JSON 文件存储');
  }
  
  app.listen(config.port, () => {
    console.log(`服务器已启动: http://localhost:${config.port}`);
    console.log(`API 文档: http://localhost:${config.port}/api/health`);
  });
}

startServer().catch(error => {
  console.error('服务器启动失败:', error);
  process.exit(1);
});
