/**
 * filePermission.ts 单元测试
 * 覆盖：路径解析（含 .. 穿越）、敏感清单、读/写 × 桌面/Web 的权限判定
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {
  resolveTarget,
  classify,
  isSensitive,
  getWorkspaceDir,
} from '../../src/services/filePermission';
import { setAgentOutputDir } from '../../src/services/agentOutput';
import { config } from '../../src/config';

const ROOT = path.join(os.tmpdir(), `zhizhi-fp-${Date.now()}`);
const WS = path.join(os.tmpdir(), `zhizhi-ws-${Date.now()}`);
const OUTSIDE = path.resolve(os.homedir(), 'zhizhi-outside.txt');

const origWorkspace = config.agent.workspaceDir;
const origAllowWeb = config.agent.allowWebWorkspace;

beforeAll(() => {
  setAgentOutputDir(ROOT); // 固定输出根，隔离环境
  config.agent.workspaceDir = '';
  config.agent.allowWebWorkspace = false;
});

afterAll(() => {
  config.agent.workspaceDir = origWorkspace;
  config.agent.allowWebWorkspace = origAllowWeb;
  setAgentOutputDir(null);
  for (const d of [ROOT, WS]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('resolveTarget', () => {
  it('相对路径应落在输出根内', () => {
    const t = resolveTarget('a/b.txt');
    expect(t.inRoot).toBe(true);
    expect(t.absPath).toBe(path.resolve(ROOT, 'a/b.txt'));
  });

  it('空路径解析为根目录本身，视为根内', () => {
    const t = resolveTarget('');
    expect(t.inRoot).toBe(true);
  });

  it('.. 穿越应被判为根外（inRoot=false）', () => {
    const t = resolveTarget('../outside.txt');
    expect(t.inRoot).toBe(false);
  });

  it('多级 .. 逃逸同样判为根外', () => {
    expect(resolveTarget('../../../../etc/passwd').inRoot).toBe(false);
  });

  it('绝对路径在根内/根外应正确区分', () => {
    expect(resolveTarget(path.join(ROOT, 'x.txt')).inRoot).toBe(true);
    expect(resolveTarget(OUTSIDE).inRoot).toBe(false);
  });

  it('未配置工作区时 inWorkspace 恒为 false', () => {
    expect(resolveTarget('a.txt').inWorkspace).toBe(false);
    expect(getWorkspaceDir()).toBeUndefined();
  });
});

describe('isSensitive', () => {
  it('命中 .env / .ssh / 私钥 / 证书等敏感清单', () => {
    expect(isSensitive('.env')).toBe(true);
    expect(isSensitive('.env.local')).toBe(true);
    expect(isSensitive(path.join(os.homedir(), '.ssh', 'id_rsa'))).toBe(true);
    expect(isSensitive('server.pem')).toBe(true);
    expect(isSensitive('deploy.key')).toBe(true);
    expect(isSensitive('cert.p12')).toBe(true);
  });

  it('普通文件不应被误判为敏感', () => {
    expect(isSensitive('notes.txt')).toBe(false);
    expect(isSensitive('src/index.ts')).toBe(false);
    expect(isSensitive('environment.md')).toBe(false); // 含 "env" 但非 .env
  });
});

describe('classify 权限判定', () => {
  const inRoot = resolveTarget('a.txt');
  const outRoot = resolveTarget('../x.txt');

  it('桌面端：根内读 allow，根外读 ask', () => {
    expect(classify('read', inRoot, true)).toBe('allow');
    expect(classify('read', outRoot, true)).toBe('ask');
  });

  it('Web 端：根内读 allow，根外读 deny（沙箱）', () => {
    expect(classify('read', inRoot, false)).toBe('allow');
    expect(classify('read', outRoot, false)).toBe('deny');
  });

  it('桌面端写：一律 ask（需 diff 审批）', () => {
    expect(classify('write', inRoot, true)).toBe('ask');
  });

  it('Web 端写：根内 allow，根外 deny', () => {
    expect(classify('write', inRoot, false)).toBe('allow');
    expect(classify('write', outRoot, false)).toBe('deny');
  });

  it('敏感文件优先级最高：即便根内也 deny（读/写、桌面/Web 均如此）', () => {
    const sensitive = resolveTarget('.env');
    expect(classify('read', sensitive, true)).toBe('deny');
    expect(classify('write', sensitive, true)).toBe('deny');
    expect(classify('read', sensitive, false)).toBe('deny');
    expect(classify('write', sensitive, false)).toBe('deny');
  });

  it('配置的工作区（桌面端）：读 allow，写 ask', () => {
    config.agent.workspaceDir = WS;
    const t = resolveTarget(path.join(WS, 'code.ts'));
    expect(t.inWorkspace).toBe(true);
    expect(classify('read', t, true)).toBe('allow');
    expect(classify('write', t, true)).toBe('ask');
    config.agent.workspaceDir = '';
  });

  it('Web 端默认不允许工作区（allowWebWorkspace=false）：工作区外→deny', () => {
    config.agent.workspaceDir = WS;
    const t = resolveTarget(path.join(WS, 'code.ts'));
    expect(classify('read', t, false)).toBe('deny');
    config.agent.workspaceDir = '';
  });
});
