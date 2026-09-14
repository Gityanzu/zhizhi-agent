import { getLLM } from './llm';
import { hybridSearch } from './vectorStore';
import { config } from '../config';
import { RetrievalResult } from '../types';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

// RAG 提示词模板
const RAG_PROMPT = `你是一个专业的企业知识库问答助手。请根据以下检索到的知识库内容回答用户的问题。

检索到的知识库内容：
{context}

用户问题：{question}

回答要求：
1. 基于检索到的内容回答，如果内容不足请明确说明
2. 回答要准确、简洁、有条理
3. 如果检索内容与问题无关，请告知用户知识库中没有相关信息
4. 不要编造检索内容中不存在的信息

回答：`;

// 构建 RAG Chain
function buildRAGChain() {
  const prompt = PromptTemplate.fromTemplate(RAG_PROMPT);
  const llm = getLLM();
  const outputParser = new StringOutputParser();
  
  return RunnableSequence.from([
    {
      context: (input: { question: string }) => input.question,
      question: (input: { question: string }) => input.question,
    },
    prompt,
    llm,
    outputParser,
  ]);
}

// 检索并生成回答
export async function ragQuery(
  question: string,
  chatHistory: Array<{ role: string; content: string }> = [],
  collectionIds?: string[]
): Promise<{
  answer: string;
  sources: RetrievalResult[];
}> {
  // 1. 检索相关文档（混合检索）
  const sources = await hybridSearch(question, config.rag.topK, collectionIds);
  
  // 2. 构建上下文
  const context = sources
    .map((s, i) => `[来源${i + 1}: ${s.source}]\n${s.content}`)
    .join('\n\n');
  
  // 3. 构建对话历史上下文
  const historyContext = chatHistory
    .slice(-6) // 只取最近6条
    .map(msg => `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`)
    .join('\n');
  
  // 4. 组装完整问题
  const fullQuestion = historyContext 
    ? `对话历史：\n${historyContext}\n\n当前问题：${question}`
    : question;
  
  // 5. 调用大模型生成回答
  const prompt = PromptTemplate.fromTemplate(RAG_PROMPT);
  const llm = getLLM();
  const outputParser = new StringOutputParser();
  
  const chain = prompt.pipe(llm).pipe(outputParser);
  const answer = await chain.invoke({
    context,
    question: fullQuestion,
  });
  
  return { answer, sources };
}

// 流式 RAG 查询
export async function* ragQueryStream(
  question: string,
  chatHistory: Array<{ role: string; content: string }> = [],
  collectionIds?: string[]
): AsyncGenerator<{ type: string; content: string; sources?: RetrievalResult[] }> {
  // 1. 检索相关文档（混合检索）
  const sources = await hybridSearch(question, config.rag.topK, collectionIds);
  
  // 先发送检索结果
  yield { type: 'retrieval', content: JSON.stringify(sources.map(s => ({ source: s.source, score: s.score }))) };
  
  // 2. 构建上下文
  const context = sources
    .map((s, i) => `[来源${i + 1}: ${s.source}]\n${s.content}`)
    .join('\n\n');
  
  // 3. 构建对话历史
  const historyContext = chatHistory
    .slice(-6)
    .map(msg => `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`)
    .join('\n');
  
  const fullQuestion = historyContext 
    ? `对话历史：\n${historyContext}\n\n当前问题：${question}`
    : question;
  
  // 4. 流式调用大模型
  const prompt = PromptTemplate.fromTemplate(RAG_PROMPT);
  const llm = getLLM();
  
  const chain = prompt.pipe(llm);
  const stream = await chain.stream({
    context,
    question: fullQuestion,
  });
  
  for await (const chunk of stream) {
    const content = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
    if (content) {
      yield { type: 'token', content, sources };
    }
  }
  
  yield { type: 'done', content: '', sources };
}
