import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * 解析敏感密钥：
 * - 优先使用环境变量（生产必须配置）；
 * - 生产环境未配置则直接启动失败；
 * - 开发环境未配置时生成本机持久化密钥（写入 .dev-<tag>-secret），
 *   避免每次热重载/重启都使 Token 失效或无法解密已存凭据。
 * 该文件不纳入版本库（见 .gitignore）。
 */
export function resolveSecret(envName: string, fileTag: string): string {
  const env = process.env[envName];
  if (env) return env;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envName} 未配置：生产环境禁止启动`);
  }
  const f = path.join(process.cwd(), `.dev-${fileTag}-secret`);
  try {
    // 已存在则顺手收紧权限（兼容此前以默认权限创建的密钥文件）
    try { fs.chmodSync(f, 0o600); } catch { /* ignore */ }
    return fs.readFileSync(f, 'utf-8').trim();
  } catch {
    const k = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(f, k, { mode: 0o600 });
    } catch {
      // 写入失败则回退为本次进程内随机密钥
    }
    return k;
  }
}
