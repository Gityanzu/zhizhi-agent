/**
 * ssrfGuard.ts 单元测试（出站 URL 沙箱）
 * 覆盖：协议白名单、内网/回环/元数据地址拦截、边界值
 * 注：域名类用例依赖 DNS，此处只覆盖字面 IP 与协议（可离线稳定运行）
 */
import { describe, it, expect } from 'vitest';
import { assertSafeUrl, isPrivateAddress } from '../../src/utils/ssrfGuard';

describe('isPrivateAddress', () => {
  it('识别 IPv4 内网/回环/链路本地/保留段', () => {
    for (const ip of [
      '0.0.0.0', '10.0.0.1', '10.255.255.255', '127.0.0.1',
      '169.254.169.254', '172.16.0.1', '172.31.255.255',
      '192.168.1.1', '100.64.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('公网 IPv4 不应判为内网（含 172 段边界）', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '192.169.0.1', '11.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('识别 IPv6 回环/链路本地/唯一本地', () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1', 'fd12::34']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false);
  });
});

describe('assertSafeUrl 协议白名单', () => {
  it('拒绝非 http(s) 协议（file/data/ftp/gopher）', async () => {
    for (const url of ['file:///etc/passwd', 'data:text/plain,hi', 'ftp://example.com/a', 'gopher://x/1']) {
      const r = await assertSafeUrl(url);
      expect(r.ok, url).toBe(false);
      expect(r.reason).toContain('仅允许 http/https');
    }
  });

  it('非法 URL 字符串被拒绝', async () => {
    const r = await assertSafeUrl('not a url');
    expect(r.ok).toBe(false);
  });
});

describe('assertSafeUrl 内网拦截', () => {
  it('拒绝回环/内网/元数据地址', async () => {
    for (const url of [
      'http://127.0.0.1:3001/api/health',
      'http://localhost/admin',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://[::1]:8080/',
    ]) {
      const r = await assertSafeUrl(url);
      expect(r.ok, url).toBe(false);
    }
  });

  it('允许公网字面 IP（无需 DNS）', async () => {
    const r = await assertSafeUrl('https://8.8.8.8/dns-query');
    expect(r.ok).toBe(true);
  });
});
