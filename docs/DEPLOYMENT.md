# 🚀 部署指南 - 认证系统安全增强

**部署日期**: 2026年9月17日
**适用版本**: v1.0

---

## 📋 部署前检查清单

### 必需项
- [ ] 代码已更新
- [ ] 数据库迁移已运行
- [ ] 环境变量已配置
- [ ] 测试已完成
- [ ] 文档已阅读

### 推荐项
- [ ] Code Review完成
- [ ] 安全审查完成
- [ ] 性能测试完成
- [ ] 备份完成

---

## 🎯 部署步骤

### 步骤1: 备份现有数据

**重要**：在部署前务必备份！

```bash
# 备份数据库
pg_dump zhizhi_agent > backup_$(date +%Y%m%d_%H%M%S).sql

# 备份配置文件
cp .env .env.backup
cp server/data/agents.json server/data/agents.json.backup
```

---

### 步骤2: 配置环境变量

创建 `.env` 文件（参考 `.env.example`）：

```bash
# ==================== JWT配置 ====================
# ⚠️ 生成强随机字符串，至少32个字符
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# ==================== 邮件服务配置 ====================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Gmail需要应用专用密码
EMAIL_FROM=noreply@yourdomain.com

# ==================== 前端URL ====================
# ⚠️ 生产环境必须是实际域名，不要使用 localhost
FRONTEND_URL=https://yourdomain.com

# ==================== 数据库配置 ====================
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=zhizhi_agent
PG_USER=postgres
PG_PASSWORD=your-database-password

# ==================== 其他配置 ====================
NODE_ENV=production
```

**重要说明**:
1. **JWT_SECRET** - 必须使用强随机字符串，建议使用以下命令生成：
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **SMTP_PASS** - Gmail需要配置应用专用密码：
   - 访问 https://myaccount.google.com/apppasswords
   - 选择"邮件"和"其他设备"
   - 生成并复制密码

3. **FRONTEND_URL** - 生产环境必须是实际域名，不要使用 localhost

---

### 步骤3: 运行数据库迁移

```bash
cd server

# 运行迁移
node --esm scripts/migrate-auth-security.js

# 验证迁移结果
psql -U postgres -d zhizhi_agent -c "\dt"

# 应该看到：
#                    List of relations
#  Schema |       Name        | Type  |  Owner
# --------+-------------------+-------+---------
#  public | api_key_usage_log | table | postgres
#  public | audit_logs        | table | postgres
#  public | ip_blacklist      | table | postgres
#  public | login_logs        | table | postgres
#  public | password_resets   | table | postgres
#  public | user_devices      | table | postgres
#  public | user_invites      | table | postgres
#  public | users             | table | postgres
```

**注意**: 如果迁移失败，检查：
- 数据库连接是否正常
- 用户是否有足够权限
- 是否有冲突的表

---

### 步骤4: 安装依赖（如果需要）

```bash
cd server
npm install
cd ../client
npm install
```

---

### 步骤5: 构建前端（生产环境）

```bash
cd client
npm run build
```

构建产物在 `client/dist/` 目录。

---

### 步骤6: 配置反向代理（推荐）

使用Nginx作为反向代理：

```nginx
# /etc/nginx/sites-available/zhizhi-agent

upstream zhizhi_agent {
    server localhost:3000;
}

server {
    listen 80;
    server_name yourdomain.com;

    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL证书配置
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # SSL优化配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 日志配置
    access_log /var/log/nginx/zhizhi_agent.access.log;
    error_log /var/log/nginx/zhizhi_agent.error.log;

    # 前端静态文件
    location / {
        root /path/to/client/dist;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "public, max-age=3600";
    }

    # API代理
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 重定向到前端
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/zhizhi-agent /etc/nginx/sites-enabled/
sudo nginx -t  # 测试配置
sudo systemctl reload nginx
```

---

### 步骤7: 启动服务

**方式1: 使用PM2（推荐）**

```bash
# 安装PM2
npm install -g pm2

# 启动后端
cd server
pm2 start src/index.ts --name zhizhi-agent-backend

# 启动前端（如果使用Vite开发模式）
cd ../client
pm2 start "npm run dev" --name zhizhi-agent-frontend

# 设置开机自启
pm2 startup
pm2 save
```

**方式2: 使用Docker**

```bash
# 构建镜像
docker-compose build

# 启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f
```

**方式3: 使用PM2 + Nginx（生产推荐）**

```bash
# 启动后端服务（监听3000端口）
pm2 start src/index.ts --name zhizhi-agent

# Nginx代理到后端
# 见步骤6
```

---

### 步骤8: 配置防火墙

```bash
# UFW（Ubuntu）
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable

# 防火墙配置完成
```

---

### 步骤9: 验证部署

**测试API端点**：

```bash
# 测试注册（可选）
curl -X POST http://yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPass123!",
    "email": "test@example.com"
  }'

# 测试登录
curl -X POST http://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPass123!"
  }'
```

**测试前端**：

1. 访问 https://yourdomain.com
2. 测试登录页面
3. 测试密码找回功能
4. 测试密码修改功能

---

## 🔒 安全配置

### 1. 数据库安全

```sql
-- 限制数据库用户权限
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zhizhi_agent_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO zhizhi_agent_user;

-- 定期备份
pg_dump zhizhi_agent > backup_$(date +%Y%m%d).sql
```

### 2. SSH安全

```bash
# 修改SSH端口（可选）
# 编辑 /etc/ssh/sshd_config
Port 2222

# 禁用root登录
PermitRootLogin no

# 启用公钥认证
PubkeyAuthentication yes

# 重启SSH
systemctl restart sshd
```

### 3. SSL配置

使用Let's Encrypt免费证书：

```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d yourdomain.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 📊 监控和日志

### 1. 启用日志记录

```typescript
// server/src/index.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// 使用logger记录日志
logger.info('User logged in', { userId: user.id, username: user.username });
```

### 2. 设置日志轮转

```bash
# 安装logrotate
sudo apt install logrotate

# 创建配置文件
sudo nano /etc/logrotate.d/zhizhi-agent
```

配置内容：
```
/path/to/zhizhi-agent/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
    sharedscripts
    postrotate
        pm2 reload all
    endscript
}
```

---

## 🧪 测试清单

### 功能测试
- [ ] 登录功能正常
- [ ] 注册功能正常
- [ ] 密码找回功能正常
- [ ] 密码修改功能正常
- [ ] Token刷新功能正常
- [ ] 登出功能正常

### 安全测试
- [ ] 密码强度验证正常
- [ ] 密码哈希正常
- [ ] Token撤销正常
- [ ] SQL注入防护正常
- [ ] XSS防护正常

### 性能测试
- [ ] 登录响应时间 < 500ms
- [ ] 密码验证时间 < 100ms
- [ ] 页面加载时间 < 2s

---

## 🔄 更新流程

### 更新代码

```bash
# 1. 备份
git checkout .
git pull origin main
cp .env .env.backup

# 2. 数据库迁移（如果有）
cd server
node --esm scripts/migrate-auth-security.js

# 3. 重新构建
cd client
npm run build

# 4. 重启服务
pm2 restart zhizhi-agent-backend
pm2 restart zhizhi-agent-frontend
```

### 验证更新

```bash
# 检查日志
pm2 logs

# 测试功能
curl http://localhost:3000/api/auth/verify
```

---

## 🐛 故障排除

### 问题1: 数据库迁移失败

**症状**: 运行迁移时出错

**解决方案**:
```bash
# 检查数据库连接
psql -U postgres -d zhizhi_agent

# 检查权限
\l zhizhi_agent
\dn

# 重新迁移
cd server
node --esm scripts/migrate-auth-security.js --force
```

---

### 问题2: 邮件没有发送

**症状**: 密码重置邮件没有收到

**解决方案**:
```bash
# 1. 检查SMTP配置
cat .env | grep SMTP

# 2. 测试SMTP连接
telnet smtp.gmail.com 587

# 3. 查看后端日志
pm2 logs --lines 100

# 4. 验证邮箱地址
echo $SMTP_USER  # 必须是完整的邮箱地址
```

---

### 问题3: Token验证失败

**症状**: 登录后Token立即失效

**解决方案**:
```bash
# 1. 检查JWT_SECRET
cat .env | grep JWT_SECRET

# 2. 确保前后端使用相同的密钥
# 3. 重启服务
pm2 restart zhizhi-agent-backend

# 4. 检查时间同步
timedatectl
```

---

## 📞 技术支持

### 文档资源
- [快速开始指南](./quickstart-auth.md)
- [待办清单](./implementation-checklist.md)
- [故障排除](./quickstart-auth.md#故障排除)

### 相关文件
- **环境变量**: `.env`
- **数据库脚本**: `server/scripts/migrate-auth-security.js`
- **后端服务**: `server/src/services/`
- **API路由**: `server/src/routes/auth.ts`

---

## ✅ 部署完成检查

- [ ] 代码已更新
- [ ] 环境变量已配置
- [ ] 数据库迁移已运行
- [ ] 依赖已安装
- [ ] 前端已构建
- [ ] 反向代理已配置
- [ ] SSL证书已配置
- [ ] 防火墙已配置
- [ ] 服务已启动
- [ ] 功能已测试
- [ ] 日志已配置
- [ ] 监控已设置
- [ ] 备份策略已设置

---

**部署完成！** 🎉

**下一步**: 定期备份、监控日志、更新系统

---

**最后更新**: 2026年9月17日
**文档版本**: v1.0
**状态**: ✅ 完成
