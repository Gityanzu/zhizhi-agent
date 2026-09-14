import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { processDocument, getAllDocuments, deleteDocument } from '../services/document';
import { getDocumentCount } from '../services/vectorStore';
import {
  createCollection,
  getAllCollections,
  getCollection,
  updateCollection,
  deleteCollection,
} from '../services/collection';

const router = Router();

// 修复 multer 中文文件名乱码：将 Latin1 编码转换为 UTF-8
function decodeFilename(filename: string): string {
  try {
    return Buffer.from(filename, 'latin1').toString('utf8');
  } catch {
    return filename;
  }
}

// 配置 multer 文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.upload.dir);
  },
  filename: (req, file, cb) => {
    const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = decodeFilename(file.originalname);
    cb(null, `${uniqueId}_${originalName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSize,
  },
  fileFilter: (req, file, cb) => {
    const originalName = decodeFilename(file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    if (config.upload.allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式，仅支持: ${config.upload.allowedTypes.join(', ')}`));
    }
  },
});

// ============ 知识库集合 CRUD（挂在 /api/documents/collections） ============

// 获取全部知识库集合
router.get('/collections', async (req: Request, res: Response) => {
  try {
    const collections = await getAllCollections();
    res.json({ collections });
  } catch (error) {
    console.error('获取知识库集合失败:', error);
    res.status(500).json({ error: '获取知识库集合失败' });
  }
});

// 新建知识库集合
router.post('/collections', async (req: Request, res: Response) => {
  try {
    const { name, description, icon } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '知识库名称不能为空' });
    }
    const collection = await createCollection(name.trim(), description, icon);
    res.json({ collection });
  } catch (error) {
    console.error('创建知识库集合失败:', error);
    res.status(500).json({ error: '创建知识库集合失败' });
  }
});

// 更新知识库集合
router.put('/collections/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, icon } = req.body;
    const collection = await updateCollection(id, { name, description, icon });
    if (!collection) {
      return res.status(404).json({ error: '知识库不存在' });
    }
    res.json({ collection });
  } catch (error) {
    console.error('更新知识库集合失败:', error);
    res.status(500).json({ error: '更新知识库集合失败' });
  }
});

// 删除知识库集合
router.delete('/collections/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await deleteCollection(id);
    if (success) {
      res.json({ message: '知识库删除成功，其内文档已归为未分类' });
    } else {
      res.status(404).json({ error: '知识库不存在' });
    }
  } catch (error) {
    console.error('删除知识库集合失败:', error);
    res.status(500).json({ error: '删除知识库集合失败' });
  }
});

// ============ 文档管理 ============

// 上传文档
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    const originalName = decodeFilename(req.file.originalname);
    const collectionId = (req.body?.collectionId as string) || null;

    const docInfo = await processDocument(
      req.file.path,
      originalName,
      req.file.size,
      collectionId
    );

    res.json({
      message: '文档上传并处理成功',
      document: docInfo,
    });
  } catch (error) {
    console.error('文档处理失败:', error);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: '文档处理失败',
      ...(!isProd && { detail: error instanceof Error ? error.message : String(error) }),
    });
  }
});

// 获取文档列表（支持 ?collectionId= 筛选）
router.get('/list', async (req: Request, res: Response) => {
  try {
    const collectionId = (req.query.collectionId as string) || undefined;
    const documents = await getAllDocuments(collectionId);
    const totalChunks = await getDocumentCount();

    res.json({
      documents,
      totalChunks,
    });
  } catch (error) {
    console.error('获取文档列表失败:', error);
    res.status(500).json({ error: '获取文档列表失败' });
  }
});

// 文档预览（从向量存储中拼接文本）
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documents = await getAllDocuments();
    const doc = documents.find((d: any) => d.id === id);

    if (!doc) {
      return res.status(404).json({ error: '文档不存在' });
    }

    // 从向量存储中获取该文档的所有 chunk
    const { searchVectorsByDocId } = await import('../services/vectorStore');
    const chunks = await searchVectorsByDocId(id);

    // 按 chunkIndex 排序并拼接
    const sortedChunks = chunks.sort((a: any, b: any) =>
      (a.metadata?.chunkIndex || 0) - (b.metadata?.chunkIndex || 0)
    );
    const content = sortedChunks.map((c: any) => c.content).join('\n\n');

    res.json({
      id: doc.id,
      name: doc.name,
      size: doc.size,
      chunkCount: chunks.length,
      content: content || '（文档内容为空或无法预览）',
    });
  } catch (error) {
    console.error('文档预览失败:', error);
    res.status(500).json({ error: '文档预览失败' });
  }
});

// 删除文档
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await deleteDocument(id);

    if (success) {
      res.json({ message: '文档删除成功' });
    } else {
      res.status(404).json({ error: '文档不存在' });
    }
  } catch (error) {
    console.error('删除文档失败:', error);
    res.status(500).json({ error: '删除文档失败' });
  }
});

export default router;
