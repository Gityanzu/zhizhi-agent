import { api } from './request';
import type { CustomAgent, CustomTool, WorkflowData } from '@/types';

// ===== Skill 技能相关 =====
export async function getSkills() {
  const res = await api.get('/api/skill/list');
  return res.data || { skills: [] };
}

export async function getActiveSkill() {
  const res = await api.get('/api/skill/active');
  return res.data;
}

export async function switchSkill(skillId: string) {
  const res = await api.post('/api/skill/switch', { skillId });
  return res.data;
}

export async function matchSkill(message: string) {
  const res = await api.post('/api/skill/match', { message });
  return res.data;
}

// 热加载文件库技能（SKILL.md 修改后免重启）
export async function reloadSkills(): Promise<{ success: boolean; count: number; message?: string; error?: string }> {
  const res = await api.post('/api/skill/reload');
  return res.data;
}

// 技能详情（SKILL.md 正文 + references）
export async function getSkillDetail(skillId: string) {
  const res = await api.get(`/api/skill/${encodeURIComponent(skillId)}/detail`);
  return res.data;
}

// ===== 自定义 Agent =====
export async function getAgents(): Promise<{ agents: CustomAgent[] }> {
  const res = await api.get('/api/agents');
  return res.data;
}

export async function createAgent(data: Partial<CustomAgent>): Promise<CustomAgent> {
  const res = await api.post('/api/agents', data);
  return res.data;
}

export async function getAgentDetail(id: string): Promise<CustomAgent> {
  const res = await api.get(`/api/agents/${id}`);
  return res.data;
}

export async function updateAgent(id: string, data: Partial<CustomAgent>): Promise<CustomAgent> {
  const res = await api.put(`/api/agents/${id}`, data);
  return res.data;
}

export async function deleteAgent(id: string) {
  await api.delete(`/api/agents/${id}`);
}

// ===== 自定义工具 =====
export async function getCustomTools(): Promise<{ tools: CustomTool[] }> {
  const res = await api.get('/api/custom-tools');
  return res.data;
}

export async function createCustomTool(data: Partial<CustomTool>): Promise<CustomTool> {
  const res = await api.post('/api/custom-tools', data);
  return res.data;
}

export async function getCustomToolDetail(id: string): Promise<CustomTool> {
  const res = await api.get(`/api/custom-tools/${id}`);
  return res.data;
}

export async function updateCustomTool(id: string, data: Partial<CustomTool>): Promise<CustomTool> {
  const res = await api.put(`/api/custom-tools/${id}`, data);
  return res.data;
}

export async function deleteCustomTool(id: string) {
  await api.delete(`/api/custom-tools/${id}`);
}

export async function testCustomTool(id: string, args: Record<string, any>): Promise<{ result: string }> {
  const res = await api.post(`/api/custom-tools/${id}/test`, { args });
  return res.data;
}

// ===== 工作流 =====
export async function getWorkflows(): Promise<{ workflows: WorkflowData[] }> {
  const res = await api.get('/api/workflows');
  return res.data;
}

export async function createWorkflow(data: Partial<WorkflowData>): Promise<WorkflowData> {
  const res = await api.post('/api/workflows', data);
  return res.data;
}

export async function updateWorkflowApi(id: string, data: Partial<WorkflowData>): Promise<WorkflowData> {
  const res = await api.put(`/api/workflows/${id}`, data);
  return res.data;
}

export async function deleteWorkflowApi(id: string) {
  await api.delete(`/api/workflows/${id}`);
}

export async function executeWorkflowApi(id: string, inputVariables: Record<string, any> = {}): Promise<any> {
  const res = await api.post(`/api/workflows/${id}/execute`, { inputVariables });
  return res.data;
}
