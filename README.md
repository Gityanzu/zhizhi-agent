# 智知 - 企业知识库智能问答 Agent

基于 RAG（检索增强生成）、Function Calling、Plan-and-Execute 与多 Agent 协作的企业知识库问答系统，支持多格式文档解析、语义检索、多轮对话、工具自动调用、任务规划执行、MCP 协议与 Skill 系统。

## 项目特性

### 核心能力
- 🎯 **四种任务模式**：
  - **智能问答（QA）**：直接调用大模型生成回答，响应最快
  - **Agent 模式**：基于 Function Calling 自动识别并调用 13+ 种工具，支持多厂商模型格式兼容
  - **Plan 模式**：先拆解任务为多步计划，再逐步执行并汇总回答
  - **多 Agent 协作**：Planner 规划 → Executor 执行 → Reviewer 审查 → Coordinator 汇总
- 🔄 **动态模型切换**：支持 12+ 免费模型（通义千问、Kimi、DeepSeek、GLM 等），实时切换，**会话级模型绑定**
- 📚 **RAG 检索增强**：文档向量化存储，混合检索 + Rerank 重排序，语义检索 Top-K 结果增强生成，回答可溯源
- 📄 **多格式文档支持**：PDF / Word / Markdown / TXT 文档解析与分块向量化，多知识库隔离
- 💬 **多轮对话**：上下文管理，自动压缩长对话，支持指代消解，**对话分支与消息编辑**
- ⚡ **流式输出**：SSE 流式响应，打字机效果，工具调用流式合并
- 🧠 **思考过程展示**：可开启思考模式，展示模型推理过程
- 🖼️ **多模态图片理解**：支持图片上传，使用 qwen3.5-ocr 模型理解图片内容
- 🎙️ **语音对话**：Web Speech API 语音识别与合成

### 工具系统（13+ 个工具）
- `search_knowledge_base` - 知识库检索（混合检索 + Rerank）
- `calculate` - 数学计算（安全表达式解析）
- `get_current_time` - 获取当前时间
- `web_search` - 联网搜索（Bing）
- `create_file` / `read_file` / `write_file` / `append_file` - 文件操作
- `list_files` / `search_files` - 文件管理
- `run_shell` - 只读 Shell 命令（白名单限制）
- `translate_text` - 文本翻译
- `summarize_text` - 文本摘要
- `code_interpreter` - 代码解释器（沙箱执行）
- `browser_tool` - 浏览器自动化工具
- `db_query` - 数据库自然语言查询

### 扩展能力
- 🔌 **MCP 协议支持**：标准 JSON-RPC 2.0 接口，端点 `POST /mcp`，支持 7 个标准方法
- 🎭 **Skill 系统**：5 个内置 Skill（编程助手/文档写作/研究分析/学习导师/通用助手），支持自动匹配和手动切换
- 📝 **提示词模板管理**：5 个内置模板 + 自定义模板，可视化编辑，一键切换
- 🧠 **自动记忆系统**：从对话中自动提取用户偏好和事实，跨会话复用
- 📊 **Token 用量统计**：实时统计每次/会话/全局 Token 用量，支持按模型和工具维度分析
- 📈 **可观测性面板**：调用日志、耗时统计、错误追踪、模型/工具使用分析
- 🔧 **工具调用记录**：所有工具调用记录到 PG，支持审计和分析
- 🤖 **自定义 Agent**：创建个性化 Agent，配置系统提示词和工具集
- 🛠️ **自定义 API 工具**：接入外部 REST API 作为工具
- 📊 **模型对比模式**：多模型同时回答，横向对比效果
- ⚙️ **模型参数调节**：温度、Top-P、最大 Token 等参数可视化调节
- 🔀 **工作流编排**：DAG 引擎，可视化编排复杂任务流程
- 🏪 **Agent 市场/模板库**：预置 Agent 模板，一键使用
- 🔗 **对话分享链接**：生成分享链接，导出对话内容
- 📥 **数据导入**：支持对话数据批量导入
- 🌐 **对外 API**：RESTful API 供第三方集成
- 📱 **PWA 支持**：可安装为桌面应用

### 用户系统（轻量级）
- 👤 **用户资料管理**：昵称、头像、个人简介
- ⚙️ **用户偏好设置**：主题、默认模型、默认模式等
- 🔑 **API Key 管理**：多厂商 API Key 加密存储（AES-256-CBC）
- 📤 **数据导出导入**：完整数据备份与迁移

### 技术架构
- 🗄️ **PostgreSQL 存储**：16 张表，会话、消息、工具调用、用量统计、记忆、提示词模板、用户设置等全部持久化
- 🧩 **多提供商支持**：阿里云百炼 + Ollama 本地模型，可扩展更多厂商
- 📱 **响应式设计**：适配桌面/平板/手机，为后续多端开发（Windows/App/Web）打好基础
- 🌙 **深色/浅色主题**：双主题切换，CSS 变量统一管理
- 🔒 **安全防护**：XSS 防护（DOMPurify）、代码注入防护（递归下降解析器）、Shell 白名单、CORS 限制、生产环境错误隐藏

## 技术栈

### 后端
- **Node.js + TypeScript + Express** - 服务端框架
- **LangChain.js** - AI 应用开发框架（ChatOpenAI 兼容接口）
- **PostgreSQL + pg** - 关系型数据库存储
- **本地向量存储** - 基于余弦相似度的轻量级向量数据库，JSON 文件持久化
- **OpenAI 兼容 API** - 支持通义千问 / Kimi / DeepSeek / GLM / OpenAI / Ollama 等
- **pdf-parse / mammoth** - 文档解析
- **ts-node-dev** - 热重载开发

### 前端
- **Vue3 + TypeScript + Vite** - 前端框架
- **Vue Router** - 路由管理（9 个路由，懒加载）
- **Pinia** - 状态管理
- **Element Plus** - UI 组件库
- **Axios + Fetch SSE** - HTTP 请求与流式通信
- **Marked + DOMPurify** - Markdown 渲染与 XSS 防护
- **CSS Variables** - 主题变量与模块化样式

## 快速开始

### 1. 环境要求
- Node.js >= 18.0.0
- PostgreSQL >= 14（可选，不配置则使用 JSON 文件存储）
- npm 或 yarn

### 2. 配置后端

```bash
cd server

# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env

# 编辑 .env 文件
# LLM_API_KEY=your_api_key_here
# LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
# LLM_MODEL_NAME=qwen3.8-flash
# PG_HOST=localhost
# PG_PORT=5432
# PG_DATABASE=zhizhi_agent
# PG_USER=postgres
# PG_PASSWORD=your_password
```

### 3. 配置前端

```bash
cd client
npm install
```

### 4. 启动服务

```bash
# 启动后端（端口 3001，热重载）
cd server
npm run dev

# 启动前端（端口 5173）
cd client
npm run dev
```

访问 http://localhost:5173 即可使用。

## 页面导航

| 路由 | 页面 | 说明 |
|------|------|------|
| `/chat` | 聊天主页 | 对话、模型切换、模式选择 |
| `/knowledge` | 知识库 | 文档管理、记忆管理、提示词模板 |
| `/agents` | Agent 市场 | 自定义 Agent、模板库、工具管理 |
| `/workflow` | 工作流 | DAG 工作流编排器 |
| `/analytics` | 数据分析 | Token 用量、使用统计 |
| `/monitor` | 监控面板 | 可观测性、调用日志 |
| `/settings` | 设置 | 用户资料、API Key、偏好设置 |
| `/workspace` | 工作台 | 快捷入口与概览 |

## 任务模式说明

| 模式 | 说明 | 适用场景 | 响应速度 |
|------|------|---------|---------|
| **智能问答（QA）** | 直接调用大模型生成回答，不使用工具 | 常识性问题、简单问答 | 最快 |
| **Agent** | 自动识别并调用 13+ 种工具，多厂商模型格式兼容 | 需要执行操作或查询的问题 | 中等 |
| **Plan** | 先拆解任务为多步计划，逐步执行后汇总回答 | 复杂任务、需要多步骤推理 | 较慢 |
| **多 Agent** | Planner-Executor-Reviewer-Coordinator 四 Agent 协作 | 复杂协作任务、需要质量审查 | 最慢 |

## 免费模型清单

系统默认使用阿里云百炼免费额度模型：

- qwen3.8-flash（默认）
- qwen3.7-flash / qwen3.7-flash-2026-07-15
- qwen3.8-27b / qwen3.8-max / qwen3.8-max-0902
- qwen3.8-2.4t-a95b
- qwen3.5-ocr（多模态图片理解）
- kimi-k3 / kimi-k2.7-code
- deepseek-v4-flash-0731
- glm-5.2

支持 Ollama 本地模型接入。

## API 文档

### 对话接口
```
POST /api/chat/send      - 非流式对话
POST /api/chat/stream    - 流式对话（SSE）
POST /api/chat/vision    - 图片理解（多模态）
```

### 模型接口
```
GET    /api/model/current  - 获取当前模型
GET    /api/model/list     - 获取可用模型列表
POST   /api/model/switch   - 切换模型
```

### 会话接口
```
POST   /api/sessions              - 创建会话
GET    /api/sessions              - 获取会话列表
GET    /api/sessions/:id          - 获取会话详情
DELETE /api/sessions/:id          - 删除会话
POST   /api/sessions/:id/clear    - 清空会话
PUT    /api/sessions/:id/model-mode - 更新会话模型/模式
```

### 文档接口
```
POST   /api/documents/upload  - 上传文档
GET    /api/documents/list    - 获取文档列表
DELETE /api/documents/:id     - 删除文档
```

### Agent 接口
```
GET    /api/agents          - 获取 Agent 列表
POST   /api/agents          - 创建自定义 Agent
PUT    /api/agents/:id      - 更新 Agent
DELETE /api/agents/:id      - 删除 Agent
```

### 自定义工具接口
```
GET    /api/custom-tools    - 获取自定义工具列表
POST   /api/custom-tools    - 创建自定义 API 工具
DELETE /api/custom-tools/:id - 删除自定义工具
```

### 工作流接口
```
GET    /api/workflows       - 获取工作流列表
POST   /api/workflows       - 创建工作流
POST   /api/workflows/:id/execute - 执行工作流
```

### 用户接口
```
GET    /api/user/settings   - 获取用户设置
PUT    /api/user/settings   - 更新用户设置
GET    /api/user/api-keys   - 获取 API Key 列表
POST   /api/user/api-keys   - 添加 API Key
DELETE /api/user/api-keys/:id - 删除 API Key
POST   /api/user/export     - 导出数据
POST   /api/user/import     - 导入数据
```

### Skill 接口
```
GET  /api/skill/list       - 获取 Skill 列表
GET  /api/skill/active     - 获取当前激活的 Skill
POST /api/skill/switch     - 切换 Skill
POST /api/skill/match      - 根据内容匹配 Skill
```

### 用量统计接口
```
GET /api/usage              - 获取全局用量统计
GET /api/usage/session/:id  - 获取会话用量统计
GET /api/stats/observability - 获取可观测性统计数据
```

### 记忆管理接口
```
GET    /api/memory       - 获取所有记忆
DELETE /api/memory/:id   - 删除记忆
POST   /api/memory/clear - 清空所有记忆
POST   /api/memory/extract - 手动触发记忆提取
```

### 提示词模板接口
```
GET    /api/prompt           - 获取所有模板
GET    /api/prompt/active    - 获取当前激活模板
POST   /api/prompt           - 创建模板
PUT    /api/prompt/:id       - 更新模板
DELETE /api/prompt/:id       - 删除模板
POST   /api/prompt/:id/activate - 激活模板
```

### 分享接口
```
POST   /api/share            - 创建分享链接
GET    /api/share/:id        - 获取分享内容
```

### MCP 协议
```
POST /mcp - MCP 标准 JSON-RPC 2.0 端点
```

## 项目结构

```
zhizhi-agent/
├── server/                          # 后端服务
│   ├── src/
│   │   ├── index.ts                # 入口文件（路由统一加载）
│   │   ├── config.ts               # 配置管理
│   │   ├── db.ts                   # PostgreSQL 连接与初始化（16张表）
│   │   ├── types/                  # 类型定义
│   │   ├── routes/                 # API 路由（20个路由文件）
│   │   │   ├── index.ts            # 路由统一出口
│   │   │   ├── chat.ts             # 对话接口（含多模态图片理解）
│   │   │   ├── model.ts            # 模型管理
│   │   │   ├── document.ts         # 文档管理
│   │   │   ├── session.ts          # 会话管理（含模型/模式绑定）
│   │   │   ├── skill.ts            # Skill 管理
│   │   │   ├── usage.ts            # 用量统计
│   │   │   ├── stats.ts            # 可观测性统计
│   │   │   ├── memory.ts           # 记忆管理
│   │   │   ├── prompt.ts           # 提示词模板管理
│   │   │   ├── agents.ts           # 自定义 Agent 管理
│   │   │   ├── customTools.ts      # 自定义 API 工具
│   │   │   ├── workflows.ts        # 工作流编排
│   │   │   ├── code.ts             # 代码解释器
│   │   │   ├── compare.ts          # 模型对比
│   │   │   ├── dbConnections.ts    # 数据库连接管理
│   │   │   ├── share.ts            # 对话分享
│   │   │   ├── import.ts           # 数据导入
│   │   │   ├── externalApi.ts      # 对外 API
│   │   │   ├── apiKeys.ts          # API Key 管理
│   │   │   └── user.ts             # 用户设置
│   │   ├── services/               # 业务逻辑
│   │   │   ├── llm.ts              # 大模型初始化与动态切换
│   │   │   ├── llmProvider.ts      # 多提供商抽象层
│   │   │   ├── vectorStore.ts      # 本地向量数据库
│   │   │   ├── document.ts         # 文档解析与处理
│   │   │   ├── rag.ts              # RAG 问答引擎（混合检索+Rerank）
│   │   │   ├── agent.ts            # Agent 执行机制（13+工具，多模型格式兼容）
│   │   │   ├── plan.ts             # Plan-and-Execute 任务规划
│   │   │   ├── multiAgent.ts       # 多 Agent 协作
│   │   │   ├── session.ts          # 会话管理（PG/JSON 双模式）
│   │   │   ├── usage.ts            # Token 用量统计
│   │   │   ├── memory.ts           # 自动记忆提取与管理
│   │   │   ├── prompt.ts           # 提示词模板管理
│   │   │   ├── customAgent.ts      # 自定义 Agent
│   │   │   ├── customTool.ts       # 自定义 API 工具
│   │   │   ├── workflow.ts         # DAG 工作流引擎
│   │   │   ├── codeExecutor.ts     # 代码解释器沙箱
│   │   │   ├── browserTool.ts      # 浏览器自动化工具
│   │   │   ├── dbQuery.ts          # 数据库自然语言查询
│   │   │   ├── collection.ts       # 多知识库集合管理
│   │   │   ├── share.ts            # 对话分享
│   │   │   ├── importData.ts       # 数据导入
│   │   │   ├── apiKey.ts           # API Key 加密存储
│   │   │   └── userSettings.ts     # 用户设置管理
│   │   ├── mcp/                    # MCP 协议
│   │   │   └── server.ts           # MCP JSON-RPC 2.0 服务器
│   │   └── skills/                 # Skill 系统
│   │       └── index.ts            # 5 个内置 Skill 与管理器
│   ├── agent_output/               # Agent 工作目录
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── client/                          # 前端应用
│   ├── src/
│   │   ├── main.ts                 # 入口文件
│   │   ├── App.vue                 # 主应用（router-view + 全局弹窗）
│   │   ├── router/                 # 路由配置
│   │   │   └── index.ts            # 9个路由，懒加载，scrollBehavior
│   │   ├── views/                  # 页面级组件
│   │   │   ├── ChatView.vue        # 聊天主页
│   │   │   ├── KnowledgeView.vue   # 知识库页面
│   │   │   ├── AgentsView.vue      # Agent 市场页面
│   │   │   ├── WorkflowView.vue    # 工作流页面
│   │   │   ├── AnalyticsView.vue   # 数据分析页面
│   │   │   ├── MonitorView.vue     # 监控页面
│   │   │   ├── SettingsView.vue    # 设置页面
│   │   │   └── WorkspaceView.vue   # 工作台页面
│   │   ├── components/             # 组件（按模块拆分）
│   │   │   ├── chat/               # 聊天相关
│   │   │   │   ├── ChatArea.vue    # 聊天区域（输入工具栏集成）
│   │   │   │   ├── MessageItem.vue # 消息项（工具调用/Plan/思考过程）
│   │   │   │   └── ChatInputToolbar.vue # 输入工具栏（备用）
│   │   │   ├── agent/              # Agent 相关
│   │   │   │   ├── AgentManager.vue
│   │   │   │   ├── AgentMarket.vue
│   │   │   │   ├── AgentSelector.vue
│   │   │   │   ├── CustomToolManager.vue
│   │   │   │   ├── ModelCompareView.vue
│   │   │   │   ├── ModelParamsPanel.vue
│   │   │   │   ├── ObservabilityPanel.vue
│   │   │   │   └── WorkflowEditor.vue
│   │   │   ├── knowledge/          # 知识库相关
│   │   │   │   ├── DocumentPanel.vue
│   │   │   │   ├── MemoryPanel.vue
│   │   │   │   └── PromptPanel.vue
│   │   │   ├── settings/           # 设置相关
│   │   │   │   ├── UserSettings.vue
│   │   │   │   ├── ApiKeyManager.vue
│   │   │   │   └── DBConnectionManager.vue
│   │   │   └── common/             # 通用组件
│   │   │       ├── Sidebar.vue     # 侧边栏（页面导航+会话列表）
│   │   │       ├── DBQueryPanel.vue
│   │   │       ├── ImportDialog.vue
│   │   │       └── ShareDialog.vue
│   │   ├── stores/                 # Pinia 状态管理
│   │   │   ├── chat.ts             # 聊天核心状态（41KB）
│   │   │   ├── ui.ts               # 全局弹窗状态
│   │   │   └── index.ts            # 统一出口
│   │   ├── api/                    # API 调用（按领域拆分）
│   │   │   ├── request.ts          # 请求封装
│   │   │   ├── chat.ts             # 对话 API
│   │   │   ├── model.ts            # 模型 API
│   │   │   ├── agent.ts            # Agent API
│   │   │   ├── knowledge.ts        # 知识库 API
│   │   │   ├── stats.ts            # 统计 API
│   │   │   ├── common.ts           # 通用 API
│   │   │   └── index.ts            # 统一出口
│   │   ├── types/                  # 类型定义（按领域拆分）
│   │   │   ├── chat.ts
│   │   │   ├── model.ts
│   │   │   ├── agent.ts
│   │   │   ├── knowledge.ts
│   │   │   ├── common.ts
│   │   │   └── index.ts
│   │   ├── styles/                 # 样式模块化
│   │   │   ├── variables.css       # 设计令牌（CSS变量）
│   │   │   ├── base.css            # 基础样式/滚动条/动画
│   │   │   ├── markdown.css        # Markdown渲染+代码高亮
│   │   │   ├── components.css      # 通用组件样式
│   │   │   ├── dark-mode.css       # 深色模式覆盖
│   │   │   └── index.css           # 统一入口
│   │   ├── composables/            # 组合式函数
│   │   │   ├── useIsMobile.ts      # 移动端检测
│   │   │   └── useSpeech.ts        # 语音识别+合成
│   │   └── data/                   # 静态数据
│   │       └── agentTemplates.ts   # Agent 模板数据
│   ├── package.json
│   ├── vite.config.ts
│   └── index.html
└── README.md
```

## 多 Agent 协作架构

多 Agent 模式采用四 Agent 流水线：

1. **Planner（规划者）**：分析用户需求，生成结构化的多步执行计划
2. **Executor（执行者）**：逐步执行计划，每步独立调用 Agent（含工具调用能力）
3. **Reviewer（审查者）**：审查执行结果，给出质量评估和改进建议
4. **Coordinator（协调者）**：汇总所有结果，生成最终完整回答

前端可视化展示完整执行轨迹（时间线）。

## MCP 协议支持

实现了 Model Context Protocol 标准接口：

- `initialize` - 初始化连接
- `tools/list` - 列出可用工具
- `tools/call` - 调用工具
- `resources/list` - 列出资源
- `resources/read` - 读取资源
- `prompts/list` - 列出提示词
- `prompts/get` - 获取提示词

端点：`POST /mcp`，支持外部 MCP 客户端接入。

## 安全机制

- **XSS 防护**：所有 Markdown 渲染经过 DOMPurify 净化
- **代码注入防护**：calculate 工具使用自写递归下降解析器，禁用 `new Function` 和 `eval`
- **Shell 白名单**：run_shell 仅允许只读命令（ls/cat/grep/find/pwd/whoami/date/echo）
- **文件操作沙箱**：文件工具限制在 `agent_output` 目录
- **CORS 限制**：生产环境限制允许的来源
- **错误隐藏**：生产环境不返回详细错误信息
- **图片大小限制**：多模态图片上传限制 5MB
- **API Key 加密**：AES-256-CBC 加密存储用户 API Key

## 扩展方向

- [ ] 接入更多向量数据库（pgvector / Milvus）
- [ ] 代码执行沙箱完善
- [ ] 知识库权限管理
- [ ] Docker 容器化部署
- [ ] Windows 桌面端（Electron）
- [ ] 移动端 App（Capacitor/uni-app）
- [ ] 更多厂商模型接入（Anthropic / Google / 智谱）
- [ ] 团队协作与共享

## 许可证

MIT
