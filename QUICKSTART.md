# 🚀 Agent Market 快速启动指南

## 📋 快速开始

### 1. 克隆项目
```bash
git clone <repository-url>
cd zhizhi-agent
```

### 2. 安装依赖

**后端依赖：**
```bash
cd server
npm install
```

**前端依赖：**
```bash
cd client
npm install
```

### 3. 启动服务

**启动后端（默认端口3001）：**
```bash
cd server
npm run dev
```

**启动前端（默认端口5173）：**
```bash
cd client
npm run dev
```

### 4. 创建测试数据
```bash
cd server
npx tsx scripts/seedAgents.ts
```

---

## 🌐 访问地址

### 开发环境
- **前端应用**: http://localhost:5173
- **后端API**: http://localhost:3001
- **健康检查**: http://localhost:3001/api/health

---

## 📚 主要功能

### 1. 搜索Agent
访问 http://localhost:5173/search

**功能：**
- 全文搜索
- 分类筛选
- 标签筛选
- 多种排序
- 分页浏览

### 2. Agent详情
点击搜索结果进入详情页

**功能：**
- Agent信息展示
- 评分统计
- 评论列表
- 发表评论
- 点赞评论
- 评论回复
- 评分功能

### 3. 数据分析
访问 http://localhost:5173/analytics

**功能：**
- 数据汇总
- 最受欢迎Agent
- 分类统计
- 标签云

---

## 🔑 API端点速查

### 搜索
```
GET /api/agent-market/search
GET /api/agent-market/search/categories
GET /api/agent-market/search/tags
```

### 评论
```
POST /api/agent-market/comments/:id
GET /api/agent-market/comments/:id
DELETE /api/agent-market/comments/:id/:commentId
POST /api/agent-market/comments/:id/like
POST /api/agent-market/comments/:commentId/moderate
```

### 评分
```
POST /api/agent-market/ratings
GET /api/agent-market/ratings/:id/stats
```

### 统计
```
GET /api/agent-market/analytics/summary
GET /api/agent-market/analytics/popular
```

---

## 💡 使用示例

### 使用curl测试API

**搜索Agent：**
```bash
curl http://localhost:3001/api/agent-market/search?query=AI
```

**获取分类：**
```bash
curl http://localhost:3001/api/agent-market/search/categories
```

**创建评论：**
```bash
curl -X POST http://localhost:3001/api/agent-market/comments/{agentId} \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "content": "这是一个测试评论",
    "parentId": null
  }'
```

**获取统计：**
```bash
curl http://localhost:3001/api/agent-market/analytics/summary
```

---

## 🧪 运行测试

### 运行所有测试
```bash
cd server

# 搜索系统测试
npx tsx tests/test-search.ts

# 评论系统测试
npx tsx tests/test-comment.ts

# 评分系统测试
npx tsx tests/test-rating.ts

# 统计系统测试
npx tsx tests/test-analytics.ts
```

---

## 📊 测试数据

系统包含8个测试Agent：

1. **AI编程助手** - 编程类
2. **智能客服** - 客服类
3. **数据分析专家** - 数据分析类
4. **翻译官** - 翻译类
5. **创意写作助手** - 写作类
6. **代码审查员** - 编程类
7. **周报生成器** - 效率工具类
8. **法律顾问** - 法律类

---

## 🛠️ 开发工具

### 后端开发
- **IDE**: VS Code / WebStorm
- **运行时**: Node.js 18+
- **类型检查**: TypeScript
- **热重载**: ts-node-dev

### 前端开发
- **框架**: Vue 3
- **构建工具**: Vite
- **状态管理**: Pinia
- **路由**: Vue Router
- **类型检查**: TypeScript

---

## 📦 项目文件说明

### 核心文件
```
server/
├── src/
│   ├── services/      # 业务逻辑层
│   ├── routes/        # 路由层
│   ├── types/         # 类型定义
│   └── index.ts       # 入口文件
├── tests/            # 测试文件
└── scripts/          # 工具脚本

client/
├── src/
│   ├── api/          # API层
│   ├── views/        # 页面组件
│   ├── router/       # 路由配置
│   └── stores/       # 状态管理
```

### 文档
```
docs/
├── agent-market-implementation-summary.md  # 实现总结
├── test-report.md                         # 测试报告
└── project-completion-summary.md           # 完成总结
```

---

## 🎯 功能特性

### 搜索
- ✅ 全文搜索（支持名称、描述、标签）
- ✅ 分类筛选
- ✅ 标签筛选
- ✅ 多种排序（最新/热门/评分最高）
- ✅ 分页支持

### 评论
- ✅ 评论CRUD
- ✅ 评论回复
- ✅ 评论点赞
- ✅ 管理员审核
- ✅ 批量审核

### 评分
- ✅ 1-5星评分
- ✅ 评分统计
- ✅ 评分分布
- ✅ 重复评分限制

### 统计
- ✅ 访问统计
- ✅ 使用统计
- ✅ 评分趋势
- ✅ 热门Agent
- ✅ 数据汇总

---

## 🚨 常见问题

### Q: 启动失败怎么办？
A: 确保已安装Node.js和npm，然后重新安装依赖：

```bash
rm -rf node_modules package-lock.json
npm install
```

### Q: 如何添加新的Agent？
A: 使用种子脚本创建：

```bash
cd server
npx tsx scripts/seedAgents.ts
```

### Q: 如何使用PostgreSQL？
A: 在.env文件中配置数据库连接：

```env
DATABASE_URL=postgresql://user:password@localhost:5432/zhizhi
```

然后运行数据库初始化脚本。

### Q: 前端无法连接后端？
A: 检查后端是否正在运行，以及后端地址配置。

---

## 📞 获取帮助

- **文档**: 查看`docs/`目录
- **测试**: 运行测试用例
- **API文档**: 使用`/api/health`端点

---

## ✨ 下一步

1. ✅ 系统开发和测试已完成
2. ⏳ 部署到生产环境
3. ⏳ 添加更多功能
4. ⏳ 性能优化

---

**祝使用愉快！** 🎉
