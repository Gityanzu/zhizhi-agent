/**
 * IP地址获取中间件
 * 从请求中提取IP地址
 */

/**
 * 获取客户端IP地址
 * @param req - Express请求对象
 * @returns IP地址
 */
export function getUserIp(req: any): string {
  // 从Header中获取真实IP
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for 可能包含多个IP，取第一个
    const ips = Array.isArray(forwarded) ? forwarded : forwarded.split(',');
    return ips[0].trim();
  }

  // 从Proxy-Client-IP获取
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'] as string;
  }

  // 从Connection获取
  if (req.headers['x-client-ip']) {
    return req.headers['x-client-ip'] as string;
  }

  // 从Socket获取
  if (req.socket && req.socket.remoteAddress) {
    // 移除IPv6的 ::ffff: 前缀
    const ip = req.socket.remoteAddress;
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }

  return 'unknown';
}
