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

// 单文件内容（只读）
export async function getWorkspaceFile(p: string): Promise<{ path: string; content: string; language: string }> {
  const res = await api.get('/api/workspace/file', { params: { path: p } });
  return res.data;
}
