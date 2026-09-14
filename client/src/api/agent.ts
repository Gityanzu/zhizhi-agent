import { api } from './request';
import type { CustomAgent, CustomTool, WorkflowData } from '@/types';

// ===== Skill 技能相关 =====
export async function getSkills() {
  const res = await api.get('/skills');
  return res.data;
}

export async function getActiveSkill() {
  const res = await api.get('/skills/active');
  return res.data;
}

export async function switchSkill(skillId: string) {
  const res = await api.post('/skills/switch', { skillId });
  return res.data;
}

export async function matchSkill(message: string) {
  const res = await api.post('/skills/match', { message });
  return res.data;
}

// ===== 自定义 Agent =====
export async function getAgents(): Promise<{ agents: CustomAgent[] }> {
  const res = await api.get('/agents');
  return res.data;
}

export async function createAgent(data: Partial<CustomAgent>): Promise<CustomAgent> {
  const res = await api.post('/agents', data);
  return res.data;
}

export async function getAgentDetail(id: string): Promise<CustomAgent> {
  const res = await api.get(`/agents/${id}`);
  return res.data;
}

export async function updateAgent(id: string, data: Partial<CustomAgent>): Promise<CustomAgent> {
  const res = await api.put(`/agents/${id}`, data);
  return res.data;
}

export async function deleteAgent(id: string) {
  await api.delete(`/agents/${id}`);
}

// ===== 自定义工具 =====
export async function getCustomTools(): Promise<{ tools: CustomTool[] }> {
  const res = await api.get('/custom-tools');
  return res.data;
}

export async function createCustomTool(data: Partial<CustomTool>): Promise<CustomTool> {
  const res = await api.post('/custom-tools', data);
  return res.data;
}

export async function getCustomToolDetail(id: string): Promise<CustomTool> {
  const res = await api.get(`/custom-tools/${id}`);
  return res.data;
}

export async function updateCustomTool(id: string, data: Partial<CustomTool>): Promise<CustomTool> {
  const res = await api.put(`/custom-tools/${id}`, data);
  return res.data;
}

export async function deleteCustomTool(id: string) {
  await api.delete(`/custom-tools/${id}`);
}

export async function testCustomTool(id: string, args: Record<string, any>): Promise<{ result: string }> {
  const res = await api.post(`/custom-tools/${id}/test`, { args });
  return res.data;
}

// ===== 工作流 =====
export async function getWorkflows(): Promise<{ workflows: WorkflowData[] }> {
  const res = await api.get('/workflows');
  return res.data;
}

export async function createWorkflow(data: Partial<WorkflowData>): Promise<WorkflowData> {
  const res = await api.post('/workflows', data);
  return res.data;
}

export async function updateWorkflowApi(id: string, data: Partial<WorkflowData>): Promise<WorkflowData> {
  const res = await api.put(`/workflows/${id}`, data);
  return res.data;
}

export async function deleteWorkflowApi(id: string) {
  await api.delete(`/workflows/${id}`);
}

export async function executeWorkflowApi(id: string, inputVariables: Record<string, any> = {}): Promise<any> {
  const res = await api.post(`/workflows/${id}/execute`, { inputVariables });
  return res.data;
}
