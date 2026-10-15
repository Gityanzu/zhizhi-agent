/*
 * @Descripttion: your project
 * @version: 1.0
 * @Author: huxin
 * @Date: 2026-09-11 11:38:49
 * @LastEditTime: 2026-09-11 12:43:12
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),

  // 桌面模式探测：Electron 托管后端会注入 ZHI_USER_DATA，据此判定是否放开本机文件系统能力。
  isDesktop: !!process.env.ZHI_USER_DATA,
  
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: process.env.LLM_MODEL_NAME || 'qwen3.8-flash',
    embeddingModelName: process.env.EMBEDDING_MODEL_NAME || 'text-embedding-v2',
    temperature: 0.1,
    maxTokens: 2048,
    // 默认模型生成参数（第一阶段功能2，前端可在面板中覆盖）
    defaultModelParams: {
      temperature: 0.7,
      top_p: 1,
      max_tokens: 2048,
      presence_penalty: 0,
      frequency_penalty: 0,
    },
  },

  // 功能10：多提供商支持。内置百炼 + Ollama，可通过 .env 扩展 OpenAI 兼容提供商。
  // 示例：PROVIDER_2_ID=openai PROVIDER_2_NAME=OpenAI PROVIDER_2_BASE_URL=https://api.openai.com/v1 PROVIDER_2_API_KEY=sk-xxx
  providers: {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  },
  
  chroma: {
    // 注：目录名沿用历史命名（并非 ChromaDB，实为内置向量存储的持久化目录）
    // 桌面端由 Electron 注入 ZHI_USER_DATA：用户数据落 userData 目录，与安装目录分离，升级不丢数据
    persistDirectory: process.env.ZHI_USER_DATA
      ? path.join(process.env.ZHI_USER_DATA, 'data', 'chroma')
      : path.resolve(__dirname, '../../', process.env.CHROMA_DIR || '../data/chroma'),
  },
  
  upload: {
    dir: process.env.ZHI_USER_DATA
      ? path.join(process.env.ZHI_USER_DATA, 'data', 'uploads')
      : path.resolve(__dirname, '../../', process.env.UPLOAD_DIR || '../data/uploads'),
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ['.pdf', '.docx', '.md', '.txt'],
  },
  
  rag: {
    chunkSize: 500,
    chunkOverlap: 50,
    topK: 5,
    // 混合检索（向量 + BM25，RRF 召回融合）
    useHybridSearch: true,
    bm25K1: 1.5,
    bm25B: 0.75,
    rrfK: 60,
    // 真实 Rerank：RRF 召回 topK*rerankRecallMultiplier 后，经 rerank 模型精排取 topK。
    // DashScope: gte-rerank-v2（与 LLM 同一 API Key）。失败自动降级为 RRF 排序，不阻断检索。
    rerankEnabled: process.env.RAG_RERANK_ENABLED !== 'false',
    rerankModel: process.env.RAG_RERANK_MODEL || 'gte-rerank-v2',
    rerankRecallMultiplier: 3,
    // 历史感知 Query 改写：多轮对话时把指代性问题改写成独立检索 query
    queryRewriteEnabled: process.env.RAG_QUERY_REWRITE !== 'false',
    // Embedding 分批大小（每批一次 API 调用，配合重试避免大文档超限）
    embedBatchSize: 16,
    embedMaxRetries: 3,
    // 规模护栏：超限直接报错，防止单文档/全库把内存与 embedding 费用打爆
    maxChunksPerDoc: parseInt(process.env.RAG_MAX_CHUNKS_PER_DOC || '2000', 10),
    maxTotalChunks: parseInt(process.env.RAG_MAX_TOTAL_CHUNKS || '100000', 10),
    // 多租户隔离：启用后检索强制过滤 metadata.userId（现有历史数据无归属，默认关闭）
    enforceUserIsolation: process.env.RAG_USER_ISOLATION === 'true',
  },
  
  agent: {
    // 单次 Agent 运行的「LLM 轮次」上限：模型每发一次 tool_calls 就消耗一轮，
    // 所以它本质上是"最多允许调用工具多少轮"。
    //
    // 为什么从 5 放宽到 25：实测「生成开发工程师简历（Word + PDF 各一份）」这类
    // 多步任务，光前面几步就把 5 轮用光了 ——
    //   1) 探测 docx/reportlab 是否可用 → 缺失
    //   2) 装依赖（还撞上 code_interpreter 自身超时）
    //   3) 查找可用中文字体
    //   4) 复核依赖（docx OK / reportlab OK / fpdf OK）
    //   5) 写脚本并运行 —— 到这儿恰好用满，真正产出文件的那一步永远走不到。
    // 真正的死循环保护由"轮次上限 + 轮次耗尽显式终止"共同承担，不需要靠一个
    // 小到会误伤正常任务的值来兜底。需要更严格时用 AGENT_MAX_ITERATIONS 覆盖。
    maxIterations: Number(process.env.AGENT_MAX_ITERATIONS) || 25,
    // Agent 文件工具的默认输出根目录。桌面端由 Electron 注入 ZHI_AGENT_OUTPUT_DIR（用户可在设置里改），
    // 未注入时回退到 ZHI_USER_DATA/outputs，再回退到仓库内 agent_output。
    outputDir: process.env.ZHI_AGENT_OUTPUT_DIR
      || (process.env.ZHI_USER_DATA
        ? path.join(process.env.ZHI_USER_DATA, 'outputs')
        : path.resolve(__dirname, '../../agent_output')),
    // 真实代码工作区（可选）。设置后，桌面端（或 allowWebWorkspace=true 的 Web 端）可在此目录读写真实代码库，
    // 用于代码版本控制与改动审阅。留空则仅限输出根目录（沙箱）。
    workspaceDir: process.env.WORKSPACE_DIR || '',
    // Web 托管模式是否允许访问 workspaceDir。默认 false 保持服务器沙箱零风险；仅在受信任的自部署场景开启。
    allowWebWorkspace: process.env.ALLOW_WEB_WORKSPACE === 'true',
    // code_interpreter 沙箱：true 时尝试阻断子进程外联（best-effort，硬隔离由容器 L3 提供）；默认 false 兼容优先
    codeSandboxNoNetwork: process.env.CODE_SANDBOX_NO_NETWORK === 'true',
    // 浏览器沙箱：默认开启 Chrome 自带沙箱；仅在以 root 运行容器等场景才需设为 true 关闭
    browserNoSandbox: process.env.BROWSER_NO_SANDBOX === 'true',
  },
};
