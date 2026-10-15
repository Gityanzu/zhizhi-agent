import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { register, login, getUserById, updateProfile, changePassword, getUserLoginStats, logAuditEvent } from '../services/auth';
import { requestPasswordReset, resetPassword } from '../services/passwordReset';
import { refreshToken, logout, isTokenBlacklisted } from '../services/tokenManager';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logLoginEvent } from '../services/loginLogger';

// 头像上传：内存存储（图片小，直接 buffer 写盘），5MB 上限
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    if (!ok) cb(new Error('仅支持 jpg/png/webp/gif 格式'));
    else cb(null, true);
  },
});
import { detectAnomalousLogin } from '../services/loginLogger';
import { getUserIp } from '../middleware/request-ip';

const router = Router();

// 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: '用户名至少3个字符' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少8个字符' });
    }

    const result = await register(username, password, email);

    // 记录登录日志
    await logLoginEvent({
      userId: result.user.id,
      username: result.user.username,
      ipAddress: getUserIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      status: 'success'
    });

    res.json({
      user: result.user,
      token: result.token,
      message: '注册成功'
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || '注册失败' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        error: '用户名和密码不能为空',
        details: {
          hasUsername: !!username,
          hasPassword: !!password
        }
      });
    }

    console.log(`🔐 用户登录尝试：${username}`);
    const result = await login(username, password);
    console.log(`✅ 登录成功：${username}`);

    // 检测异常登录
    const anomalous = await detectAnomalousLogin(result.user.username, getUserIp(req));

    // 记录登录日志
    await logLoginEvent({
      userId: result.user.id,
      username: result.user.username,
      ipAddress: getUserIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      status: 'success',
      deviceName: req.headers['user-agent'] || 'unknown'
    });

    if (anomalous.isSuspicious) {
      console.warn(`⚠️ 检测到可疑登录：${anomalous.reason}`);
      // 可以发送警报通知管理员
    }

    res.json({
      user: result.user,
      token: result.token,
      message: '登录成功'
    });
  } catch (error: any) {
    // 记录失败的登录尝试
    const { getUserIp } = await import('../middleware/request-ip');
    await logLoginEvent({
      username: req.body.username || 'unknown',
      ipAddress: getUserIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      status: 'failed',
      errorMessage: error.message
    });

    res.status(401).json({ error: error.message || '登录失败' });
  }
});

// 获取当前用户信息
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 获取登录统计
    const loginStats = await getUserLoginStats(req.userId!);

    res.json({
      user: {
        ...user,
        loginStats
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '获取用户信息失败' });
  }
});

// 更新用户资料（昵称/邮箱/简介/头像URL）
router.put('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { nickname, avatar, email, bio } = req.body;
    // 长度校验（bio 对应 VARCHAR(200)）
    if (bio !== undefined && bio && String(bio).length > 200) {
      return res.status(400).json({ error: '简介不能超过 200 字' });
    }
    const user = await updateProfile(req.userId!, { nickname, avatar, email, bio });

    // 记录审计日志
    await logAuditEvent({
      userId: req.userId,
      username: req.username,
      action: 'profile_update',
      resourceType: 'user',
      resourceId: req.userId,
      ipAddress: getUserIp(req),
      details: { fields: Object.keys(req.body) }
    });

    res.json({ user, message: '更新成功' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || '更新失败' });
  }
});

// ==================== 头像上传 ====================

const AVATAR_DIR = path.join(config.upload.dir, 'avatars');
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}
const AVATAR_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const AVATAR_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
// 供 <img> 直接访问的本地头像 URL（文件名不可猜：userId+时间戳）
const AVATAR_URL_PREFIX = '/api/avatars/';
const AVATAR_FILENAME_RE = /^avatar-[0-9a-f-]{36}-\d+\.(jpg|png|webp|gif)$/;

/**
 * 跨部署形态的头像目录解析：
 * 上传落在「当前形态」的 uploads/avatars（Web 开发态 = 仓库 server/data；桌面端 = userData），
 * 之后切换形态（Web ↔ 桌面）时文件还在原地 —— 只查当前目录就会 404。
 * 因此：GET 多目录查找 + 启动时把其它目录的历史头像迁移补齐到当前目录。
 */
const AVATAR_FALLBACK_DIRS: string[] = [];
if (process.env.ZHI_USER_DATA) {
  // 桌面端：补查仓库目录（Web 开发态曾用）
  AVATAR_FALLBACK_DIRS.push(path.resolve(__dirname, '../../data/uploads/avatars'));
}

// 启动迁移：把回退目录里当前目录缺失的头像复制过来（一次性，幂等）
let avatarMigrated = 0;
for (const dir of AVATAR_FALLBACK_DIRS) {
  try {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!AVATAR_FILENAME_RE.test(f)) continue;
      const dest = path.join(AVATAR_DIR, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(dir, f), dest);
        avatarMigrated++;
      }
    }
  } catch (e) {
    console.warn('[avatar] 迁移历史头像失败:', e);
  }
}
if (avatarMigrated > 0) console.log(`[avatar] 已从历史目录迁移 ${avatarMigrated} 个头像文件`);

/** 在全部候选目录中查找头像文件；找不到返回 null */
function findAvatarFile(filename: string): string | null {
  const candidates = [path.join(AVATAR_DIR, filename)];
  for (const dir of AVATAR_FALLBACK_DIRS) {
    candidates.push(path.join(dir, filename));
  }
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* 忽略权限等异常，继续找 */ }
  }
  return null;
}

// 兜底头像：文件丢失/未上传时返回内联 SVG（灰色人形占位），避免 <img> 破图
const AVATAR_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="32" fill="#e5e7eb"/>
<circle cx="32" cy="25" r="11" fill="#9ca3af"/>
<path d="M12 55c2-12 10-18 20-18s18 6 20 18" fill="#9ca3af"/>
</svg>`;

/** 删除旧的本地头像文件（仅清理本服务管理的头像目录，外部 URL 不动） */
function removeOldLocalAvatar(avatarUrl?: string | null): void {
  if (!avatarUrl || !avatarUrl.startsWith(AVATAR_URL_PREFIX)) return;
  const filename = path.basename(avatarUrl);
  if (!AVATAR_FILENAME_RE.test(filename)) return;
  const filePath = path.join(AVATAR_DIR, filename);
  try { fs.unlinkSync(filePath); } catch { /* 不存在/占用则忽略 */ }
}

// 上传头像（multipart，jpg/png/webp/gif ≤5MB；替换时清理旧文件）
router.post('/avatar', requireAuth, uploadAvatar.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择头像图片' });
    const ext = AVATAR_MIME_EXT[req.file.mimetype];
    if (!ext) {
      return res.status(400).json({ error: '仅支持 jpg/png/webp/gif 格式' });
    }

    // 先取旧头像（用于替换后清理）
    const oldUser = await getUserById(req.userId!);
    const oldAvatar = oldUser?.avatar || '';

    const filename = `avatar-${req.userId}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, filename), req.file.buffer);

    const url = `${AVATAR_URL_PREFIX}${filename}`;
    const user = await updateProfile(req.userId!, { avatar: url });

    // 成功入库后再清理旧文件（避免先删后写失败导致头像丢失）
    if (oldAvatar && oldAvatar !== url) removeOldLocalAvatar(oldAvatar);

    await logAuditEvent({
      userId: req.userId,
      username: req.username,
      action: 'avatar_update',
      resourceType: 'user',
      resourceId: req.userId,
      ipAddress: getUserIp(req),
      details: { filename }
    });

    res.json({ user, message: '头像已更新' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || '头像上传失败' });
  }
});

// 清除头像（恢复默认图标）
router.delete('/avatar', requireAuth, async (req: AuthRequest, res) => {
  try {
    const oldUser = await getUserById(req.userId!);
    const user = await updateProfile(req.userId!, { avatar: '' });
    removeOldLocalAvatar(oldUser?.avatar || '');
    res.json({ user, message: '头像已清除' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || '清除头像失败' });
  }
});

// 头像文件访问：<img> 无法携带 Authorization，走文件名不可猜 + 白名单校验的公开只读。
// 挂载点：/api/avatars（DB 里存的就是这个前缀）+ /api/auth/avatars（兼容）。
// 多目录查找（Web/桌面形态切换后文件可能留在另一侧）；彻底找不到时返回默认 SVG 占位而非 404，避免破图。
export const avatarsRouter = Router();
avatarsRouter.get('/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  // 白名单校验：阻断路径穿越与任意文件读取
  if (!AVATAR_FILENAME_RE.test(filename)) {
    return res.status(404).json({ error: '头像不存在' });
  }
  const filePath = findAvatarFile(filename);
  if (!filePath) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=60'); // 短缓存：文件修复后能尽快恢复真头像
    return res.send(AVATAR_FALLBACK_SVG);
  }
  const ext = path.extname(filename).slice(1);
  const mime: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 文件名含时间戳，可长缓存
  fs.createReadStream(filePath).pipe(res);
});
router.use('/avatars', avatarsRouter);

// 验证token有效性
router.get('/verify', requireAuth, (req: AuthRequest, res) => {
  res.json({
    valid: true,
    userId: req.userId,
    username: req.username
  });
});

// 请求密码重置
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' });
    }

    const result = await requestPasswordReset(email);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || '请求重置密码失败' });
  }
});

// 重置密码
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: '参数不完整' });
    }

    // 验证密码强度
    const { validatePasswordStrength } = await import('../services/passwordStrength');
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return res.status(400).json({
        error: '密码不符合强度要求',
        validation
      });
    }

    const result = await resetPassword(token, newPassword);

    if (result.success) {
      // 记录审计日志
      await logAuditEvent({
        action: 'password_reset',
        resourceType: 'user',
        ipAddress: getUserIp(req),
        details: { method: 'email_link' }
      });
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || '密码重置失败' });
  }
});

// 修改密码
router.put('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码不能为空' });
    }

    const result = await changePassword(req.userId!, oldPassword, newPassword);

    if (result.success) {
      // 记录审计日志
      await logAuditEvent({
        userId: req.userId,
        username: req.username,
        action: 'password_change',
        resourceType: 'user',
        resourceId: req.userId,
        ipAddress: getUserIp(req),
        details: { reason: 'user_changed_password' }
      });
    }

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || '密码修改失败' });
  }
});

// 刷新Token
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: '刷新令牌不能为空' });
    }

    // 检查是否在黑名单（必须 await，否则 Promise 恒为真值，导致刷新接口永远 401）
    if (await isTokenBlacklisted(refreshToken)) {
      return res.status(401).json({ error: '令牌已失效' });
    }

    const result = await refreshToken(refreshToken);

    if (!result) {
      return res.status(401).json({ error: '无效的刷新令牌' });
    }

    res.json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message || '刷新令牌失败' });
  }
});

// 登出
router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.substring(7);
      await logout(token);
    }

    // 清除客户端Cookie
    res.clearCookie('token');

    // 记录登出日志（登出属于成功事件，status 仅支持 success|failed）
    await logLoginEvent({
      userId: req.userId,
      username: req.username || 'unknown',
      ipAddress: getUserIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      status: 'success'
    });

    res.json({ message: '登出成功' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '登出失败' });
  }
});

// 获取当前用户登录统计
router.get('/me/login-stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const stats = await getUserLoginStats(req.userId!);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message || '获取登录统计失败' });
  }
});

export default router;
