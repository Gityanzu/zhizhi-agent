import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  runWithAgentOutputDir,
  setAgentOutputDir,
  getAgentOutputDir,
  getAgentOutputBaseDir,
  resolveChatOutputDir,
} from '../../src/services/agentOutput';
import { config } from '../../src/config';

const DIR_A = path.join(os.tmpdir(), 'zhizhi-out-a');
const DIR_B = path.join(os.tmpdir(), 'zhizhi-out-b');

describe('agentOutput 请求级隔离（总目录）', () => {
  afterEach(() => setAgentOutputDir(null));

  it('无任何覆盖时回退到 config 默认目录', () => {
    expect(getAgentOutputBaseDir()).toBe(config.agent.outputDir);
    expect(getAgentOutputDir()).toBe(config.agent.outputDir);
  });

  it('runWithAgentOutputDir 在调用链内生效', () => {
    expect(runWithAgentOutputDir(DIR_A, () => getAgentOutputBaseDir())).toBe(path.resolve(DIR_A));
  });

  it('链外不受影响，不会把目录泄漏给其它调用', () => {
    runWithAgentOutputDir(DIR_A, () => getAgentOutputBaseDir());
    expect(getAgentOutputBaseDir()).toBe(config.agent.outputDir);
  });

  it('异步链内同样生效（后台任务靠这个继承）', async () => {
    const seen = await runWithAgentOutputDir(DIR_A, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return getAgentOutputBaseDir();
    });
    expect(seen).toBe(path.resolve(DIR_A));
  });

  it('并发调用各自隔离，互不串目录', async () => {
    const seen: string[] = [];
    await Promise.all([
      runWithAgentOutputDir(DIR_A, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(getAgentOutputBaseDir());
      }),
      runWithAgentOutputDir(DIR_B, async () => {
        await new Promise((r) => setTimeout(r, 1));
        seen.push(getAgentOutputBaseDir());
      }),
    ]);
    expect(seen.sort()).toEqual([path.resolve(DIR_A), path.resolve(DIR_B)].sort());
  });

  it('请求级目录优先于全局覆盖，且全局覆盖不被污染', () => {
    setAgentOutputDir(DIR_B);
    expect(runWithAgentOutputDir(DIR_A, () => getAgentOutputBaseDir())).toBe(path.resolve(DIR_A));
    expect(getAgentOutputBaseDir()).toBe(path.resolve(DIR_B));
  });

  it('传空目录时回退到全局默认（清除用户设置后的行为）', () => {
    setAgentOutputDir(DIR_B);
    expect(runWithAgentOutputDir(undefined, () => getAgentOutputBaseDir())).toBe(path.resolve(DIR_B));
  });
});

describe('agentOutput 会话聊天产物目录', () => {
  afterEach(() => setAgentOutputDir(null));

  it('resolveChatOutputDir 生成 总目录/chats/YYYY-MM-DD', () => {
    const base = path.join(os.tmpdir(), 'zhizhi-chat-root');
    const dir = resolveChatOutputDir(base, '2026-10-15T08:30:00.000Z');
    expect(dir).toBe(path.join(base, 'chats', '2026-10-15'));
  });

  it('缺省 createdAt 时使用当天日期', () => {
    const base = path.join(os.tmpdir(), 'zhizhi-chat-root-default');
    const now = new Date();
    const dir = resolveChatOutputDir(base);
    const expected = path.join(
      base,
      'chats',
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    );
    expect(dir).toBe(expected);
  });

  it('已存在的目录不会重复创建（幂等）', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'zhizhi-chat-'));
    const dir1 = resolveChatOutputDir(base, '2026-10-15');
    expect(fs.existsSync(dir1)).toBe(true);
    const dir2 = resolveChatOutputDir(base, '2026-10-15');
    expect(dir2).toBe(dir1);
  });

  it('runWithAgentOutputDir 可将会话日期目录设为当前输出根', () => {
    const sessionDir = path.join(DIR_A, 'chats', '2026-10-15');
    expect(runWithAgentOutputDir(sessionDir, () => getAgentOutputDir())).toBe(sessionDir);
  });
});
