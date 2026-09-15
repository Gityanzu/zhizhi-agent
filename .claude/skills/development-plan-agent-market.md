# Agent 市场与模板系统 - 开发计划

## 📋 功能概述

实现一个完整的 Agent 市场系统，包括模板管理、导入导出、评分评论、搜索分类等功能，提升 Agent 的可发现性和易用性。

---

## 🎯 实现阶段

### 第一阶段：基础功能增强 (1-2天)

#### 1.1 Agent 导入导出功能 ✅
**文件**：
- `server/src/services/agentMarket.ts` - Agent 市场服务
- `server/src/routes/agentMarket.ts` - API 路由

**功能**：
- [ ] 导出 Agent 为 JSON 文件
- [ ] 导入 Agent 模板
- [ ] 导出为可分享的格式
- [ ] 验证导入数据的完整性

**技术实现**：
```typescript
// 导出 Agent
export async function exportAgent(agentId: string): Promise<AgentExport>
// 导入 Agent
export async function importAgent(data: AgentImport): Promise<CustomAgent>
// 验证数据
export function validateAgentExport(data: any): boolean
```

**API 端点**：
- `POST /api/agent-market/export/:id` - 导出 Agent
- `POST /api/agent-market/import` - 导入 Agent
- `POST /api/agent-market/import/file` - 从文件导入
- `GET /api/agent-market/templates/:id` - 获取模板详情

**代码规范遵循**：
- TypeScript 完整类型注解
- 统一错误处理
- 完善的输入验证
- 清晰的注释

---

#### 1.2 Agent 评分系统
**文件**：
- `server/src/services/rating.ts` - 评分服务
- `server/src/routes/rating.ts` - API 路由
- `server/src/types/rating.ts` - 类型定义

**功能**：
- [ ] 用户对 Agent 进行评分（1-5星）
- [ ] 收集平均分和评分人数
- [ ] 获取评分统计信息
- [ ] 用户评分历史记录

**数据库设计**：
```sql
CREATE TABLE agent_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, agent_id) -- 每个用户只能对每个 Agent 评分一次
);

CREATE INDEX idx_agent_ratings_agent_id ON agent_ratings(agent_id);
CREATE INDEX idx_agent_ratings_user_id ON agent_ratings(user_id);
```

**API 端点**：
- `POST /api/agent-market/ratings/:id` - 对 Agent 评分
- `GET /api/agent-market/ratings/:id/stats` - 获取评分统计
- `GET /api/agent-market/ratings/:id/history` - 获取评分历史

**代码规范遵循**：
- 数据库迁移脚本
- 完整的错误处理
- 并发评分限制（防止刷分）
- 权限检查（只能给自己评分）

---

#### 1.3 Agent 评论系统
**文件**：
- `server/src/services/comment.ts` - 评论服务
- `server/src/routes/comments.ts` - API 路由

**功能**：
- [ ] 用户发表评论
- [ ] 评论列表展示
- [ ] 评论点赞/回复
- [ ] 评论审核（可选）
- [ ] 评论分页

**数据库设计**：
```sql
CREATE TABLE agent_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES agent_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id, parent_id, content) -- 防止重复评论
);

CREATE INDEX idx_agent_comments_agent_id ON agent_comments(agent_id);
CREATE INDEX idx_agent_comments_parent_id ON agent_comments(parent_id);
```

**API 端点**：
- `POST /api/agent-market/comments/:id` - 发表评论
- `GET /api/agent-market/comments/:id` - 获取评论列表
- `POST /api/agent-market/comments/:id/like` - 点赞评论
- `POST /api/agent-market/comments/:id/reply` - 回复评论

---

### 第二阶段：高级功能 (1-2天)

#### 1.4 Agent 搜索与分类
**文件**：
- `server/src/services/search.ts` - 搜索服务
- `server/src/routes/search.ts` - API 路由

**功能**：
- [ ] 全文搜索（名称、描述、标签）
- [ ] 分类筛选
- [ ] 排序功能（最新、最热、评分最高）
- [ ] 热门标签推荐

**API 端点**：
- `GET /api/agent-market/search?q=xxx&category=xxx&sort=xxx&page=1&pageSize=10`
- `GET /api/agent-market/categories` - 获取所有分类

---

#### 1.5 Agent 模板市场
**文件**：
- `server/src/data/publicTemplates.ts` - 公开模板库
- `server/src/services/templateMarket.ts` - 模板服务

**功能**：
- [ ] 公开模板库（社区分享）
- [ ] 模板下载
- [ ] 模板审核机制
- [ ] 模板版本管理

**数据结构**：
```typescript
interface PublicTemplate {
  id: string;
  name: string;
  author: string;
  avatar?: string;
  description: string;
  systemPrompt: string;
  model: string;
  tools: string[];
  temperature: number;
  category: string;
  version: string;
  downloadCount: number;
  rating: number;
  reviewCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

**API 端点**：
- `GET /api/agent-market/templates` - 获取模板列表
- `GET /api/agent-market/templates/:id` - 获取模板详情
- `POST /api/agent-market/templates` - 上传模板
- `GET /api/agent-market/templates/:id/download` - 下载模板

---

#### 1.6 Agent 对比功能
**文件**：
- `server/src/services/compare.ts` - 对比服务
- `server/src/routes/compare.ts` - API 路由

**功能**：
- [ ] 多 Agent 并行对比
- [ ] 性能指标收集
- [ ] 对比报告生成
- [ ] 可视化对比数据

**API 端点**：
- `POST /api/agent-market/compare` - 对比多个 Agent
- `GET /api/agent-market/compare/:id/report` - 获取对比报告

---

### 第三阶段：前端实现 (1-2天)

#### 1.7 前端 Agent 市场页面
**文件**：
- `client/src/views/AgentMarketView.vue` - Agent 市场主页面
- `client/src/components/agent-market/AgentCard.vue` - Agent 卡片
- `client/src/components/agent-market/TemplateCard.vue` - 模板卡片
- `client/src/components/agent-market/RatingDialog.vue` - 评分弹窗
- `client/src/components/agent-market/CommentList.vue` - 评论列表
- `client/src/components/agent-market/CompareDialog.vue` - 对比弹窗

**功能**：
- [ ] Agent 卡片展示（头像、名称、描述、评分、标签）
- [ ] 搜索和筛选功能
- [ ] 分类导航
- [ ] 评分和评论功能
- [ ] 导入导出功能
- [ ] 对比功能
- [ ] 响应式设计（支持移动端）

**组件结构**：
```vue
<template>
  <div class="agent-market">
    <Sidebar /> <!-- 分类导航 -->

    <main class="agent-market-content">
      <SearchBar /> <!-- 搜索栏 -->

      <Filters /> <!-- 筛选器 -->

      <Grid class="agent-grid">
        <AgentCard v-for="agent in agents" :key="agent.id" :agent="agent" />
      </Grid>

      <Pagination />
    </main>

    <Dialogs /> <!-- 评分、评论、对比弹窗 -->
  </div>
</template>
```

---

#### 1.8 Agent 详情页面
**文件**：
- `client/src/components/agent-market/AgentDetail.vue`

**功能**：
- [ ] Agent 详细信息展示
- [ ] 实时预览（测试 Agent）
- [ ] 评分和评论
- [ ] 导入导出
- [ ] 使用统计

---

#### 1.9 前端 API 封装
**文件**：
- `client/src/api/agentMarket.ts`
- `client/src/api/rating.ts`
- `client/src/api/comment.ts`
- `client/src/api/compare.ts`

**功能**：
- [ ] 所有 Agent 市场相关 API 调用
- [ ] 统一的错误处理
- [ ] 请求/响应拦截

---

### 第四阶段：测试和优化 (1天)

#### 1.10 测试
- [ ] 单元测试（后端服务）
- [ ] 集成测试（API）
- [ ] 前端组件测试
- [ ] 端到端测试

#### 1.11 优化
- [ ] 性能优化（懒加载、缓存）
- [ ] SEO 优化（如果需要）
- [ ] 用户体验优化（加载状态、错误提示）
- [ ] 安全性检查

---

## 📅 时间估算

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| **第一阶段** | | 1-2 天 |
| 1.1 | Agent 导入导出功能 | 2-3 小时 |
| 1.2 | Agent 评分系统 | 3-4 小时 |
| 1.3 | Agent 评论系统 | 3-4 小时 |
| **第二阶段** | | 1-2 天 |
| 1.4 | Agent 搜索与分类 | 2-3 小时 |
| 1.5 | Agent 模板市场 | 4-5 小时 |
| 1.6 | Agent 对比功能 | 2-3 小时 |
| **第三阶段** | | 1-2 天 |
| 1.7 | 前端 Agent 市场页面 | 5-6 小时 |
| 1.8 | Agent 详情页面 | 2-3 小时 |
| 1.9 | 前端 API 封装 | 1-2 小时 |
| **第四阶段** | | 1 天 |
| 1.10 | 测试 | 3-4 小时 |
| 1.11 | 优化 | 2-3 小时 |

**总计**：6-9 天

---

## 🚀 开始实现

### 当前任务：1.1 Agent 导入导出功能

**目标**：
1. 创建 `server/src/services/agentMarket.ts` - Agent 市场服务
2. 创建 `server/src/routes/agentMarket.ts` - API 路由
3. 实现导入导出功能
4. 实现数据验证

**实现步骤**：
1. ✅ 创建服务层 `server/src/services/agentMarket.ts`
2. ✅ 创建路由层 `server/src/routes/agentMarket.ts`
3. ✅ 编写类型定义 `server/src/types/agentMarket.ts` 和 `client/src/types/agentMarket.ts`
4. ✅ 实现导入导出逻辑（exportAgent, importAgentFromJson 等）
5. ✅ 实现模板管理功能（getTemplates, uploadTemplate, downloadTemplate 等）
6. ✅ 测试功能（test-agent-market.ts 全部通过）

---

**准备好了吗？让我开始实现！** 🚀
