/**
 * 邮件发送服务
 * 支持 SMTP 协议，提供邮箱验证、密码重置等功能
 */

import nodemailer, { Transporter } from 'nodemailer';
import { query } from '../db';

// 邮件配置
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

let transporter: Transporter | null = null;
let emailConfig: EmailConfig | null = null;

// 初始化邮件传输器
export function initEmailService(): boolean {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || '智知 <noreply@zhizhi.ai>';

  if (!host || !user || !pass) {
    console.warn('⚠️  邮件服务未配置，将使用模拟模式');
    console.warn('   请在 .env 中配置 SMTP_HOST, SMTP_USER, SMTP_PASS');
    return false;
  }

  emailConfig = {
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    from,
  };

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  // 测试连接
  transporter.verify((error: Error | null) => {
    if (error) {
      console.warn('⚠️  SMTP 连接失败:', error.message);
    } else {
      console.log('✅ 邮件服务已就绪');
    }
  });

  return true;
}

// 生成验证码
export function generateVerificationCode(length: number = 6): string {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 发送邮件
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!transporter) {
    // 模拟模式：只打印到控制台
    console.log(`\n📧 [模拟邮件]`);
    console.log(`   收件人：${to}`);
    console.log(`   主题：${subject}`);
    console.log(`   内容：${html.substring(0, 100)}...\n`);
    return true;
  }

  try {
    await transporter.sendMail({
      from: emailConfig!.from,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error('❌ 邮件发送失败:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

// 发送邮箱验证码（注册/验证）
export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  const subject = '【智知】邮箱验证';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>邮箱验证</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">智知 - 邮箱验证</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">您好，</p>
          <p style="font-size: 16px; margin-bottom: 20px;">感谢您注册智知！请使用以下验证码完成邮箱验证：</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <span style="display: inline-block; background: #667eea; color: white; font-size: 32px; font-weight: bold; padding: 15px 30px; border-radius: 8px; letter-spacing: 5px;">
              ${code}
            </span>
          </div>
          
          <p style="font-size: 14px; color: #666; margin-bottom: 20px;">
            此验证码<strong>5 分钟</strong>内有效，请勿泄露给他人。
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="font-size: 12px; color: #999;">
            如果您没有注册智知，请忽略此邮件。<br>
            © 2026 智知。All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
}

// 发送密码重置邮件
export async function sendPasswordResetEmail(email: string, code: string, resetUrl: string): Promise<boolean> {
  const subject = '【智知】密码重置请求';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>密码重置</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">密码重置</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">您好，</p>
          <p style="font-size: 16px; margin-bottom: 20px;">我们收到了您的密码重置请求。请点击下方按钮重置密码：</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: #f093fb; color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: bold;">
              重置密码
            </a>
          </div>
          
          <p style="font-size: 14px; color: #666; margin-bottom: 20px;">
            或者复制以下链接到浏览器：<br>
            <a href="${resetUrl}" style="color: #667eea;">${resetUrl}</a>
          </p>
          
          <p style="font-size: 14px; color: #666; margin-bottom: 20px;">
            验证码（备用）：<strong>${code}</strong><br>
            此链接和验证码<strong>1 小时</strong>内有效。
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
            <strong>安全提示：</strong>
          </p>
          <ul style="font-size: 14px; color: #666;">
            <li>如果您没有请求重置密码，请忽略此邮件</li>
            <li>不要将验证码分享给任何人</li>
            <li>检查发件人邮箱是否为官方地址</li>
          </ul>
          
          <p style="font-size: 12px; color: #999; margin-top: 30px;">
            © 2026 智知。All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
}

// 发送欢迎邮件
export async function sendWelcomeEmail(email: string, username: string): Promise<void> {
  const subject = '【智知】欢迎加入！';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>欢迎加入智知</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🎉 欢迎加入智知！</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">亲爱的 ${username}，</p>
          <p style="font-size: 16px; margin-bottom: 20px;">欢迎您成为智知的用户！现在可以开始体验以下功能：</p>
          
          <ul style="font-size: 16px; color: #333; margin-bottom: 30px;">
            <li>🤖 AI Agent 智能对话</li>
            <li>📚 知识库问答</li>
            <li>🔧 工具调用与自动化</li>
            <li>🎯 多 Agent 协作</li>
            <li>📊 数据分析与可视化</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:5173" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: bold;">
              立即开始使用
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="font-size: 12px; color: #999;">
            © 2026 智知。All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail(email, subject, html);
}

export default {
  initEmailService,
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
};
