# 开发规范 Skill 索引

## 概述

本目录包含项目的开发规范和最佳实践指南，由 Claude Code 自动生成。

---

## 文件列表

### 1. [code-style.md](./code-style.md) - 代码开发规范

**涵盖内容：**
- 项目结构规范（前端 + 后端）
- TypeScript 编码规范
- Vue 3 组件规范
- API 层规范
- Express 后端规范
- Pinia 状态管理规范
- Git 提交规范
- 命名规范
- 代码注释规范
- 环境变量规范
- 错误处理
- 性能优化
- 安全规范
- 测试规范
- Linting 和 Formatting

**适用场景：**
- 日常开发中的编码指导
- 代码审查标准
- 技术决策参考

**使用方法：**
在 Claude Code 中，当需要了解如何编写代码时，可以使用 `/skill code-style` 查看相关规范。

---

### 2. [git-commit.md](./git-commit.md) - Git 提交规范

**涵盖内容：**
- Conventional Commits 规范
- Type 类型说明
- Subject 格式要求
- Body 格式规范
- Footer 格式
- 提交示例
- 工具配置
- 最佳实践
- 团队协作

**适用场景：**
- 提交代码时的信息编写
- 代码审查时的提交信息检查
- CHANGELOG 自动生成

**使用方法：**
```bash
# 在 Claude Code 中
/skill git-commit

# 或手动查看文件
cat .claude/skills/git-commit.md
```

---

### 3. [api-design.md](./api-design.md) - API 设计规范

**涵盖内容：**
- 设计原则（RESTful、无状态、统一响应）
- URL 设计规范
- HTTP 方法规范
- 状态码规范
- 错误响应格式
- 认证和授权
- 分页规范
- 过滤和排序
- 版本控制
- 文档
- 请求和响应示例
- 实现示例

**适用场景：**
- 设计新的 API 端点
- 修改现有 API
- API 文档编写
- 前后端接口对接

**使用方法：**
```bash
/skill api-design
```

---

## 快速开始

### 开发新功能

1. 首先查看 [code-style.md](./code-style.md) 了解代码规范
2. 使用 `/skill git-commit` 确保提交信息规范
3. 遵循 API 设计规范设计接口
4. 实现功能后运行测试
5. 使用规范的提交信息提交代码

### 代码审查

- 检查是否符合 [code-style.md](./code-style.md) 的规范
- 验证提交信息是否符合 [git-commit.md](./git-commit.md)
- 确认 API 设计是否符合 [api-design.md](./api-design.md)

---

## 使用建议

### 1. 集成到工作流

```bash
# 初始化 commitlint
npm install -D @commitlint/cli @commitlint/config-conventional

# 配置 commitlint
echo "module.exports = { extends: ['@commitlint/config-conventional'] };" > .commitlintrc.js

# 配置 Husky
npx husky install
npx husky add .husky/commit-msg 'npx --no -- commitlint --edit $1'
```

### 2. 使用工具

- **前端**：ESLint + Prettier
- **后端**：ESLint + Prettier
- **Git**：Commitlint + Husky + Commitizen

### 3. 定期审查

- 每周审查一次规范执行情况
- 根据项目发展调整规范
- 收集团队反馈优化规范

---

## 规范更新

当项目有新的需求或技术栈升级时，应及时更新规范：

1. 在相应规范文件中添加新的章节
2. 更新现有内容以反映最佳实践
3. 通知团队成员规范变更
4. 更新本 README

---

## 参考资源

- [Vue 3 官方文档](https://vuejs.org/)
- [TypeScript 官方文档](https://www.typescriptlang.org/)
- [Express.js 官方文档](https://expressjs.com/)
- [RESTful API 设计指南](https://restfulapi.net/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [OpenAPI Specification](https://swagger.io/specification/)

---

## 联系方式

如有规范相关的问题或建议，请联系项目维护者。

---

**Co-Authored-By: Claude Code <noreply@anthropic.com>**
