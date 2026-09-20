import { Router } from 'express';
import { register, login, getUserById, updateProfile, changePassword, getUserLoginStats, logAuditEvent } from '../services/auth';
import { requestPasswordReset, resetPassword } from '../services/passwordReset';
import { refreshToken, logout, isTokenBlacklisted } from '../services/tokenManager';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logLoginEvent } from '../services/loginLogger';
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

// 更新用户资料
router.put('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { nickname, avatar, email } = req.body;
    const user = await updateProfile(req.userId!, { nickname, avatar, email });

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
