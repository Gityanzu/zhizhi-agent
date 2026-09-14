import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { config } from '../config';
import { addDocuments, deleteDocumentsBySource } from './vectorStore';
import { DocumentInfo } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { usePostgres, query } from '../db';

// pdf-parse 使用 require 方式导入（兼容 CommonJS）
const pdf = require('pdf-parse');

// 持久化文件路径（JSON 模式）
const PERSIST_DIR = path.resolve(__dirname, '../../data');
const DOCUMENTS_FILE = path.join(PERSIST_DIR, 'documents.json');

// 确保目录存在
if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

// 文档元数据存储（JSON 文件模式）
const documentStore = new Map<string, DocumentInfo>();
let initialized = false;

// 从文件加载文档元数据
function loadFromFile(): void {
  if (initialized) return;
  
  if (fs.existsSync(DOCUMENTS_FILE)) {
    try {
      const raw = fs.readFileSync(DOCUMENTS_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, DocumentInfo>;
      for (const [id, doc] of Object.entries(data)) {
        documentStore.set(id, doc);
      }
      console.log(`文档存储已加载: ${documentStore.size} 个文档`);
    } catch (error) {
      console.warn('加载文档存储失败，将创建新存储:', error);
    }
  }
  initialized = true;
}

// 保存到文件
function saveToFile(): void {
  try {
    const data: Record<string, DocumentInfo> = {};
    for (const [id, doc] of documentStore.entries()) {
      data[id] = doc;
    }
    fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('保存文档存储失败:', error);
  }
}

// 初始化
loadFromFile();

// 解析文件内容
export async function parseFile(filePath: string, mimeType: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.pdf':
      return await parsePDF(filePath);
    case '.docx':
      return await parseWord(filePath);
    case '.md':
    case '.txt':
      return fs.readFileSync(filePath, 'utf-8');
    default:
      throw new Error(`不支持的文件格式: ${ext}`);
  }
}

// 解析 PDF
async function parsePDF(filePath: string): Promise<string> {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
}

// 解析 Word
async function parseWord(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

// 文本分块
export async function splitText(text: string): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.rag.chunkSize,
    chunkOverlap: config.rag.chunkOverlap,
    separators: ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', ''],
  });
  return await splitter.splitText(text);
}

// 处理上传的文档：解析 -> 分块 -> 向量化 -> 存储
export async function processDocument(
  filePath: string,
  originalName: string,
  fileSize: number,
  collectionId?: string | null
): Promise<DocumentInfo> {
  const docId = uuidv4();
  const uploadTime = new Date().toISOString();

  // 1. 解析文件
  const text = await parseFile(filePath, '');

  // 2. 文本分块
  const chunks = await splitText(text);

  // 3. 构建元数据
  const metadatas = chunks.map((_, index) => ({
    source: originalName,
    docId,
    chunkIndex: index,
    uploadTime,
    totalChunks: chunks.length,
    ...(collectionId ? { collectionId } : {}),
  }));

  // 4. 添加到向量库
  await addDocuments(chunks, metadatas);

  // 5. 记录文档信息
  const docInfo: DocumentInfo = {
    id: docId,
    name: originalName,
    size: fileSize,
    type: path.extname(originalName),
    uploadTime,
    chunkCount: chunks.length,
    collectionId: collectionId || null,
  };

  if (usePostgres) {
    await query(
      'INSERT INTO documents (id, name, size, type, chunk_count, file_path, created_at, collection_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [docId, originalName, fileSize, path.extname(originalName), chunks.length, filePath, uploadTime, collectionId || null]
    );
  } else {
    documentStore.set(docId, docInfo);
    saveToFile();
  }

  return docInfo;
}

// 获取所有文档（支持按 collectionId 筛选）
export async function getAllDocuments(collectionId?: string | null): Promise<DocumentInfo[]> {
  if (usePostgres) {
    let sql = 'SELECT id, name, size, type, chunk_count, created_at, collection_id FROM documents WHERE 1=1';
    const params: any[] = [];
    if (collectionId) {
      params.push(collectionId);
      sql += ` AND collection_id = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      size: parseInt(row.size, 10),
      type: row.type,
      uploadTime: row.created_at,
      chunkCount: parseInt(row.chunk_count, 10),
      collectionId: row.collection_id || null,
    }));
  } else {
    let list = Array.from(documentStore.values()).sort(
      (a, b) => new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime()
    );
    if (collectionId) {
      list = list.filter(d => d.collectionId === collectionId);
    }
    return list;
  }
}

// 删除文档
export async function deleteDocument(docId: string): Promise<boolean> {
  let doc: DocumentInfo | undefined;
  
  if (usePostgres) {
    const result = await query('SELECT id, name, size, type, chunk_count, created_at FROM documents WHERE id = $1', [docId]);
    if (result.rows.length === 0) return false;
    const row = result.rows[0];
    doc = {
      id: row.id,
      name: row.name,
      size: parseInt(row.size, 10),
      type: row.type,
      uploadTime: row.created_at,
      chunkCount: parseInt(row.chunk_count, 10),
    };
  } else {
    doc = documentStore.get(docId);
    if (!doc) return false;
  }
  
  // 从向量库删除
  await deleteDocumentsBySource(doc.name);
  
  // 删除上传的文件
  const uploadPath = path.join(config.upload.dir, `${docId}_${doc.name}`);
  if (fs.existsSync(uploadPath)) {
    fs.unlinkSync(uploadPath);
  }
  
  if (usePostgres) {
    await query('DELETE FROM documents WHERE id = $1', [docId]);
  } else {
    documentStore.delete(docId);
    saveToFile();
  }
  return true;
}
