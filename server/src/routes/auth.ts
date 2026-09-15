import { Router } from 'express';
import { register, login, getUserById, updateProfile } from '../services/auth';
import { requireAuth, AuthRequest } from '../middleware/auth';

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
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6个字符' });
    }

    const result = await register(username, password, email);
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
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const result = await login(username, password);
    res.json({
      user: result.user,
      token: result.token,
      message: '登录成功'
    });
  } catch (error: any) {
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
    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '获取用户信息失败' });
  }
});

// 更新用户资料
router.put('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { nickname, avatar, email } = req.body;
    const user = await updateProfile(req.userId!, { nickname, avatar, email });
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

export default router;
