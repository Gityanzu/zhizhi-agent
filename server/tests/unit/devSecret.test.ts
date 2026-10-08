/**
 * devSecret.ts 单元测试
 * 覆盖：环境变量优先、生产必须配置、开发期持久化密钥、边界（空字符串）
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveSecret } from '../../src/utils/devSecret';

const TAG = 'vitestsecret';
const FILE = path.join(process.cwd(), `.dev-${TAG}-secret`);
const origNodeEnv = process.env.NODE_ENV;

function removeFile() {
  try { fs.unlinkSync(FILE); } catch { /* ignore */ }
}

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
});

afterAll(() => {
  removeFile();
});

describe('resolveSecret', () => {
  it('优先使用环境变量（不落地文件）', () => {
    process.env.MY_SECRET_X = 'env-value';
    expect(resolveSecret('MY_SECRET_X', TAG)).toBe('env-value');
    delete process.env.MY_SECRET_X;
  });

  it('生产环境未配置应抛错（拒绝启动）', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MY_SECRET_Y;
    expect(() => resolveSecret('MY_SECRET_Y', TAG)).toThrow(/未配置/);
  });

  it('开发环境未配置时生成 64 位十六进制密钥并持久化（重启稳定）', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.MY_SECRET_Z;
    removeFile();

    const a = resolveSecret('MY_SECRET_Z', TAG);
    const b = resolveSecret('MY_SECRET_Z', TAG);

    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a); // 第二次读取文件中的同一密钥
    expect(fs.existsSync(FILE)).toBe(true);
  });

  it('边界：空字符串环境变量视为未配置（回退到生成）', () => {
    process.env.NODE_ENV = 'test';
    process.env.MY_SECRET_EMPTY = '';
    removeFile();

    const v = resolveSecret('MY_SECRET_EMPTY', TAG);
    expect(v).toMatch(/^[0-9a-f]{64}$/);

    delete process.env.MY_SECRET_EMPTY;
  });
});
