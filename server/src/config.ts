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
    collectionName: process.env.CHROMA_COLLECTION_NAME || 'zhizhi_knowledge_base',
    persistDirectory: path.resolve(__dirname, '../../', process.env.CHROMA_DIR || '../data/chroma'),
  },
  
  upload: {
    dir: path.resolve(__dirname, '../../', process.env.UPLOAD_DIR || '../data/uploads'),
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ['.pdf', '.docx', '.md', '.txt'],
  },
  
  rag: {
    chunkSize: 500,
    chunkOverlap: 50,
    topK: 5,
    // 功能7：混合检索 + Rerank（纯内存 BM25 + RRF 融合）
    useHybridSearch: true,
    bm25K1: 1.5,
    bm25B: 0.75,
    rrfK: 60,
  },
  
  agent: {
    maxIterations: 5,
  },
};
