/**
 * 密码重置服务
 * 处理密码找回和重置流程
 */

import { query } from '../db';
import crypto from 'crypto';

const PASSWORD_RESET_EXPIRY = 3600000; // 1小时

/**
 * 生成安全的重置令牌
 * @returns 令牌
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 发送密码重置邮件
 * @param email - 邮箱地址
 * @param username - 用户名
 * @param token - 重置令牌
 */
export async function sendPasswordResetEmail(
  email: string,
  username: string,
  token: string
): Promise<void> {
  // TODO: 集成邮件服务（Nodemailer, SendGrid, AWS SES等）
  // 这里只是占位符，实际实现需要配置SMTP服务器

  console.log('📧 密码重置邮件发送提醒：');
  console.log(`   收件人: ${email}`);
  console.log(`   用户名: ${username}`);
  console.log(`   重置链接: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`);
  console.log(`   过期时间: 1小时`);

  // 模拟邮件发送
  // await transporter.sendMail({
  //   from: process.env.EMAIL_FROM || 'noreply@zhizhi-agent.com',
  //   to: email,
  //   subject: '重置您的密码',
  //   html: `
  //     <h2>重置您的密码</h2>
  //     <p>您好，${username}！</p>
  //     <p>您收到了这封邮件，是因为您请求重置Agent Market的密码。</p>
  //     <p>如果您没有请求重置密码，请忽略此邮件。</p>
  //     <p style="margin-top: 20px;">
  //       <a href="${process.env.FRONTEND_URL}/reset-password?token=${token}"
  //          style="background-color: #3b82f6; color: white; padding: 10px 20px;
  //                 text-decoration: none; border-radius: 5px; display: inline-block;">
  //         点击这里重置密码
  //       </a>
  //     </p>
  //     <p style="margin-top: 20px; font-size: 12px; color: #999;">
  //       如果上述按钮无法点击，请复制以下链接到浏览器：
  //     </p>
  //     <p style="font-size: 12px; color: #666; word-break: break-all;">
  //       ${process.env.FRONTEND_URL}/reset-password?token=${token}
  //     </p>
  //     <p style="margin-top: 20px; font-size: 12px; color: #999;">
  //       此链接将在1小时后过期。
  //     </p>
  //   `
  // });
}

/**
 * 请求密码重置
 * @param email - 邮箱地址
 * @returns 是否成功
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  // 检查用户是否存在
  const userResult = await query(
    'SELECT id, username, email FROM users WHERE email = $1',
    [email]
  );

  // 即使邮箱不存在也返回成功消息（安全考虑）
  if (userResult.rows.length === 0) {
    return {
      success: true,
      message: '如果该邮箱已注册，您将收到重置密码的邮件'
    };
  }

  const user = userResult.rows[0];

  // 生成重置令牌
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY);

  // 清除之前的重置令牌（如果存在）
  await query(
    'DELETE FROM password_resets WHERE email = $1',
    [email]
  );

  // 保存重置令牌
  await query(
    'INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)',
    [email, token, expiresAt]
  );

  // 发送重置邮件
  await sendPasswordResetEmail(user.email, user.username, token);

  return {
    success: true,
    message: '如果该邮箱已注册，您将收到重置密码的邮件'
  };
}

/**
 * 验证重置令牌
 * @param token - 重置令牌
 * @returns 用户信息或null
 */
export async function verifyResetToken(token: string): Promise<{ email: string; username: string } | null> {
  const now = new Date();

  const result = await query(
    `SELECT email, username, expires_at, used
     FROM password_resets
     WHERE token = $1 AND expires_at > $2 AND used = FALSE
     LIMIT 1`,
    [token, now]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * 执行密码重置
 * @param token - 重置令牌
 * @param newPassword - 新密码
 * @returns 是否成功
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; message: string; error?: string }> {
  // 验证令牌
  const user = await verifyResetToken(token);
  if (!user) {
    return {
      success: false,
      message: '令牌无效或已过期',
      error: 'Invalid or expired token'
    };
  }

  // 验证密码强度
  const { validatePasswordStrength } = await import('./passwordStrength');
  const validation = validatePasswordStrength(newPassword);
  if (!validation.valid) {
    return {
      success: false,
      message: '新密码不符合强度要求',
      error: 'Password strength insufficient'
    };
  }

  // 生成密码哈希
  const passwordHash = hashPassword(newPassword);

  // 更新密码
  await query(
    `UPDATE users
     SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
     WHERE email = $2`,
    [passwordHash, user.email]
  );

  // 标记令牌为已使用
  await query(
    'UPDATE password_resets SET used = TRUE, used_at = NOW() WHERE token = $1',
    [token]
  );

  return {
    success: true,
    message: '密码重置成功，请使用新密码登录'
  };
}

/**
 * 密码哈希函数
 * @param password - 明文密码
 * @returns 哈希后的密码
 */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * 验证密码
 * @param password - 明文密码
 * @param storedHash - 存储的哈希
 * @returns 是否匹配
 */
function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

/**
 * 清理过期的重置令牌
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const result = await query(
    'DELETE FROM password_resets WHERE expires_at < NOW()'
  );
  console.log(`🗑️  清理了 ${result.rowCount} 个过期的重置令牌`);
}
