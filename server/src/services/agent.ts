import { getLLM, getLLMWithParams } from './llm';
import { hybridSearch } from './vectorStore';
import { config } from '../config';
import { AgentStep, RetrievalResult } from '../types';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { executeCode } from './codeExecutor';
import { getDynamicTools, executeCustomTool, type CustomTool } from './customTool';
import {
  webNavigate, webClick, webType, webScreenshot, webExtractText,
} from './browserTool';
import { textToSQLAndExecute } from './dbQuery';

// Agent 文件工作目录
const AGENT_WORK_DIR = path.resolve(__dirname, '../../agent_output');

// 确保工作目录存在
if (!fs.existsSync(AGENT_WORK_DIR)) {
  fs.mkdirSync(AGENT_WORK_DIR, { recursive: true });
}

// ==================== 工具定义 ====================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

// 工具定义列表（13个工具）
export const tools: ToolDefinition[] = [
  // ===== 知识与计算 =====
  {
    name: 'search_knowledge_base',
    description: '检索企业知识库，回答与公司业务、制度、产品相关的问题。当用户问题涉及企业内部知识时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词或问题' },
      },
      required: ['query'],
    },
  },
  {
    name: 'calculate',
    description: '执行数学计算。当用户需要进行数值计算、单位换算、百分比计算等数学操作时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: '数学表达式，如 "1200 * 0.15" 或 "(100 + 200) / 2"' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'get_current_time',
    description: '获取当前日期和时间。当用户询问当前时间、日期、星期等信息时使用此工具。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'web_search',
    description: '联网搜索实时信息。当用户询问最新新闻、时事、天气、体育赛事、近期事件等需要实时或外部信息的问题时使用此工具。注意：企业内部知识请用search_knowledge_base。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词或问题' },
        max_results: { type: 'string', description: '返回结果数量，默认5条，如 "5"' },
      },
      required: ['query'],
    },
  },
  // ===== 文件操作 =====
  {
    name: 'create_file',
    description: '创建新文件。当用户要求创建文件、写文档、生成代码文件时使用。如果文件已存在会失败，需要用write_file覆盖。',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: '文件名，如 "hello.txt"、"test.py"' },
        content: { type: 'string', description: '文件内容' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'read_file',
    description: '读取文件内容。当用户需要查看某个文件的内容时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: '要读取的文件名' },
      },
      required: ['filename'],
    },
  },
  {
    name: 'write_file',
    description: '写入文件（覆盖已有内容）。当用户要求修改、覆盖文件内容时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: '文件名' },
        content: { type: 'string', description: '新的文件内容' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'append_file',
    description: '追加内容到文件末尾。当用户要求在已有文件后面添加内容时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: '文件名' },
        content: { type: 'string', description: '要追加的内容' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'list_files',
    description: '列出工作目录下的所有文件。当用户需要查看有哪些文件时使用此工具。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_files',
    description: '按关键词搜索文件。当用户需要查找特定文件时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词（匹配文件名）' },
      },
      required: ['keyword'],
    },
  },
  // ===== 系统与文本 =====
  {
    name: 'run_shell',
    description: '运行系统命令（仅支持纯只读命令：dir、ls、type、cat、ver、date、time、echo、whoami、hostname、systeminfo、ipconfig）。当用户需要查看系统信息或文件列表时使用。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令，如 "dir"、"node -v"' },
      },
      required: ['command'],
    },
  },
  {
    name: 'translate_text',
    description: '翻译文本。当用户需要翻译中英文或其他语言时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要翻译的文本' },
        target_lang: { type: 'string', description: '目标语言，如 "中文"、"英文"、"日文"' },
      },
      required: ['text', 'target_lang'],
    },
  },
  {
    name: 'summarize_text',
    description: '文本摘要。当用户需要对长文本进行总结、提炼要点时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要摘要的文本' },
        max_length: { type: 'string', description: '摘要最大长度，如 "200字"' },
      },
      required: ['text'],
    },
  },
  // ===== 代码解释器 =====
  {
    name: 'code_interpreter',
    description: '执行 Python 或 JavaScript 代码。当用户需要数据处理、图表绘制、算法实现、数学可视化等计算任务时使用此工具。支持 matplotlib 图表输出。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的完整代码' },
        language: { type: 'string', description: '编程语言：python 或 javascript' },
      },
      required: ['code', 'language'],
    },
  },
  // ===== 浏览器自动化（功能14） =====
  {
    name: 'web_navigate',
    description: '在真实浏览器中打开指定网址。当用户需要访问某个网页、查看网页内容时使用。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要打开的完整网址，如 https://www.baidu.com' },
      },
      required: ['url'],
    },
  },
  {
    name: 'web_click',
    description: '在当前打开的网页中点击指定元素（CSS选择器）。需先调用 web_navigate 打开页面。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: '元素的 CSS 选择器，如 "#kw"、".search-button"' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'web_type',
    description: '在当前网页的输入框中输入文本。需先调用 web_navigate 打开页面。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: '输入框的 CSS 选择器' },
        text: { type: 'string', description: '要输入的文本' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'web_screenshot',
    description: '对当前打开的网页截图，返回图片。需先调用 web_navigate 打开页面。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'web_extract_text',
    description: '提取当前网页的纯文本内容。需先调用 web_navigate 打开页面。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  // ===== 数据库自然语言查询（功能15） =====
  {
    name: 'text_to_sql',
    description: '对已配置的数据库连接执行自然语言查询，自动生成 SQL 并返回表格结果。当用户询问业务数据库中的数据时使用。',
    parameters: {
      type: 'object',
      properties: {
        connection_id: { type: 'string', description: '数据库连接ID' },
        question: { type: 'string', description: '自然语言问题，如"查询销售额最高的前5个产品"' },
      },
      required: ['connection_id', 'question'],
    },
  },
];

// ==================== 工具执行 ====================

// 工具执行上下文（可携带本次请求的知识库过滤范围等）
export interface ToolContext {
  collectionIds?: string[];
}

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  context?: ToolContext
): Promise<string> {
  switch (toolName) {
    case 'search_knowledge_base':
      return await executeKnowledgeBaseSearch(args.query, context?.collectionIds);
    case 'calculate':
      return executeCalculate(args.expression);
    case 'get_current_time':
      return executeGetCurrentTime();
    case 'web_search':
      return await executeWebSearch(args.query, args.max_results);
    case 'create_file':
      return executeCreateFile(args.filename, args.content);
    case 'read_file':
      return executeReadFile(args.filename);
    case 'write_file':
      return executeWriteFile(args.filename, args.content);
    case 'append_file':
      return executeAppendFile(args.filename, args.content);
    case 'list_files':
      return executeListFiles();
    case 'search_files':
      return executeSearchFiles(args.keyword);
    case 'run_shell':
      return await executeRunShell(args.command);
    case 'translate_text':
      return await executeTranslate(args.text, args.target_lang);
    case 'summarize_text':
      return await executeSummarize(args.text, args.max_length);
    case 'code_interpreter':
      return await executeCodeInterpreter(args.code, args.language);
    case 'web_navigate':
      return await webNavigate(args.url);
    case 'web_click':
      return await webClick(args.selector);
    case 'web_type':
      return await webType(args.selector, args.text);
    case 'web_screenshot':
      return await webScreenshot();
    case 'web_extract_text':
      return await webExtractText();
    case 'text_to_sql':
      return await textToSQLAndExecute(args.connection_id, args.question);
    default:
      // 尝试自定义工具
      return await executeCustomTool(toolName, args);
  }
}

// 安全路径处理
function safePath(filename: string): string {
  const safeName = path.basename(filename);
  return path.join(AGENT_WORK_DIR, safeName);
}

// 知识库检索工具
async function executeKnowledgeBaseSearch(query: string, collectionIds?: string[]): Promise<string> {
  try {
    const results = await hybridSearch(query, config.rag.topK, collectionIds);
    if (results.length === 0) return '知识库中未找到相关内容。';
    return results.map((r, i) => `[来源: ${r.source}]\n${r.content}`).join('\n\n---\n\n');
  } catch (error) {
    return `检索失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 数学计算工具（安全解析，不使用 eval/new Function）
function executeCalculate(expression: string): string {
  try {
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
    if (!sanitized.trim()) return '无效的表达式';
    const result = safeEvalMath(sanitized);
    if (!isFinite(result)) return '计算结果无效（除零或溢出）';
    // 保留合理精度
    const rounded = Math.round(result * 1e10) / 1e10;
    return `计算结果: ${rounded}`;
  } catch (error) {
    return `计算失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 安全的数学表达式求值（递归下降解析器，仅支持 + - * / % () 和数字）
function safeEvalMath(expr: string): number {
  let pos = 0;
  
  function peek(): string {
    return expr[pos] || '';
  }
  
  function consume(): string {
    return expr[pos++];
  }
  
  function skipWhitespace() {
    while (pos < expr.length && /\s/.test(expr[pos])) pos++;
  }
  
  function parseNumber(): number {
    skipWhitespace();
    let numStr = '';
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) {
      numStr += consume();
    }
    if (numStr === '') throw new Error('期望数字');
    const num = parseFloat(numStr);
    if (isNaN(num)) throw new Error('无效数字');
    return num;
  }
  
  function parseFactor(): number {
    skipWhitespace();
    if (peek() === '(') {
      consume(); // (
      const val = parseExpression();
      skipWhitespace();
      if (peek() !== ')') throw new Error('缺少右括号');
      consume(); // )
      return val;
    }
    if (peek() === '-') {
      consume();
      return -parseFactor();
    }
    if (peek() === '+') {
      consume();
      return parseFactor();
    }
    return parseNumber();
  }
  
  function parseTerm(): number {
    let left = parseFactor();
    skipWhitespace();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume();
      const right = parseFactor();
      if (op === '*') left *= right;
      else if (op === '/') {
        if (right === 0) throw new Error('除数不能为零');
        left /= right;
      }
      else if (op === '%') left %= right;
      skipWhitespace();
    }
    return left;
  }
  
  function parseExpression(): number {
    let left = parseTerm();
    skipWhitespace();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      if (op === '+') left += right;
      else left -= right;
      skipWhitespace();
    }
    return left;
  }
  
  const result = parseExpression();
  skipWhitespace();
  if (pos < expr.length) throw new Error(`意外字符: ${expr[pos]}`);
  return result;
}

// 获取当前时间工具
function executeGetCurrentTime(): string {
  const now = new Date();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `当前时间: ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

// 联网搜索工具（使用 Bing 搜索，国内可访问，HTML 结构简单）
async function executeWebSearch(query: string, maxResults?: string): Promise<string> {
  try {
    const limit = parseInt(maxResults || '5', 10) || 5;
    const encodedQuery = encodeURIComponent(query);
    
    // 使用 Bing 搜索
    const url = `https://www.bing.com/search?q=${encodedQuery}&count=${limit}&setlang=zh-CN`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    
    if (!response.ok) {
      return `搜索失败：HTTP ${response.status}`;
    }
    
    const html = await response.text();
    
    // 解析 Bing 搜索结果
    const results: Array<{ title: string; snippet: string; url: string }> = [];
    
    // Bing 搜索结果格式：<li class="b_algo"><h2><a href="...">标题</a></h2><p>摘要</p></li>
    const resultRegex = /<li[^>]*class="b_algo"[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
    let match;
    
    while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
      const url = match[1].replace(/&amp;/g, '&');
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      const snippet = match[3].replace(/<[^>]*>/g, '').trim();
      if (title) {
        results.push({ title, snippet: snippet || '（无摘要）', url });
      }
    }
    
    // 备用解析方式（Bing 可能有不同结构）
    if (results.length === 0) {
      const altRegex = /<div[^>]*class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
      const titleRegex = /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      
      const titles: Array<{ title: string; url: string }> = [];
      let titleMatch;
      while ((titleMatch = titleRegex.exec(html)) !== null && titles.length < limit) {
        titles.push({
          url: titleMatch[1].replace(/&amp;/g, '&'),
          title: titleMatch[2].replace(/<[^>]*>/g, '').trim(),
        });
      }
      
      const snippets: string[] = [];
      let snippetMatch;
      while ((snippetMatch = altRegex.exec(html)) !== null && snippets.length < limit) {
        snippets.push(snippetMatch[1].replace(/<[^>]*>/g, '').trim());
      }
      
      for (let i = 0; i < titles.length && i < limit; i++) {
        results.push({
          title: titles[i].title,
          snippet: snippets[i] || '（无摘要）',
          url: titles[i].url,
        });
      }
    }
    
    if (results.length === 0) {
      return `未找到与 "${query}" 相关的搜索结果。可能原因：搜索词过于特殊或页面结构变化。`;
    }
    
    // 格式化结果
    let output = `搜索"${query}"共找到 ${results.length} 条结果：\n\n`;
    results.forEach((r, i) => {
      output += `${i + 1}. ${r.title}\n`;
      output += `   ${r.snippet}\n`;
      if (r.url && r.url.startsWith('http')) {
        output += `   链接: ${r.url}\n`;
      }
      output += '\n';
    });
    
    return output;
  } catch (error) {
    return `搜索失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 创建文件工具
function executeCreateFile(filename: string, content: string): string {
  try {
    const filePath = safePath(filename);
    if (fs.existsSync(filePath)) {
      return `创建失败：文件 "${filename}" 已存在，请使用 write_file 覆盖或换个文件名`;
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return `文件创建成功！\n文件名: ${filename}\n路径: ${filePath}\n大小: ${content.length} 字符`;
  } catch (error) {
    return `创建失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 读取文件工具
function executeReadFile(filename: string): string {
  try {
    const filePath = safePath(filename);
    if (!fs.existsSync(filePath)) return `文件不存在: ${filename}`;
    const content = fs.readFileSync(filePath, 'utf-8');
    return `文件内容（${filename}）：\n${content}`;
  } catch (error) {
    return `读取失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 写入文件工具（覆盖）
function executeWriteFile(filename: string, content: string): string {
  try {
    const filePath = safePath(filename);
    const existed = fs.existsSync(filePath);
    fs.writeFileSync(filePath, content, 'utf-8');
    return `${existed ? '文件已覆盖更新' : '文件创建成功'}！\n文件名: ${filename}\n路径: ${filePath}\n大小: ${content.length} 字符`;
  } catch (error) {
    return `写入失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 追加文件工具
function executeAppendFile(filename: string, content: string): string {
  try {
    const filePath = safePath(filename);
    if (!fs.existsSync(filePath)) return `文件不存在: ${filename}，请先创建`;
    fs.appendFileSync(filePath, content, 'utf-8');
    return `内容已追加到 ${filename}\n追加大小: ${content.length} 字符`;
  } catch (error) {
    return `追加失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 列出文件工具
function executeListFiles(): string {
  try {
    const files = fs.readdirSync(AGENT_WORK_DIR);
    if (files.length === 0) return '工作目录为空';
    const fileList = files.map(f => {
      const stat = fs.statSync(path.join(AGENT_WORK_DIR, f));
      return `- ${f} (${stat.size} 字节, ${stat.isDirectory() ? '目录' : '文件'})`;
    }).join('\n');
    return `工作目录文件列表（共${files.length}个）：\n${fileList}`;
  } catch (error) {
    return `列出失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 搜索文件工具
function executeSearchFiles(keyword: string): string {
  try {
    const files = fs.readdirSync(AGENT_WORK_DIR);
    const matched = files.filter(f => f.toLowerCase().includes(keyword.toLowerCase()));
    if (matched.length === 0) return `未找到包含 "${keyword}" 的文件`;
    return `找到 ${matched.length} 个文件：\n${matched.map(f => `- ${f}`).join('\n')}`;
  } catch (error) {
    return `搜索失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 运行Shell命令（只读白名单，禁止代码执行器）
const ALLOWED_COMMANDS = ['dir', 'ls', 'type', 'cat', 'ver', 'date', 'time', 'echo', 'whoami', 'hostname', 'systeminfo', 'ipconfig'];

async function executeRunShell(command: string): Promise<string> {
  return new Promise((resolve) => {
    const cmd = command.trim().toLowerCase();
    const baseCmd = cmd.split(' ')[0];
    
    if (!ALLOWED_COMMANDS.includes(baseCmd)) {
      resolve(`命令不被允许：${baseCmd}。仅支持只读命令：${ALLOWED_COMMANDS.join(', ')}`);
      return;
    }
    
    exec(command, { timeout: 10000, cwd: AGENT_WORK_DIR }, (error, stdout, stderr) => {
      if (error) {
        resolve(`命令执行出错: ${error.message}\n${stderr || ''}`);
        return;
      }
      const output = (stdout || '').trim();
      resolve(`命令执行结果：\n${output || '(无输出)'}`);
    });
  });
}

// 翻译工具（调用大模型）
async function executeTranslate(text: string, targetLang: string): Promise<string> {
  try {
    const llm = getLLM();
    const response = await llm.invoke([
      new SystemMessage(`你是一个专业翻译官。请将用户提供的文本翻译成${targetLang}，只输出翻译结果，不要添加解释。`),
      new HumanMessage(text),
    ]);
    return `翻译结果（${targetLang}）：\n${response.content}`;
  } catch (error) {
    return `翻译失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 摘要工具（调用大模型）
async function executeSummarize(text: string, maxLength?: string): Promise<string> {
  try {
    const llm = getLLM();
    const lengthHint = maxLength ? `，控制在${maxLength}以内` : '';
    const response = await llm.invoke([
      new SystemMessage(`你是一个文本摘要专家。请对以下文本进行摘要${lengthHint}，提炼核心要点，用简洁的语言输出。`),
      new HumanMessage(text),
    ]);
    return `摘要结果：\n${response.content}`;
  } catch (error) {
    return `摘要失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 代码解释器工具
async function executeCodeInterpreter(code: string, language: string): Promise<string> {
  try {
    const lang: 'python' | 'javascript' = (language === 'javascript' || language === 'js') ? 'javascript' : 'python';
    const result = await executeCode(code, lang);

    let output = `【代码执行结果】(${lang})`;
    if (result.stdout) {
      output += `\n\n--- 标准输出 ---\n${result.stdout}`;
    }
    if (result.stderr) {
      output += `\n\n--- 错误输出 ---\n${result.stderr}`;
    }
    if (result.exitCode !== 0) {
      output += `\n\n[退出码: ${result.exitCode}]`;
    }
    if (result.images.length > 0) {
      output += `\n\n--- 生成的图表 (${result.images.length}张) ---\n`;
      result.images.forEach((img, i) => {
        output += `[IMAGE_${i + 1}] ${img}\n`;
      });
    }
    if (!result.stdout && !result.stderr && result.images.length === 0) {
      output += '\n(无输出)';
    }
    return output;
  } catch (error) {
    return `代码执行失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ==================== Agent 执行循环 ====================

// 自定义Agent配置（第二阶段功能5）
export interface CustomAgentConfig {
  systemPrompt?: string;
  tools?: string[]; // 允许的工具名列表，空或undefined表示全部
  model?: string; // 模型ID
  temperature?: number;
}

const SYSTEM_PROMPT = `你是一个智能企业助手，名为"智知"。你可以使用以下工具来帮助用户：

{tools_description}

使用工具的规则：
1. 当用户问题需要查询企业内部知识时，使用 search_knowledge_base 工具
2. 当用户需要数学计算时，使用 calculate 工具
3. 当用户询问当前时间时，使用 get_current_time 工具
4. 当用户要求创建/读取/修改文件时，使用 create_file / read_file / write_file / append_file 工具
5. 当用户需要查看文件列表时，使用 list_files 或 search_files 工具
6. 当用户需要运行系统命令时，使用 run_shell 工具（仅只读命令）
7. 当用户需要翻译时，使用 translate_text 工具
8. 当用户需要文本摘要时，使用 summarize_text 工具
9. 当用户需要编写代码处理数据或绘图时，使用 code_interpreter 工具
10. 如果问题可以直接回答，不需要调用工具
11. 调用工具后，根据工具返回的结果给出最终回答
12. 回答要简洁、准确、有条理

请用中文回答。`;

// 所有内置工具名列表（供前端Agent配置选择）
export function getBuiltinToolNames(): string[] {
  return tools.map(t => t.name);
}

function buildToolsDescription(toolList: ToolDefinition[]): string {
  return toolList.map(t => `- ${t.name}: ${t.description}`).join('\n');
}

// 合并内置工具和动态自定义工具，并按自定义Agent配置过滤
async function resolveAvailableTools(customAgent?: CustomAgentConfig): Promise<ToolDefinition[]> {
  const dynamicTools = await getDynamicTools();
  let allTools = [...tools, ...dynamicTools];

  if (customAgent?.tools && customAgent.tools.length > 0) {
    const allowed = new Set(customAgent.tools);
    allTools = allTools.filter(t => allowed.has(t.name));
  }
  return allTools;
}

// 为自定义Agent构建LLM实例
import { ChatOpenAI } from '@langchain/openai';
function buildLLMForAgent(customAgent?: CustomAgentConfig): ChatOpenAI {
  if (customAgent?.model) {
    // 自定义模型：创建独立实例
    const temp = customAgent.temperature ?? 0.7;
    return new ChatOpenAI({
      openAIApiKey: config.llm.apiKey,
      configuration: { baseURL: config.llm.baseUrl },
      modelName: customAgent.model,
      temperature: temp,
      maxTokens: config.llm.maxTokens,
      streaming: true,
    } as any);
  }
  if (customAgent?.temperature !== undefined) {
    return getLLMWithParams({ temperature: customAgent.temperature });
  }
  return getLLM();
}

// 构建初始消息
function buildInitialMessages(
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }>,
  toolList: ToolDefinition[],
  customSystemPrompt?: string
): any[] {
  const sysPrompt = customSystemPrompt
    ? `${customSystemPrompt}\n\n可用工具：\n${buildToolsDescription(toolList)}`
    : SYSTEM_PROMPT.replace('{tools_description}', buildToolsDescription(toolList));
  return [
    new SystemMessage(sysPrompt),
    ...chatHistory.slice(-6).map(m =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(userMessage),
  ];
}

// 解析工具调用（支持多种模型格式）
function parseToolCalls(message: any): any[] {
  const toolCalls = message?.additional_kwargs?.tool_calls 
    || message?.tool_calls 
    || message?.message_tool_calls 
    || (message?.function_call ? [message.function_call] : [])
    || [];
  
  // 标准化工具调用格式
  return toolCalls.map((tc: any) => {
    if (tc.function) return tc;
    if (tc.name) {
      return {
        id: tc.id || `call_${Date.now()}`,
        type: 'function',
        function: {
          name: tc.name,
          arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {})
        }
      };
    }
    return tc;
  });
}

// 按工具类型差异化截断结果（文件内容类放宽到2000字符，其他500字符）
function truncateToolResult(toolName: string, result: string): string {
  const longResultTools = ['read_file', 'search_knowledge_base', 'list_files', 'run_shell', 'summarize_text', 'code_interpreter'];
  const maxLength = longResultTools.includes(toolName) ? 2000 : 500;
  if (result.length <= maxLength) return result;
  return result.slice(0, maxLength) + `\n...（结果已截断，共${result.length}字符）`;
}

// Agent 执行循环核心（通过回调支持流式和非流式两种输出）
async function runAgentLoop(
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }>,
  callbacks: {
    onToolCall?: (toolName: string, toolArgs: Record<string, any>) => void;
    onToolResult?: (toolName: string, toolResult: string) => void;
    onFinalAnswer?: (answer: string) => void;
  },
  customAgent?: CustomAgentConfig,
  options?: { collectionIds?: string[] }
): Promise<{ answer: string; sources: RetrievalResult[]; tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const availableTools = await resolveAvailableTools(customAgent);
  const messages = buildInitialMessages(userMessage, chatHistory, availableTools, customAgent?.systemPrompt);
  const allSources: RetrievalResult[] = [];
  const llm = buildLLMForAgent(customAgent);
  const collectionIds = options?.collectionIds;
  let iteration = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  while (iteration < config.agent.maxIterations) {
    iteration++;

    const response = await llm.invoke(messages, {
      tools: availableTools.map(t => ({ type: 'function', function: t })),
    } as any);

    // 累计 token 用量（兼容多种属性路径，通义千问用 estimatedTokenUsage）
    const respAny = response as any;
    const rm = respAny?.response_metadata || {};
    const usage = rm.tokenUsage
      || rm.estimatedTokenUsage
      || respAny?.responseMetadata?.tokenUsage
      || respAny?.responseMetadata?.estimatedTokenUsage
      || respAny?.kwargs?.response_metadata?.tokenUsage
      || respAny?.kwargs?.response_metadata?.estimatedTokenUsage
      || respAny?.usage;
    if (usage) {
      totalPromptTokens += usage.promptTokens || usage.prompt_tokens || 0;
      totalCompletionTokens += usage.completionTokens || usage.completion_tokens || 0;
    }

    const message = response as any;
    const toolCalls = parseToolCalls(message);

    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        // 支持多种工具调用格式
        const toolName = toolCall.function?.name 
          || toolCall.name 
          || toolCall.function_call?.name 
          || toolCall.tool_name;
        
        let toolArgs: Record<string, any> = {};

        try {
          const argsStr = toolCall.function?.arguments 
            || toolCall.arguments 
            || toolCall.function_call?.arguments 
            || toolCall.parameters 
            || '{}';
          toolArgs = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
        } catch {
          toolArgs = {};
        }

        if (!toolName) {
          console.warn('[Agent] 无法解析工具名称:', JSON.stringify(toolCall).substring(0, 300));
          continue;
        }

        callbacks.onToolCall?.(toolName, toolArgs);

        const toolResult = await executeTool(toolName, toolArgs, { collectionIds });

        callbacks.onToolResult?.(toolName, toolResult);

        if (toolName === 'search_knowledge_base') {
          const sources = await hybridSearch(toolArgs.query, config.rag.topK, collectionIds);
          allSources.push(...sources);
        }

        // 构建标准格式
        const standardToolCall: any = {
          id: toolCall.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          type: 'function',
          function: {
            name: toolName,
            arguments: typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs)
          }
        };
        messages.push(new AIMessage({ content: '', tool_calls: [standardToolCall] }));
        messages.push(new ToolMessage({ tool_call_id: standardToolCall.id, content: toolResult }));
      }
    } else {
      const answer = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content);
      callbacks.onFinalAnswer?.(answer);
      return {
        answer,
        sources: allSources,
        tokenUsage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens
        }
      };
    }
  }

  const timeoutAnswer = '抱歉，处理您的问题时超出了最大迭代次数，请简化问题后重试。';
  callbacks.onFinalAnswer?.(timeoutAnswer);
  return {
    answer: timeoutAnswer,
    sources: allSources,
    tokenUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens
    }
  };
}

// 非流式 Agent 执行
export async function agentRun(
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }> = [],
  options?: {
    sessionId?: string;
    messageId?: string;
    customAgent?: CustomAgentConfig;
    collectionIds?: string[];
  }
): Promise<{
  answer: string;
  steps: AgentStep[];
  sources: RetrievalResult[];
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  const steps: AgentStep[] = [];
  const toolCallStartTimes = new Map<string, number>();

  const { answer, sources, tokenUsage } = await runAgentLoop(userMessage, chatHistory, {
    onToolCall: (toolName, toolArgs) => {
      toolCallStartTimes.set(toolName, Date.now());
      steps.push({
        type: 'tool_call',
        content: `调用工具: ${toolName}`,
        toolCall: { name: toolName, arguments: toolArgs },
      });
    },
    onToolResult: (toolName, toolResult) => {
      const startTime = toolCallStartTimes.get(toolName) || Date.now();
      const durationMs = Date.now() - startTime;
      toolCallStartTimes.delete(toolName);

      // 记录工具调用到数据库
      if (options?.sessionId) {
        import('./usage').then(({ recordToolCall }) => {
          recordToolCall(
            options.sessionId!,
            options.messageId,
            toolName,
            steps.find(s => s.type === 'tool_call' && s.toolCall?.name === toolName)?.toolCall?.arguments,
            toolResult,
            durationMs
          ).catch(() => {});
        }).catch(() => {});
      }

      steps.push({
        type: 'tool_result',
        content: truncateToolResult(toolName, toolResult),
      });
    },
    onFinalAnswer: (answer) => {
      steps.push({ type: 'final_answer', content: answer });
    },
  }, options?.customAgent, { collectionIds: options?.collectionIds });

  return { answer, steps, sources, tokenUsage };
}

// 流式 Agent 执行（保留真正的流式输出，使用公共辅助函数减少重复）
export async function* agentRunStream(
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }> = [],
  customAgent?: CustomAgentConfig,
  options?: { collectionIds?: string[] }
): AsyncGenerator<{ type: string; content: string; toolCall?: any; sources?: RetrievalResult[]; tokenUsage?: any }> {
  const availableTools = await resolveAvailableTools(customAgent);
  const messages = buildInitialMessages(userMessage, chatHistory, availableTools, customAgent?.systemPrompt);
  const allSources: RetrievalResult[] = [];
  const llm = buildLLMForAgent(customAgent);
  const collectionIds = options?.collectionIds;
  let iteration = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  while (iteration < config.agent.maxIterations) {
    iteration++;

    // 使用真流式输出
    const stream = await llm.stream(messages, {
      tools: availableTools.map(t => ({ type: 'function', function: t })),
    } as any);

    let fullContent = '';
    let collectedToolCalls: any[] = [];
    let lastChunk: any = null;
    let hasToolCalls = false;

    for await (const chunk of stream) {
      lastChunk = chunk;
      const content = typeof chunk.content === 'string' ? chunk.content : '';

      // 检测是否有 tool_calls（支持多种模型格式）
      const rawToolCalls = (chunk as any)?.message_tool_calls 
        || (chunk as any)?.additional_kwargs?.tool_calls 
        || (chunk as any)?.tool_calls 
        || ((chunk as any)?.function_call ? [(chunk as any).function_call] : null);
      const chunkToolCalls = Array.isArray(rawToolCalls) ? rawToolCalls.filter(Boolean) : [];
      
      if (chunkToolCalls.length > 0) {
        hasToolCalls = true;
        // 合并工具调用（流式输出中可能分多个chunk返回）
        for (const tc of chunkToolCalls) {
          if (!tc) continue;
          
          // 获取工具名称用于匹配
          const tcName = tc.function?.name || tc.name || tc.function_call?.name || tc.tool_name;
          
          // 匹配条件：id相同 / index相同 / 名称相同且参数是增量
          const existingIdx = collectedToolCalls.findIndex((c: any) => {
            if (tc.id && c.id === tc.id) return true;
            if (tc.index !== undefined && c.index === tc.index) return true;
            // 如果没有id/index，用名称匹配（同一轮中同名工具视为同一个）
            if (!tc.id && tc.index === undefined) {
              const cName = c.function?.name || c.name || c.function_call?.name || c.tool_name;
              return cName === tcName;
            }
            return false;
          });
          
          if (existingIdx >= 0) {
            // 合并同一个工具调用的参数
            const existing = collectedToolCalls[existingIdx];
            // 合并function.arguments（增量字符串）
            if (tc.function?.arguments) {
              existing.function = existing.function || {};
              existing.function.arguments = (existing.function.arguments || '') + tc.function.arguments;
            }
            // 合并arguments（增量字符串）
            if (tc.arguments && typeof tc.arguments === 'string') {
              existing.arguments = (existing.arguments || '') + tc.arguments;
            }
            // 合并其他字段
            if (tc.id && !existing.id) existing.id = tc.id;
            if (tc.index !== undefined && existing.index === undefined) existing.index = tc.index;
            if (tcName && !existing.function?.name && !existing.name) {
              if (!existing.function) existing.function = {};
              existing.function.name = tcName;
            }
          } else {
            collectedToolCalls.push({ ...tc });
          }
        }
      }

      // 只有在没有 tool_calls 时才输出 token（最终回答）
      if (!hasToolCalls && content) {
        fullContent += content;
        yield { type: 'token', content, sources: allSources };
      } else if (content) {
        fullContent += content;
      }
    }

    // 累计 Token 用量（从最后一个 chunk 提取）
    if (lastChunk) {
      const rm = lastChunk?.response_metadata || {};
      const usage = rm.tokenUsage || rm.estimatedTokenUsage || lastChunk?.usage || {};
      totalPromptTokens += usage.promptTokens || usage.prompt_tokens || 0;
      totalCompletionTokens += usage.completionTokens || usage.completion_tokens || 0;
    }

    // 如果有 tool_calls，执行工具
    if (hasToolCalls && collectedToolCalls.length > 0) {
      for (const toolCall of collectedToolCalls) {
        if (!toolCall) {
          console.warn('[Agent] 跳过空的工具调用');
          continue;
        }
        
        // 支持多种工具调用格式：function.name / name / function_call.name
        const toolName = toolCall.function?.name 
          || toolCall.name 
          || toolCall.function_call?.name 
          || toolCall.tool_name;
        
        let toolArgs: Record<string, any> = {};

        try {
          const argsStr = toolCall.function?.arguments 
            || toolCall.arguments 
            || toolCall.function_call?.arguments 
            || toolCall.parameters 
            || '{}';
          toolArgs = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
        } catch {
          toolArgs = {};
        }

        if (!toolName) {
          console.warn('[Agent] 无法解析工具名称，原始工具调用:', JSON.stringify(toolCall).substring(0, 500));
          yield { type: 'tool_result', content: `工具调用格式错误，无法解析工具名称` };
          continue;
        }

        yield { type: 'tool_call', content: `调用工具: ${toolName}`, toolCall: { name: toolName, arguments: toolArgs } };

        const toolResult = await executeTool(toolName, toolArgs, { collectionIds });

        yield { type: 'tool_result', content: truncateToolResult(toolName, toolResult) };

        if (toolName === 'search_knowledge_base') {
          const sources = await hybridSearch(toolArgs.query, config.rag.topK, collectionIds);
          allSources.push(...sources);
        }

        // 构建标准格式的 tool_calls 用于后续消息
        const standardToolCall: any = {
          id: toolCall.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          type: 'function',
          function: {
            name: toolName,
            arguments: typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs)
          }
        };
        messages.push(new AIMessage({ content: '', tool_calls: [standardToolCall] }));
        messages.push(new ToolMessage({ tool_call_id: standardToolCall.id, content: toolResult }));
      }
    } else {
      // 没有 tool_calls，是最终回答（已经流式输出）
      yield {
        type: 'done',
        content: '',
        sources: allSources,
        tokenUsage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
        }
      };
      return;
    }
  }

  yield {
    type: 'done',
    content: '抱歉，处理超时，请简化问题。',
    sources: allSources,
    tokenUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    }
  };
}
