/**
 * MCP (Model Context Protocol) Server 实现
 * 基于 JSON-RPC 2.0 协议，暴露工具给 MCP 客户端（如 Claude Desktop）
 * 
 * 支持的标准方法：
 * - initialize: 初始化连接
 * - tools/list: 列出可用工具
 * - tools/call: 调用工具
 * - resources/list: 列出可用资源
 * - resources/read: 读取资源
 * - prompts/list: 列出可用提示词
 * - prompts/get: 获取提示词
 */

import { tools, executeTool as agentExecuteTool } from '../services/agent';
import * as fs from 'fs';
import * as path from 'path';

const AGENT_WORK_DIR = path.resolve(__dirname, '../../agent_output');

// MCP 服务器信息
const SERVER_INFO = {
  name: 'zhizhi-mcp-server',
  version: '1.0.0',
  description: '智知 Agent MCP 服务器 - 提供文件操作、计算、知识库检索等工具',
};

// 协议版本
const PROTOCOL_VERSION = '2024-11-05';

// 可用资源
const RESOURCES = [
  {
    uri: 'file:///workspace',
    name: '工作目录',
    description: 'Agent 工作目录，包含所有创建的文件',
    mimeType: 'text/plain',
  },
];

// 可用提示词模板
const PROMPTS = [
  {
    name: 'code-review',
    description: '代码审查提示词',
    arguments: [{ name: 'code', description: '要审查的代码' }],
  },
  {
    name: 'document-summary',
    description: '文档摘要提示词',
    arguments: [{ name: 'document', description: '要摘要的文档内容' }],
  },
];

// 工具执行结果接口
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// 执行工具（复用 agent.ts 的统一实现）
async function executeTool(name: string, args: Record<string, any>): Promise<ToolResult> {
  try {
    const result = await agentExecuteTool(name, args);
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `工具执行失败: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

// 处理 JSON-RPC 请求
export async function handleMCPRequest(request: any): Promise<any> {
  const { jsonrpc, id, method, params } = request;

  // 验证 JSON-RPC 版本
  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be 2.0' },
    };
  }

  try {
    switch (method) {
      // 初始化
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
            },
            serverInfo: SERVER_INFO,
          },
        };
      }

      // 初始化完成通知
      case 'notifications/initialized': {
        return null; // 通知不需要响应
      }

      // 列出工具
      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: tools.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: {
                type: 'object',
                properties: t.parameters.properties,
                required: t.parameters.required,
              },
            })),
          },
        };
      }

      // 调用工具
      case 'tools/call': {
        const { name, arguments: toolArgs } = params || {};
        const result = await executeTool(name, toolArgs || {});
        return {
          jsonrpc: '2.0',
          id,
          result,
        };
      }

      // 列出资源
      case 'resources/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: { resources: RESOURCES },
        };
      }

      // 读取资源
      case 'resources/read': {
        const { uri } = params || {};
        if (uri === 'file:///workspace') {
          const files = fs.existsSync(AGENT_WORK_DIR) ? fs.readdirSync(AGENT_WORK_DIR) : [];
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{
                uri,
                mimeType: 'text/plain',
                text: `工作目录文件：\n${files.map(f => `- ${f}`).join('\n') || '(空)'}`,
              }],
            },
          };
        }
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32001, message: `Resource not found: ${uri}` },
        };
      }

      // 列出提示词
      case 'prompts/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: { prompts: PROMPTS },
        };
      }

      // 获取提示词
      case 'prompts/get': {
        const { name, arguments: promptArgs } = params || {};
        const prompt = PROMPTS.find(p => p.name === name);
        if (!prompt) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32001, message: `Prompt not found: ${name}` },
          };
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            description: prompt.description,
            messages: [{
              role: 'user',
              content: { type: 'text', text: `使用 ${name} 提示词处理: ${JSON.stringify(promptArgs)}` },
            }],
          },
        };
      }

      // 未知方法
      default: {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
      }
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Internal error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

// 获取 MCP 服务器配置信息（用于前端展示）
export function getMCPServerInfo() {
  return {
    ...SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
    endpoint: '/mcp',
    toolsCount: tools.length,
    resourcesCount: RESOURCES.length,
    promptsCount: PROMPTS.length,
    supportedMethods: [
      'initialize',
      'tools/list',
      'tools/call',
      'resources/list',
      'resources/read',
      'prompts/list',
      'prompts/get',
    ],
  };
}
