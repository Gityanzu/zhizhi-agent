/**
 * ssrfGuard.ts — 出站 URL 沙箱校验（防 SSRF）
 *
 * 规则：
 *   - 仅允许 http / https 协议（拒绝 file:/data:/gopher:/ftp: 等）
 *   - 禁止访问本机/内网/链路本地/云元数据地址（含 localhost 与 169.254.169.254）
 *   - 域名场景做 DNS 解析后再校验，防止域名指向内网（DNS rebinding 的常见形态）
 *
 * 说明：DNS 解析失败时按 fail-closed 拒绝，避免"解析不到就放行"的绕过。
 */
import * as net from 'net';
import * as dns from 'dns/promises';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
]);

/** 判断是否为内网/回环/链路本地/保留地址 */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map((n) => parseInt(n, 10));
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true; // 链路本地 + 云元数据 169.254.169.254
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (low.startsWith('fe80')) return true;              // 链路本地
    if (low.startsWith('fc') || low.startsWith('fd')) return true; // 唯一本地
    if (low.startsWith('::ffff:')) return isPrivateAddress(low.slice('::ffff:'.length));
    return false;
  }
  return false;
}

export interface UrlCheckResult {
  ok: boolean;
  reason?: string;
}

/** 校验出站 URL 是否安全 */
export async function assertSafeUrl(rawUrl: string): Promise<UrlCheckResult> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `URL 格式非法：${rawUrl}` };
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: `仅允许 http/https 协议，收到 ${u.protocol}` };
  }

  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `禁止访问本地/元数据主机：${host}` };
  }

  // 字面 IP：直接判定
  if (net.isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: `禁止访问内网/回环地址：${host}` }
      : { ok: true };
  }

  // 域名：解析后校验所有 A/AAAA 记录
  try {
    const addrs = await dns.lookup(host, { all: true });
    for (const a of addrs) {
      if (isPrivateAddress(a.address)) {
        return { ok: false, reason: `域名 ${host} 解析到内网地址 ${a.address}，已拒绝` };
      }
    }
  } catch {
    return { ok: false, reason: `域名解析失败，已安全拒绝：${host}` };
  }

  return { ok: true };
}
