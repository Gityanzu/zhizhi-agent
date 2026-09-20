# 📖 快速参考卡片

**Agent Market - 认证系统**

---

## 🚀 快速开始

### 1分钟启动

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env 文件，填写配置

# 3. 运行数据库迁移
cd server
node --esm scripts/migrate-auth-security.js

# 4. 启动服务
npm run dev
```

访问: http://localhost:5173

---

## 📁 文件结构

```
zhizhi-agent/
├── server/
│   ├── src/
│   │   ├── services/
│   │   │   ├── passwordStrength.ts      ← 密码强度检查
│   │   │   ├── passwordReset.ts         ← 密码重置
│   │   │   ├── loginLogger.ts           ← 登录日志
│   │   │   └── tokenManager.ts          ← Token管理
│   │   ├── routes/
│   │   │   └── auth.ts                   ← 认证路由
│   │   └── middleware/
│   │       └── request-ip.ts             ← IP获取
│   ├── scripts/
│   │   └── migrate-auth-security.js      ← 数据库迁移
│   └── data/
│       └── agents.json
│
├── client/
│   ├── src/
│   │   ├── api/
│   │   │   └── auth.ts                   ← 认证API
│   │   ├── views/
│   │   │   ├── ChangePasswordView.vue    ← 修改密码
│   │   │   ├── ForgotPasswordView.vue    ← 忘记密码
│   │   │   └── ResetPasswordView.vue     ← 重置密码
│   │   └── router/
│   │       └── index.ts                  ← 路由配置
│   └── dist/
│
└── docs/
    ├── README.md                         ← 文档入口
    ├── quickstart-auth.md                ← 快速开始
    ├── implementation-checklist.md       ← 待办清单
    ├── PROJECT_DELIVERY.md               ← 交付报告
    ├── DEPLOYMENT.md                     ← 部署指南
    ├── PROJECT_COMPLETE.md               ← 完整总结
    └── FINAL_SUMMARY.md                  ← 最终总结
```

---

## 🎯 核心功能

### 密码找回
```
POST /auth/forgot-password
{
  "email": "user@example.com"
}
```

**步骤**:
1. 点击登录页"忘记密码？"
2. 输入邮箱
3. 检查邮箱，点击链接
4. 设置新密码

---

### 密码修改
```
PUT /auth/change-password
Authorization: Bearer <token>

{
  "oldPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

**步骤**:
1. 登录后进入设置
2. 点击"修改密码"
3. 输入当前和新密码
4. 系统自动验证强度

---

### Token刷新
```
POST /auth/refresh-token
{
  "refreshToken": "xxx"
}

// 响应
{
  "accessToken": "new-token",
  "expiresIn": 900  // 秒
}
```

**说明**:
- 访问Token 15分钟后过期
- 使用刷新Token自动获取新Token
- 无需重新登录

---

## 🔒 安全特性

### 密码安全
- ✅ scrypt哈希（16字节salt）
- ✅ 实时强度检查
- ✅ 密码历史检查
- ✅ 防常见模式

### Token安全
- ✅ JWT签名验证
- ✅ 双Token机制
- ✅ 15分钟访问Token
- ✅ 7天刷新Token
- ✅ Token撤销

### 日志安全
- ✅ 完整审计
- ✅ 可疑检测
- ✅ IP追踪

---

## 📊 API端点速查

### 密码管理
```
POST   /auth/forgot-password   # 请求重置
POST   /auth/reset-password     # 重置密码
PUT    /auth/change-password    # 修改密码
```

### Token管理
```
POST   /auth/refresh-token      # 刷新Token
POST   /auth/logout             # 登出
```

### 用户管理
```
GET    /auth/me/login-stats     # 登录统计
```

---

## 📖 快速查询

### 按功能查找

**密码找回**
→ `passwordReset.ts`
→ `/auth/forgot-password`
→ `ForgotPasswordView.vue`

**密码修改**
→ `passwordStrength.ts`
→ `/auth/change-password`
→ `ChangePasswordView.vue`

**Token刷新**
→ `tokenManager.ts`
→ `/auth/refresh-token`
→ 自动处理

**登录日志**
→ `loginLogger.ts`
→ `login_logs` 表
→ 可疑检测

### 按问题查找

**密码不匹配** → 检查新旧密码、密码强度
**Token过期** → 使用刷新Token
**邮件未收到** → 检查SMTP配置、垃圾邮件
**页面空白** → 检查浏览器控制台错误

---

## 🎯 环境变量速查

```bash
# 必需配置
JWT_SECRET=xxx                  # JWT密钥
SMTP_HOST=smtp.gmail.com        # SMTP服务器
SMTP_USER=your@email.com        # 邮箱
SMTP_PASS=xxx                   # 应用密码
FRONTEND_URL=http://localhost:5173  # 前端地址

# 可选配置
PG_HOST=localhost              # 数据库地址
PG_DATABASE=zhizhi_agent       # 数据库名
PG_USER=postgres               # 数据库用户
PG_PASSWORD=xxx                # 数据库密码
```

---

## 🐛 常见问题

### Q: 密码修改失败？
**A**: 检查：
- 当前密码是否正确
- 新密码强度是否足够
- 两次密码是否一致

### Q: Token刷新失败？
**A**: 检查：
- Token是否过期
- RefreshToken是否有效
- JWT_SECRET是否一致

### Q: 邮件没有收到？
**A**: 检查：
- SMTP配置是否正确
- 邮箱地址是否正确
- 垃圾邮件文件夹

---

## 📊 性能指标

| 操作 | 响应时间 | 说明 |
|------|---------|------|
| 密码验证 | < 100ms | scrypt算法 |
| 登录请求 | < 500ms | 数据库查询 |
| Token刷新 | < 200ms | JWT验证 |
| 页面加载 | < 2s | Vite优化 |

---

## 🎨 界面导航

```
登录页面 (/login)
├─ 登录
├─ 注册
└─ 忘记密码? → /forgot-password

设置页面 (/settings)
├─ 基本资料
├─ 偏好设置
├─ 修改密码 ← 新增
├─ 模型参数
├─ API Key
├─ 数据库连接
└─ 数据管理
```

---

## 📚 文档索引

### 新手必读
1. **快速开始指南** → [quickstart-auth.md](./quickstart-auth.md)
2. **待办清单** → [implementation-checklist.md](./implementation-checklist.md)

### 深入了解
3. **部署指南** → [DEPLOYMENT.md](./DEPLOYMENT.md)
4. **完成总结** → [PROJECT_COMPLETE.md](./PROJECT_COMPLETE.md)
5. **交付报告** → [PROJECT_DELIVERY.md](./PROJECT_DELIVERY.md)

---

## ✅ 检查清单

### 部署前
- [ ] 环境变量已配置
- [ ] 数据库迁移已运行
- [ ] SMTP已配置
- [ ] 服务已启动
- [ ] 功能已测试

### 运行中
- [ ] 日志正常记录
- [ ] Token正常工作
- [ ] 邮件正常发送
- [ ] 密码修改正常
- [ ] 页面正常显示

---

## 🎯 快速命令

```bash
# 运行迁移
cd server && node --esm scripts/migrate-auth-security.js

# 启动服务
npm run dev

# 测试登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'

# 查看日志
pm2 logs

# 重启服务
pm2 restart all

# 停止服务
pm2 stop all
```

---

## 📞 帮助资源

- **文档**: [docs/](./)
- **代码**: [server/src/](../server/src/)
- **API**: [server/src/routes/auth.ts](../server/src/routes/auth.ts)
- **前端**: [client/src/views/](../client/src/views/)

---

**最后更新**: 2026年9月17日
**版本**: v1.0
**状态**: ✅ 生产就绪

🎉 **快速参考完成！** 🎉
