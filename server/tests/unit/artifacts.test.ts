/**
 * 消息产物（文件卡片数据源）单元测试
 *
 * 覆盖：文件工具写入成功后登记真实绝对路径 + 磁盘字节数；失败/被拒时不得登记。
 * 这里刻意不碰数据库：登记发生在工具执行处，落库（messages.artifacts）由 taskRunner 负责，
 * 分开测才能一眼看出是"没登记"还是"没落库"。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeTool } from '../../src/services/agent';
import { runWithAgentOutputDir, getAgentOutputDir } from '../../src/services/agentOutput';
import type { MessageArtifact } from '../../src/types';

let dir = '';
let root = ''; // 当前运行上下文里的实际输出根（含日期子目录）
let collected: MessageArtifact[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-'));
  collected = [];
});

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 清理失败不影响断言 */
  }
});

/** 在当前输出根目录上下文里执行工具，收集登记的产物 */
function runTool(name: string, args: Record<string, any>): Promise<string> {
  return runWithAgentOutputDir(dir, () => {
    root = getAgentOutputDir(); // 解析为 总目录/年/月/日
    return executeTool(name, args, { onArtifact: (a) => collected.push(a) });
  }) as Promise<string>;
}

describe('文件工具登记产物', () => {
  it('create_file 成功后登记绝对路径、文件名与磁盘字节数', async () => {
    const content = '你好，世界'; // 5 个字符 / 15 字节：大小必须取磁盘字节数而不是字符数
    const result = await runTool('create_file', { filename: 'note.md', content });

    expect(result).toContain('文件创建成功');
    expect(collected).toHaveLength(1);
    expect(collected[0].name).toBe('note.md');
    expect(collected[0].path).toBe(path.join(root, 'note.md'));
    expect(fs.existsSync(collected[0].path)).toBe(true);
    expect(collected[0].size).toBe(Buffer.byteLength(content));
    expect(collected[0].kind).toBe('file');
    expect(collected[0].source).toBe('create_file');
  });

  it('write_file 覆盖已存在文件同样登记（覆盖也算本轮产物）', async () => {
    await runTool('create_file', { filename: 'a.txt', content: 'v1' });
    collected = [];
    const result = await runTool('write_file', { filename: 'a.txt', content: 'v2 覆盖后内容' });

    expect(result).toContain('文件已覆盖更新');
    expect(collected).toHaveLength(1);
    expect(collected[0].source).toBe('write_file');
    expect(collected[0].size).toBe(Buffer.byteLength('v2 覆盖后内容'));
  });

  it('append_file 成功后登记（大小是追加后的整体体积）', async () => {
    await runTool('create_file', { filename: 'log.txt', content: 'first\n' });
    collected = [];
    await runTool('append_file', { filename: 'log.txt', content: 'second\n' });

    expect(collected).toHaveLength(1);
    expect(collected[0].source).toBe('append_file');
    expect(collected[0].size).toBe(Buffer.byteLength('first\nsecond\n'));
  });

  it('create_file 因文件已存在而失败时不得登记（避免卡片指向没写入的文件）', async () => {
    await runTool('create_file', { filename: 'dup.txt', content: 'x' });
    collected = [];
    const result = await runTool('create_file', { filename: 'dup.txt', content: 'y' });

    expect(result).toContain('创建失败');
    expect(collected).toHaveLength(0);
  });

  it('写出输出根目录之外（Web 端）被拒时不登记', async () => {
    const outside = path.join(os.tmpdir(), `outside-${Date.now()}.txt`);
    const result = await runTool('write_file', { filename: outside, content: 'nope' });

    expect(result).toContain('拒绝');
    expect(collected).toHaveLength(0);
    expect(fs.existsSync(outside)).toBe(false);
  });
});
