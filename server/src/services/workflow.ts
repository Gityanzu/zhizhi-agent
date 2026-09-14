import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { usePostgres, query } from '../db';
import { getLLM } from './llm';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { executeTool } from './agent';
import { executeCode } from './codeExecutor';
import { Parser } from 'expr-eval';

// ==================== 类型定义 ====================

export type WorkflowNodeType = 'start' | 'llm' | 'tool' | 'code' | 'condition' | 'merge' | 'end';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  // start: 初始化变量
  variables?: Record<string, any>;
  // llm: 调用大模型
  prompt?: string;
  outputVar?: string;
  // tool: 调用工具
  toolName?: string;
  toolArgs?: Record<string, any>;
  // code: 代码解释器
  code?: string;
  language?: 'python' | 'javascript';
  // condition: 条件分支
  expression?: string;
  trueNodeId?: string;
  falseNodeId?: string;
  // 普通下一节点
  nextNodeId?: string;
  // 循环
  loopCount?: number;
  loopNodeId?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: any[];
  createdAt: string;
  updatedAt: string;
}

export interface NodeExecutionResult {
  nodeId: string;
  nodeName: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  output?: any;
  error?: string;
  durationMs?: number;
}

export interface WorkflowExecutionResult {
  success: boolean;
  variables: Record<string, any>;
  finalResult: any;
  nodeResults: NodeExecutionResult[];
  error?: string;
}

// ==================== 持久化（PG + JSON 双模式） ====================

const PERSIST_DIR = path.resolve(__dirname, '../../data');
const WORKFLOWS_FILE = path.join(PERSIST_DIR, 'workflows.json');

if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

let workflowsMap = new Map<string, Workflow>();
let loaded = false;

function loadFromFile(): void {
  if (loaded) return;
  if (fs.existsSync(WORKFLOWS_FILE)) {
    try {
      const raw = fs.readFileSync(WORKFLOWS_FILE, 'utf-8');
      const data = JSON.parse(raw) as Workflow[];
      for (const w of data) workflowsMap.set(w.id, w);
      console.log(`工作流已加载: ${workflowsMap.size} 个`);
    } catch (e) {
      console.warn('加载工作流失败:', e);
    }
  }
  loaded = true;
}

function saveToFile(): void {
  try {
    fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(Array.from(workflowsMap.values()), null, 2), 'utf-8');
  } catch (e) {
    console.error('保存工作流失败:', e);
  }
}

function mapRow(row: any): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    nodes: row.nodes || [],
    edges: row.edges || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==================== CRUD ====================

export async function createWorkflow(data: Partial<Workflow>): Promise<Workflow> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const wf: Workflow = {
    id,
    name: data.name || '未命名工作流',
    description: data.description || '',
    nodes: data.nodes || [],
    edges: data.edges || [],
    createdAt: now,
    updatedAt: now,
  };

  if (usePostgres) {
    await query(
      `INSERT INTO workflows (id, name, description, nodes, edges, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, wf.name, wf.description, JSON.stringify(wf.nodes), JSON.stringify(wf.edges), now, now]
    );
  } else {
    loadFromFile();
    workflowsMap.set(id, wf);
    saveToFile();
  }
  return wf;
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  if (usePostgres) {
    const result = await query('SELECT * FROM workflows WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  } else {
    loadFromFile();
    return workflowsMap.get(id) || null;
  }
}

export async function getAllWorkflows(): Promise<Workflow[]> {
  if (usePostgres) {
    const result = await query('SELECT * FROM workflows ORDER BY updated_at DESC');
    return result.rows.map(mapRow);
  } else {
    loadFromFile();
    return Array.from(workflowsMap.values()).sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
}

export async function updateWorkflow(id: string, data: Partial<Workflow>): Promise<Workflow | null> {
  const existing = await getWorkflow(id);
  if (!existing) return null;

  const updated: Workflow = {
    ...existing,
    ...data,
    id,
    updatedAt: new Date().toISOString(),
    // 确保 nodes/edges 为数组
    nodes: data.nodes !== undefined ? data.nodes : existing.nodes,
    edges: data.edges !== undefined ? data.edges : existing.edges,
  };

  if (usePostgres) {
    await query(
      `UPDATE workflows SET name=$1, description=$2, nodes=$3, edges=$4, updated_at=$5 WHERE id=$6`,
      [updated.name, updated.description, JSON.stringify(updated.nodes), JSON.stringify(updated.edges), updated.updatedAt, id]
    );
  } else {
    loadFromFile();
    workflowsMap.set(id, updated);
    saveToFile();
  }
  return updated;
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query('DELETE FROM workflows WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  } else {
    loadFromFile();
    const result = workflowsMap.delete(id);
    if (result) saveToFile();
    return result;
  }
}

// ==================== DAG 执行引擎 ====================

// 变量替换：把字符串中的 {{varName}} 替换为 variables[varName]
function replaceVariables(input: any, variables: Record<string, any>): any {
  if (typeof input === 'string') {
    return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const val = resolveVar(variables, key);
      return val === undefined || val === null ? '' : String(val);
    });
  }
  if (Array.isArray(input)) {
    return input.map(item => replaceVariables(item, variables));
  }
  if (input !== null && typeof input === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = replaceVariables(v, variables);
    }
    return out;
  }
  return input;
}

// 支持 a.b.c 路径取值
function resolveVar(variables: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let cur: any = variables;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

const exprParser = new Parser();

// 执行单个节点，返回该节点输出
async function runNode(
  node: WorkflowNode,
  variables: Record<string, any>
): Promise<{ output: any; nextNodeId?: string }> {
  switch (node.type) {
    case 'start': {
      // 初始化变量
      if (node.variables) {
        Object.assign(variables, replaceVariables(node.variables, variables));
      }
      return { output: { initialized: true }, nextNodeId: node.nextNodeId };
    }

    case 'llm': {
      const prompt = replaceVariables(node.prompt || '', variables);
      const llm = getLLM();
      const response = await llm.invoke([
        new SystemMessage('你是一个工作流中的大模型节点，请根据用户提示完成任务并直接输出结果。'),
        new HumanMessage(prompt),
      ]);
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const outVar = node.outputVar || `llm_${node.id}`;
      variables[outVar] = content;
      return { output: content, nextNodeId: node.nextNodeId };
    }

    case 'tool': {
      const args = replaceVariables(node.toolArgs || {}, variables);
      const result = await executeTool(node.toolName || '', args);
      const outVar = node.outputVar || `tool_${node.id}`;
      variables[outVar] = result;
      return { output: result, nextNodeId: node.nextNodeId };
    }

    case 'code': {
      const code = replaceVariables(node.code || '', variables);
      const lang: 'python' | 'javascript' = node.language === 'javascript' ? 'javascript' : 'python';
      const result = await executeCode(code, lang);
      const output = {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        images: result.images,
      };
      const outVar = node.outputVar || `code_${node.id}`;
      variables[outVar] = output;
      return { output, nextNodeId: node.nextNodeId };
    }

    case 'condition': {
      const expr = replaceVariables(node.expression || 'true', variables);
      let truthy = false;
      try {
        // 把变量注入表达式上下文
        const compiled = exprParser.parse(expr);
        const scope: Record<string, any> = {};
        for (const [k, v] of Object.entries(variables)) {
          if (typeof v === 'number' || typeof v === 'boolean') scope[k] = v;
          else if (typeof v === 'string') scope[k] = v;
        }
        const val = compiled.evaluate(scope);
        truthy = !!val;
      } catch (e) {
        // 表达式解析失败时，退化为字符串真值判断
        truthy = /^\s*(true|yes|1|是)\s*$/i.test(expr);
      }
      const nextNodeId = truthy ? node.trueNodeId : node.falseNodeId;
      return { output: { condition: truthy, expr }, nextNodeId };
    }

    case 'merge': {
      // 合并节点：直接透传到下一节点（等待逻辑在调度中处理）
      return { output: { merged: true }, nextNodeId: node.nextNodeId };
    }

    case 'end': {
      const outVar = node.outputVar || 'finalResult';
      return { output: variables[outVar], nextNodeId: undefined };
    }

    default:
      return { output: null, nextNodeId: node.nextNodeId };
  }
}

// 执行工作流
export async function executeWorkflow(
  workflowId: string,
  inputVariables: Record<string, any> = {}
): Promise<WorkflowExecutionResult> {
  const wf = await getWorkflow(workflowId);
  if (!wf) {
    return { success: false, variables: {}, finalResult: null, nodeResults: [], error: '工作流不存在' };
  }

  const variables: Record<string, any> = { ...inputVariables };
  const nodeMap = new Map(wf.nodes.map(n => [n.id, n]));
  const nodeResults: NodeExecutionResult[] = wf.nodes.map(n => ({
    nodeId: n.id,
    nodeName: n.name,
    status: 'pending' as const,
  }));
  const resultMap = new Map(nodeResults.map(r => [r.nodeId, r]));

  // 找到 start 节点
  const startNode = wf.nodes.find(n => n.type === 'start') || wf.nodes[0];
  if (!startNode) {
    return { success: false, variables, finalResult: null, nodeResults, error: '工作流中没有节点' };
  }

  // 循环次数（从 start 节点读取）
  const loopCount = Math.max(1, startNode.loopCount || 1);
  const loopNodeId = startNode.loopNodeId || startNode.id;
  const visited = new Set<string>();
  const MAX_STEPS = 200;
  let steps = 0;

  for (let iteration = 0; iteration < loopCount; iteration++) {
    let currentNodeId: string | undefined = startNode.id;

    while (currentNodeId) {
      if (++steps > MAX_STEPS) {
        return { success: false, variables, finalResult: null, nodeResults, error: '工作流执行步数超限（可能存在循环）' };
      }

      const node = nodeMap.get(currentNodeId);
      if (!node) {
        return { success: false, variables, finalResult: null, nodeResults, error: `节点不存在: ${currentNodeId}` };
      }

      // merge 节点的上游等待：简单实现，直接执行
      const result = resultMap.get(node.id)!;
      result.status = 'running';
      const startTime = Date.now();

      try {
        const { output, nextNodeId } = await runNode(node, variables);
        result.output = output;
        result.status = 'success';
        result.durationMs = Date.now() - startTime;
        visited.add(node.id);

        if (node.type === 'end') {
          currentNodeId = undefined; // 终止
          if (iteration < loopCount - 1) {
            // 还有循环次数：跳回 loopNodeId
            currentNodeId = loopNodeId;
            variables[`iteration`] = iteration + 1;
          }
          break;
        }
        currentNodeId = nextNodeId;
      } catch (e) {
        result.status = 'failed';
        result.error = e instanceof Error ? e.message : String(e);
        return { success: false, variables, finalResult: null, nodeResults, error: `节点 ${node.name} 执行失败: ${result.error}` };
      }
    }
  }

  // 未访问的节点标记为 skipped
  for (const r of nodeResults) {
    if (r.status === 'pending') r.status = 'skipped';
  }

  const finalNode = wf.nodes.find(n => n.type === 'end');
  const finalResult = finalNode ? variables[finalNode.outputVar || 'finalResult'] : null;

  return { success: true, variables, finalResult, nodeResults };
}
