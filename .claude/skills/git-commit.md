# Git 提交规范

## 概述

本规范遵循 [Conventional Commits](https://www.conventionalcommits.org/) 标准，确保提交历史清晰、可读性强，便于自动化生成 CHANGELOG 和版本号。

---

## 提交信息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

---

## Type 类型

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(auth): 添加 JWT 认证中间件` |
| `fix` | Bug 修复 | `fix(chat): 修复流式响应中断问题` |
| `docs` | 文档更新 | `docs(readme): 更新安装和使用说明` |
| `style` | 代码格式调整（不影响功能） | `style(ui): 修复缩进问题` |
| `refactor` | 代码重构 | `refactor(api): 重构 API 响应格式` |
| `perf` | 性能优化 | `perf(chat): 优化长文本处理性能` |
| `test` | 测试相关 | `test(chat): 添加单元测试` |
| `chore` | 构建、工具链相关 | `chore: 更新依赖到最新版本` |
| `revert` | 回退之前的提交 | `revert: revert commit abc123` |
| `ci` | CI/CD 相关 | `ci: 添加 GitHub Actions workflow` |

---

## Subject 格式

1. 使用 **祈使句** 语气，不要使用 "Added"、"Fixed"、"Changed"
2. 首字母 **小写**
3. 结尾 **不加句号**
4. 长度控制在 **50 个字符以内**

✅ **推荐：**
- `feat(auth): 添加 JWT 认证中间件`
- `fix(chat): 修复流式响应中断问题`
- `docs(readme): 更新安装和使用说明`

❌ **避免：**
- `Added JWT authentication middleware` (祈使句)
- `Fixed streaming response interruption bug.` (以句号结尾)
- `add jwt auth middleware` (首字母大写)

---

## Body 格式

1. **必须以空行开头**
2. 描述 **详细说明** 改动的动机和实现细节
3. 解释 **为什么** 而不是 **是什么**
4. 如果改动较大，可以使用多个段落
5. 每行长度控制在 **72 个字符以内**

✅ **推荐：**

```
feat(chat): 添加多 Agent 协作支持

- 实现 Agent 间消息传递机制
- 支持自定义 Agent 工作流
- 添加 Agent 状态可视化面板

技术细节：
- 使用 AgentSelector 组件选择 Agent
- 在 WorkflowEditor 中配置工作流
- 通过消息总线实现 Agent 间通信
```

---

## Footer 格式

### Breaking Changes

如果改动是破坏性的（breaking change），需要在 footer 中声明：

```
feat(api): 重构用户 API

BREAKING CHANGE: 旧的 /api/users endpoint 已被移除，请使用新的
/api/v1/users endpoint。返回格式从 { data } 改为 { users: [] }。
```

### 关联 Issue / PR

如果提交与 Issue 或 PR 相关，需要在 footer 中添加：

```
Closes #123
Fixes #456
Refs #789
```

或使用 PR 格式：

```
PR #123
```

---

## 示例

### 小改动

```bash
git commit -m "fix(auth): 修复 token 过期未自动刷新的问题"
```

### 中等改动

```bash
git commit -m "feat(auth): 添加刷新 token 机制

- 添加 refresh_token 到 token 响应
- 实现 access_token 过期自动刷新
- 更新 axios 拦截器处理 401 响应

Closes #100"
```

### 大改动

```bash
git commit -m "feat(chat): 实现多 Agent 协作系统

这是一个重要的新功能，支持多个 Agent 协同工作。

新增功能：
- Agent 选择器和状态管理
- 工作流编辑器（WorkflowEditor）
- Agent 间消息传递机制
- 实时协作状态可视化

技术实现：
- AgentSelector 组件：选择和配置 Agent
- WorkflowEditor 组件：拖拽式工作流设计
- AgentMessage 组件：Agent 间消息展示
- store/chat.ts：管理多个 Agent 的状态

相关 Issue：
Closes #200
Closes #201
```

### 代码重构

```bash
git commit -m "refactor(api): 统一 API 响应格式

- 所有 API 返回统一格式 { code, data, message }
- 添加 ApiResponse<T> 类型定义
- 更新 axios 拦截器统一处理响应

优点：
- 更好的错误处理
- 一致的 API 接口
- 便于前端统一处理

Closes #150"
```

### 性能优化

```bash
git commit -m "perf(chat): 优化长文本处理性能

问题：
- 处理 10000+ token 文本时响应超时
- LLM API 调用耗时过长

优化方案：
- 使用流式处理（SSE）
- 添加进度提示
- 优化内存使用

性能提升：
- 响应时间减少 40%
- 内存占用减少 30%
```

---

## 提交规范工具

### Commitlint

使用 [commitlint](https://commitlint.js.org/) 强制执行提交规范：

```bash
# 安装
npm install -D @commitlint/cli @commitlint/config-conventional

# 配置 commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```

### Commitizen

使用 [commitizen](https://commitizen.gitbook.io/) 交互式提交：

```bash
# 安装
npm install -D commitizen cz-conventional-changelog

# 配置 package.json
{
  "scripts": {
    "commit": "cz"
  }
}

# 使用
npm run commit
```

### Commitlint + Husky

使用 git hooks 自动检查提交信息：

```bash
# 安装
npm install -D husky @commitlint/cli @commitlint/config-conventional

# 初始化 husky
npx husky install
npx husky add .husky/commit-msg 'npx --no -- commitlint --edit $1'

# 配置 commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```

---

## Commit Message 常用短语

### 功能

```
add, implement, support, enable
```

### 修复

```
fix, correct, resolve, mend
```

### 文档

```
docs, add, update, improve
```

### 样式

```
format, style, prettify, beautify
```

### 重构

```
refactor, improve, optimize, modernize
```

### 测试

```
test, cover, add tests
```

### 构建/工具

```
build, ci, deps, chore, setup
```

---

## 最佳实践

### 1. 分多次提交

不要将多个不相关的改动合并到一次提交：

```bash
# ❌ 避免
git commit -m "update and fix"

# ✅ 推荐
git commit -m "feat(ui): 优化登录页面布局"
git commit -m "fix(api): 修复登录接口返回格式"
```

### 2. 先提交小的改动

先提交小的、原子性的改动：

```bash
git add client/src/stores/auth.ts
git commit -m "feat(auth): 添加认证 store"

git add client/src/api/auth.ts
git commit -m "feat(auth): 实现 auth API 接口"

git add client/src/views/LoginView.vue
git commit -m "feat(auth): 添加登录页面"
```

### 3. 使用 squash 合并

在 Pull Request 或 Merge Request 时，使用 squash 合并保持提交历史整洁：

```bash
# GitHub: Settings -> Merge options -> Squash and merge
# GitLab: Settings -> Merge requests -> Use merge commits
```

### 4. 保持提交信息简洁

- 好的提交信息会自解释代码
- 过长的提交信息会分散注意力
- 如果需要详细说明，使用 body

### 5. 避免提交"临时"改动

在提交前清理：

```bash
# 删除调试代码
git checkout -- . -- "*.js" # 恢复到上一次提交的 js 文件
git checkout -- client/src/api/*.js

# 删除临时文件
git clean -fd
```

---

## 团队协作

### 分支命名

```
feature/xxx          # 新功能
fix/xxx              # Bug 修复
hotfix/xxx           # 紧急修复
release/xxx          # 发布分支
chore/xxx            # 其他改动
```

### Pull Request 模板

创建 `.github/PULL_REQUEST_TEMPLATE.md`：

```markdown
## 描述
<!-- 简要描述本次 PR 的改动 -->

## 改动类型
- [ ] 新功能
- [ ] Bug 修复
- [ ] 代码重构
- [ ] 性能优化
- [ ] 文档更新
- [ ] 其他

## 关联 Issue
<!-- 关联的 Issue -->

## 提交信息
<!-- 提交信息规范，例如：feat(chat): 添加多 Agent 协作 -->

## 测试
<!-- 如何测试这个改动 -->

## 截图
<!-- 如果是 UI 改动，请添加截图 -->
```

---

## 总结

遵循这些规范的好处：

1. **清晰的提交历史**：便于追踪改动
2. **自动化工具支持**：生成 CHANGELOG、自动版本号
3. **更好的协作体验**：减少沟通成本
4. **代码审查友好**：快速理解改动内容

**记住：好的提交信息是团队协作的基础！**

**Co-Authored-By: Claude Code <noreply@anthropic.com>**
