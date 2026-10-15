import { api } from './request';

export interface TreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  children?: TreeNode[];
}

// 目录树（递归）
export async function getWorkspaceTree(p?: string): Promise<{ root: string; tree: TreeNode | null }> {
  const res = await api.get('/api/workspace/tree', { params: p ? { path: p } : {} });
  return res.data;
}

// 单文件内容（只读，文本）
export async function getWorkspaceFile(p: string): Promise<{ path: string; content: string; language: string }> {
  const res = await api.get('/api/workspace/file', { params: { path: p } });
  return res.data;
}

/**
 * 原始文件（二进制）。
 *
 * 用 blob 而不是直接给 iframe 一个 URL：iframe/img 的请求带不了 Authorization 头，
 * 走 axios 取回再 createObjectURL 才能复用现有的鉴权通道，无需为预览另开口子。
 */
export async function getWorkspaceRaw(p: string): Promise<Blob> {
  const res = await api.get('/api/workspace/raw', { params: { path: p }, responseType: 'blob' });
  return res.data as Blob;
}

// Word(.docx) 转 HTML，供内联预览（浏览器无法直接渲染 docx）
export async function getWorkspaceDocx(p: string): Promise<{ path: string; html: string; messages: string[] }> {
  const res = await api.get('/api/workspace/docx', { params: { path: p } });
  return res.data;
}

export interface SheetPreview {
  name: string;
  /** 已转好的表格 HTML（服务端转义过，客户端仍会 DOMPurify 净化） */
  html: string;
  rows: number;
  cols: number;
  truncated: boolean;
}

// Excel(.xlsx/.xlsm) 转 HTML 表格，供内联预览（浏览器无法直接渲染 xlsx）
export async function getWorkspaceSheet(
  p: string
): Promise<{ path: string; sheets: SheetPreview[]; messages: string[] }> {
  const res = await api.get('/api/workspace/sheet', { params: { path: p } });
  return res.data;
}
