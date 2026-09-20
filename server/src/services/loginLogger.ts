/**
 * 登录日志服务
 * 记录登录事件和用户行为
 */

import { query } from '../db';

export interface LoginLogParams {
  userId?: string;
  username: string;
  ipAddress: string;
  userAgent: string;
  location?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  platform?: string;
  browser?: string;
}

export interface UserAgentInfo {
  platform?: string;
  browser?: string;
  os?: string;
  deviceType?: string;
}

/**
 * 记录登录事件
 * @param params - 登录日志参数
 */
export async function logLoginEvent(params: LoginLogParams): Promise<void> {
  try {
    // 解析User-Agent
    const userAgentInfo = parseUserAgent(params.userAgent);

    await query(
      `INSERT INTO login_logs
       (user_id, username, ip_address, user_agent, location, status, error_message,
        device_id, device_name, device_type, platform, browser, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
      [
        params.userId || null,
        params.username,
        params.ipAddress,
        params.userAgent,
        params.location || null,
        params.status,
        params.errorMessage || null,
        params.deviceId || null,
        params.deviceName || null,
        params.deviceType || null,
        userAgentInfo.platform || null,
        userAgentInfo.browser || null
      ]
    );
  } catch (error) {
    console.error('记录登录日志失败:', error);
  }
}

/**
 * 解析User-Agent
 * @param userAgent - User-Agent字符串
 * @returns 解析信息
 */
export function parseUserAgent(userAgent: string): UserAgentInfo {
  const ua = userAgent.toLowerCase();

  let platform = 'unknown';
  let browser = 'unknown';
  let os = 'unknown';
  let deviceType = 'desktop';

  // 平台检测
  if (ua.includes('windows')) {
    platform = 'windows';
    os = 'Windows';
  } else if (ua.includes('mac')) {
    platform = 'mac';
    os = 'macOS';
  } else if (ua.includes('linux')) {
    platform = 'linux';
    os = 'Linux';
  } else if (ua.includes('android')) {
    platform = 'android';
    os = 'Android';
    deviceType = 'mobile';
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    platform = 'ios';
    os = 'iOS';
    deviceType = 'mobile';
  }

  // 浏览器检测
  if (ua.includes('chrome') && !ua.includes('edg')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('edge') || ua.includes('edg')) {
    browser = 'Edge';
  } else if (ua.includes('opera') || ua.includes('opr')) {
    browser = 'Opera';
  }

  // 设备类型检测
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    deviceType = 'mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    deviceType = 'tablet';
  }

  return {
    platform,
    browser,
    os,
    deviceType
  };
}

/**
 * 获取IP地理位置
 * @param ipAddress - IP地址
 * @returns 地理位置
 */
export async function getIpLocation(ipAddress: string): Promise<string> {
  try {
    const response = await fetch(`https://ipapi.co/${ipAddress}/city/`);
    const data = await response.json();
    return `${data.city}, ${data.country_name}`;
  } catch {
    return '未知';
  }
}

/**
 * 检测可疑登录
 * @param username - 用户名
 * @param ipAddress - IP地址
 * @returns 是否可疑
 */
export async function detectAnomalousLogin(
  username: string,
  ipAddress: string
): Promise<{ isSuspicious: boolean; reason: string; severity: 'low' | 'medium' | 'high' }> {
  const now = Date.now();
  const hourAgo = now - 3600000; // 1小时内

  // 检查1: 短时间内多次登录失败
  const failedLogs = await query(
    `SELECT COUNT(*) as count
     FROM login_logs
     WHERE username = $1
       AND ip_address = $2
       AND created_at > $3
       AND status = 'failed'`,
    [username, ipAddress, new Date(hourAgo)]
  );

  if (failedLogs.rows[0].count >= 5) {
    return {
      isSuspicious: true,
      reason: '短时间内多次登录失败',
      severity: 'high'
    };
  }

  // 检查2: IP地址在黑名单
  const blacklistResult = await query(
    `SELECT 1 FROM ip_blacklist WHERE ip_address = $1 AND expires_at > NOW()`,
    [ipAddress]
  );

  if (blacklistResult.rows.length > 0) {
    return {
      isSuspicious: true,
      reason: 'IP地址在黑名单中',
      severity: 'high'
    };
  }

  // 检查3: 同一IP大量成功登录
  const successLogs = await query(
    `SELECT COUNT(*) as count
     FROM login_logs
     WHERE username = $1
       AND ip_address = $2
       AND created_at > $3
       AND status = 'success'`,
    [username, ipAddress, new Date(hourAgo)]
  );

  if (successLogs.rows[0].count >= 10) {
    return {
      isSuspicious: true,
      reason: '同一IP短时间内多次登录',
      severity: 'medium'
    };
  }

  return {
    isSuspicious: false,
    reason: '',
    severity: 'low'
  };
}

/**
 * 获取用户最近的登录日志
 * @param userId - 用户ID
 * @param limit - 返回数量限制
 * @returns 登录日志列表
 */
export async function getUserLoginLogs(userId: string, limit: number = 10): Promise<any[]> {
  const result = await query(
    `SELECT * FROM login_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/**
 * 获取指定时间范围内的登录日志
 * @param startDate - 开始日期
 * @param endDate - 结束日期
 * @param status - 登录状态
 * @returns 登录日志列表
 */
export async function getLoginLogsByTimeRange(
  startDate: Date,
  endDate: Date,
  status?: string
): Promise<any[]> {
  let queryText = `
    SELECT * FROM login_logs
    WHERE created_at >= $1 AND created_at <= $2
  `;

  const params = [startDate, endDate];
  let paramIndex = 3;

  if (status) {
    queryText += ` AND status = $${paramIndex}`;
    params.push(status);
  }

  queryText += ` ORDER BY created_at DESC`;

  const result = await query(queryText, params);
  return result.rows;
}

/**
 * 获取失败的登录尝试
 * @param userId - 用户ID
 * @param hours - 查询时间范围（小时）
 * @returns 失败的登录尝试
 */
export async function getFailedLoginAttempts(userId: string, hours: number = 24): Promise<any[]> {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  const result = await query(
    `SELECT * FROM login_logs
     WHERE user_id = $1 AND status = 'failed' AND created_at >= $2
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId, startTime]
  );

  return result.rows;
}

/**
 * 获取IP地址统计
 * @param hours - 查询时间范围（小时）
 * @returns IP统计
 */
export async function getIpStatistics(hours: number = 24): Promise<any[]> {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  const result = await query(
    `SELECT
       ip_address,
       COUNT(*) as attempt_count,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
       JSON_AGG(DISTINCT username ORDER BY created_at DESC) as users
     FROM login_logs
     WHERE created_at >= $1
     GROUP BY ip_address
     ORDER BY attempt_count DESC
     LIMIT 50`,
    [startTime]
  );

  return result.rows;
}
