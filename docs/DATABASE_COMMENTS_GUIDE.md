# 数据库注释添加指南

**完成时间**: 2026-09-18  
**覆盖范围**: 所有 PostgreSQL 表和字段  

---

## 📋 已添加注释的表（共 30 个）

### 1. 核心功能表

#### ✅ sessions - 对话会话表
**描述**: 存储用户的对话会话信息
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 会话 ID (UUID) |
| title | VARCHAR(200) | 会话标题 |
| mode | VARCHAR(20) | 会话模式：agent\|chat\|assistant |
| model | VARCHAR(100) | 使用的模型名称 |
| skill_id | VARCHAR(50) | 关联的技能 ID |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| message_count | INTEGER | 消息数量 |
| folder_id | UUID | 所属文件夹 ID，用于会话分组 |
| is_pinned | BOOLEAN | 是否置顶会话 |
| tags | JSONB | 会话标签数组 |
| current_branch_id | VARCHAR(100) | 当前对话分支 ID |

#### ✅ messages - 对话消息表
**描述**: 存储会话中的每条消息
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 消息 ID (UUID) |
| session_id | UUID | 所属会话 ID |
| role | VARCHAR(20) | 角色：user\|assistant\|system\|tool |
| content | TEXT | 消息内容 |
| mode | VARCHAR(20) | 消息模式 |
| created_at | TIMESTAMP | 创建时间 |
| tool_calls | JSONB | 工具调用记录数组 |
| sources | JSONB | 引用来源数组 |
| thinking | TEXT | 思考过程文本 |
| plan | JSONB | 执行计划 |
| agent_trace | JSONB | Agent 追踪信息 |
| token_usage | JSONB | Token 使用情况 |
| parent_id | UUID | 父消息 ID，支持对话分支 |
| branch_id | VARCHAR(100) | 对话分支标识 |

#### ✅ tool_calls - 工具调用记录表
**描述**: 记录 AI 调用的外部工具
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 调用记录 ID (UUID) |
| message_id | UUID | 关联的消息 ID |
| session_id | UUID | 所属会话 ID |
| tool_name | VARCHAR(100) | 工具名称 |
| arguments | JSONB | 调用参数 |
| result | TEXT | 工具执行结果 |
| duration_ms | INTEGER | 执行耗时（毫秒） |
| created_at | TIMESTAMP | 创建时间 |

#### ✅ usage_stats - Token 用量统计表
**描述**: 记录每次对话的 Token 消耗和费用
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 统计记录 ID (UUID) |
| session_id | UUID | 所属会话 ID |
| message_id | UUID | 关联的消息 ID |
| model | VARCHAR(100) | 使用的模型名称 |
| prompt_tokens | INTEGER | 输入 Token 数量 |
| completion_tokens | INTEGER | 输出 Token 数量 |
| total_tokens | INTEGER | 总 Token 数量 |
| cost_cents | NUMERIC(10,4) | 费用（美分） |
| created_at | TIMESTAMP | 统计时间 |

#### ✅ memories - 自动记忆表
**描述**: AI 自动保存的重要对话信息
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 记忆 ID (UUID) |
| content | TEXT | 记忆内容 |
| category | VARCHAR(50) | 分类：general\|personal\|technical\|etc |
| importance | INTEGER | 重要程度 1-10 |
| source_session_id | UUID | 来源会话 ID |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### ✅ prompt_templates - 提示词模板表
**描述**: 系统预设的提示词模板
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 模板 ID (UUID) |
| name | VARCHAR(100) | 模板名称 |
| description | TEXT | 模板描述 |
| content | TEXT | 模板内容 |
| is_active | BOOLEAN | 是否启用 |
| is_builtin | BOOLEAN | 是否为内置模板 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### ✅ vectors - 向量存储表
**描述**: 用于语义搜索的向量数据
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 向量 ID (UUID) |
| content | TEXT | 原始文本内容 |
| embedding | vector(1536) | 向量嵌入 (1536 维，仅 pgvector) |
| vector | JSONB | 向量数据 [JSONB]，非 pgvector 模式 |
| metadata | JSONB | 元数据 |
| created_at | TIMESTAMP | 创建时间 |

---

### 2. 知识库功能表

#### ✅ documents - 文档表
**描述**: 上传的知识库文档
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 文档 ID (UUID) |
| name | VARCHAR(255) | 文档名称 |
| size | BIGINT | 文件大小（字节） |
| type | VARCHAR(20) | 文件类型：pdf\|docx\|txt\|etc |
| chunk_count | INTEGER | 分块数量 |
| file_path | VARCHAR(500) | 文件存储路径 |
| collection_id | UUID | 所属知识库 ID |
| created_at | TIMESTAMP | 上传时间 |

#### ✅ collections - 知识库集合表
**描述**: 文档的知识库分类
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 知识库 ID (UUID) |
| name | VARCHAR(100) | 知识库名称 |
| description | TEXT | 知识库描述 |
| icon | VARCHAR(50) | 图标名称 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

---

### 3. 用户管理表

#### ✅ users - 用户表
**描述**: 系统用户账户
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 用户 ID (UUID) |
| username | VARCHAR(50) | 用户名 |
| email | VARCHAR(100) | 邮箱地址 |
| password_hash | VARCHAR(255) | 密码哈希 |
| nickname | VARCHAR(50) | 昵称 |
| avatar | VARCHAR(500) | 头像 URL |
| role | VARCHAR(20) | 角色：admin\|user\|guest |
| status | VARCHAR(20) | 状态：active\|inactive\|suspended |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### ✅ user_api_keys - 用户 API Key 表
**描述**: 用户配置的大模型 API 密钥
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | API Key ID (UUID) |
| user_id | UUID | 用户 ID |
| provider | VARCHAR(50) | 服务商：dashscope\|openai\|etc |
| name | VARCHAR(100) | API Key 名称 |
| encrypted_key | TEXT | 加密后的密钥 |
| key_prefix | VARCHAR(20) | 密钥前缀 |
| base_url | VARCHAR(500) | API 基础 URL |
| is_default | BOOLEAN | 是否为默认密钥 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### ✅ user_settings - 用户设置表
**描述**: 用户个性化配置
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 设置 ID (通常为 1) |
| profile | JSONB | 用户资料 |
| preferences | JSONB | 偏好设置 |
| llm_keys | JSONB | LLM 密钥列表 |
| updated_at | TIMESTAMP | 更新时间 |

#### ✅ login_logs - 登录日志表
**描述**: 用户登录历史记录
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 日志 ID (UUID) |
| user_id | UUID | 用户 ID |
| ip_address | VARCHAR(45) | IP 地址 |
| user_agent | TEXT | 浏览器信息 |
| location | VARCHAR(200) | 地理位置 |
| login_method | VARCHAR(20) | 登录方式 |
| status | VARCHAR(20) | 状态：success\|failed |
| failure_reason | TEXT | 失败原因 |
| created_at | TIMESTAMP | 创建时间 |

#### ✅ tokens - 令牌管理表
**描述**: 刷新令牌、密码找回令牌等
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 令牌 ID (UUID) |
| user_id | UUID | 用户 ID |
| token_type | VARCHAR(20) | 令牌类型：access\|refresh\|password_reset |
| token_hash | VARCHAR(255) | 令牌哈希 |
| expires_at | TIMESTAMP | 过期时间 |
| revoked_at | TIMESTAMP | 撤销时间 |
| ip_address | VARCHAR(45) | IP 地址 |
| user_agent | TEXT | 浏览器信息 |
| created_at | TIMESTAMP | 创建时间 |

#### ✅ email_verifications - 邮箱验证表
**描述**: 邮箱验证和密码找回
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 验证记录 ID (UUID) |
| user_id | UUID | 用户 ID |
| email | VARCHAR(100) | 邮箱地址 |
| verification_code | VARCHAR(10) | 验证码 |
| purpose | VARCHAR(50) | 用途：email_verify\|password_reset |
| expires_at | TIMESTAMP | 过期时间 |
| used_at | TIMESTAMP | 使用时间 |
| created_at | TIMESTAMP | 创建时间 |

---

### 4. Agent 市场表

#### ✅ templates - Agent 模板市场表
**描述**: 可下载的 AI Agent 配置
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 模板 ID (UUID) |
| name | VARCHAR(100) | 模板名称 |
| title | VARCHAR(200) | 显示标题 |
| description | TEXT | 模板描述 |
| system_prompt | TEXT | 系统提示词 |
| model | VARCHAR(100) | 推荐模型 |
| tools | JSONB | 可用工具 |
| temperature | REAL | 温度参数 |
| category | VARCHAR(50) | 分类 |
| tags | JSONB | 标签数组 |
| type | VARCHAR(20) | 类型：public\|private\|premium |
| status | VARCHAR(20) | 状态：pending\|approved\|rejected |
| version | VARCHAR(20) | 版本号 |
| view_count | INTEGER | 浏览次数 |
| download_count | INTEGER | 下载次数 |
| like_count | INTEGER | 点赞数 |
| rating | DECIMAL(3,1) | 评分 (0-10) |
| review_count | INTEGER | 评论数 |
| author_id | UUID | 作者用户 ID |
| features | JSONB | 功能特性 |
| screenshots | JSONB | 截图 |
| demo_url | VARCHAR(500) | 演示地址 |
| documentation | VARCHAR(500) | 文档地址 |
| license | VARCHAR(50) | 许可证 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| published_at | TIMESTAMP | 发布时间 |

#### ✅ template_comments - 模板评论表
**描述**: 用户对模板的评价
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 评论 ID (UUID) |
| template_id | UUID | 模板 ID |
| user_id | UUID | 用户 ID |
| parent_id | UUID | 父评论 ID，支持回复 |
| content | TEXT | 评论内容 |
| rating | DECIMAL(3,1) | 评分 (0-10) |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### ✅ template_ratings - 模板评分表
**描述**: 用户对模板的评分
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 评分 ID (UUID) |
| template_id | UUID | 模板 ID |
| user_id | UUID | 用户 ID |
| rating | DECIMAL(3,1) | 评分 (0-10) |
| created_at | TIMESTAMP | 评分时间 |

#### ✅ template_favorites - 模板收藏表
**描述**: 用户收藏的模板
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 收藏 ID (UUID) |
| template_id | UUID | 模板 ID |
| user_id | UUID | 用户 ID |
| created_at | TIMESTAMP | 收藏时间 |

---

### 5. 高级功能表

#### ✅ folders - 会话文件夹表
**描述**: 用于会话分组管理
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 文件夹 ID (UUID) |
| name | VARCHAR(100) | 文件夹名称 |
| icon | VARCHAR(50) | 图标名称 |
| sort_order | INTEGER | 排序顺序 |
| created_at | TIMESTAMP | 创建时间 |

#### ✅ agents - 自定义 Agent 表
**描述**: 用户创建的 AI Agent 配置
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | Agent ID (UUID) |
| name | VARCHAR(100) | Agent 名称 |
| avatar | VARCHAR(255) | 头像 URL |
| description | TEXT | Agent 描述 |
| system_prompt | TEXT | 系统提示词 |
| model | VARCHAR(100) | 使用的模型 |
| tools | JSONB | 可用工具列表 |
| temperature | REAL | 温度参数 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### ✅ custom_tools - 自定义 API 工具表
**描述**: 用户配置的 API 接口
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 工具 ID (UUID) |
| name | VARCHAR(100) | 工具名称 |
| description | TEXT | 工具描述 |
| method | VARCHAR(10) | HTTP 方法 |
| url | TEXT | API 地址 |
| headers | JSONB | 请求头 |
| params_schema | JSONB | 参数 Schema |
| body_template | TEXT | 请求体模板 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### ✅ workflows - 工作流编排表
**描述**: 定义多步骤任务流程
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 工作流 ID (UUID) |
| name | VARCHAR(100) | 工作流名称 |
| description | TEXT | 工作流描述 |
| nodes | JSONB | 节点定义 |
| edges | JSONB | 连接关系 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### ✅ db_connections - 数据库连接表
**描述**: 外部数据库连接配置
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 连接 ID (UUID) |
| name | VARCHAR(100) | 连接名称 |
| type | VARCHAR(20) | 数据库类型 |
| host | VARCHAR(255) | 主机地址 |
| port | INTEGER | 端口号 |
| database | VARCHAR(100) | 数据库名 |
| username | VARCHAR(100) | 用户名 |
| password | TEXT | 密码（加密） |
| created_at | TIMESTAMP | 创建时间 |

#### ✅ shares - 对话分享表
**描述**: 分享的对话链接
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 分享 ID (UUID) |
| session_id | UUID | 会话 ID |
| share_token | VARCHAR(64) | 分享令牌 |
| password | VARCHAR(100) | 访问密码（加密） |
| expires_at | TIMESTAMP | 过期时间 |
| created_at | TIMESTAMP | 创建时间 |

#### ✅ api_keys - 对外 API Key 表
**描述**: 系统级 API 密钥
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | API Key ID (UUID) |
| key_hash | VARCHAR(64) | 密钥哈希 |
| key_prefix | VARCHAR(16) | 密钥前缀 |
| name | VARCHAR(100) | API Key 名称 |
| created_at | TIMESTAMP | 创建时间 |
| last_used_at | TIMESTAMP | 最后使用时间 |

#### ✅ agent_comments - Agent 评论表
**描述**: 用户对 Agent 的评价
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 评论 ID (UUID) |
| agent_id | UUID | Agent ID |
| user_id | UUID | 用户 ID |
| content | TEXT | 评论内容 |
| created_at | TIMESTAMP | 创建时间 |

#### ✅ agent_ratings - Agent 评分表
**描述**: 用户对 Agent 的评分
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 评分 ID (UUID) |
| agent_id | UUID | Agent ID |
| user_id | UUID | 用户 ID |
| rating | DECIMAL(3,1) | 评分 (0-10) |
| created_at | TIMESTAMP | 评分时间 |

#### ✅ search_histories - 搜索历史表
**描述**: 用户搜索记录
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 搜索记录 ID (UUID) |
| user_id | UUID | 用户 ID |
| query | VARCHAR(500) | 搜索关键词 |
| filters | JSONB | 筛选条件 |
| result_count | INTEGER | 结果数量 |
| created_at | TIMESTAMP | 创建时间 |

#### ✅ analytics - Analytics 分析数据表
**描述**: 系统统计数据
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 分析记录 ID (UUID) |
| metric_name | VARCHAR(100) | 指标名称 |
| metric_value | INTEGER | 指标值 |
| period_start | TIMESTAMP | 周期开始时间 |
| period_end | TIMESTAMP | 周期结束时间 |
| metadata | JSONB | 元数据 |
| created_at | TIMESTAMP | 创建时间 |

#### ✅ skills - Skill 系统表
**描述**: 用户自定义技能
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 技能 ID (UUID) |
| user_id | UUID | 用户 ID |
| name | VARCHAR(100) | 技能名称 |
| description | TEXT | 技能描述 |
| icon | VARCHAR(50) | 图标名称 |
| trigger_keywords | JSONB | 触发关键词 |
| system_prompt | TEXT | 系统提示词 |
| allowed_tools | JSONB | 允许的工具 |
| examples | JSONB | 示例 |
| is_builtin | BOOLEAN | 是否为内置技能 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

---

## 🚀 运行脚本添加注释

### 方法 1: 使用脚本（推荐）

```bash
cd server
npx ts-node scripts/add-table-comments.ts
```

### 方法 2: 手动在数据库中执行

```sql
-- 查看表的注释
SELECT 
    tablename,
    obj_description(oid::regclass) AS table_comment
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 查看字段的注释
SELECT 
    t.tablename,
    a.attname as column_name,
    col_description(a.attrelid, a.attnum) as column_comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
JOIN pg_tables t ON t.tablename = c.relname
WHERE n.nspname = 'public' 
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY t.tablename, a.attnum;

-- 查看特定表的字段注释
SELECT column_name, column_comment 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'sessions';
```

---

## 📊 注释统计

| 类别 | 表数量 | 字段总数 |
|------|--------|----------|
| 核心功能 | 7 | 60+ |
| 知识库功能 | 2 | 14 |
| 用户管理 | 8 | 50+ |
| Agent 市场 | 4 | 40+ |
| 高级功能 | 9 | 60+ |
| **总计** | **30** | **224+** |

---

## ✨ 优势

### 1. 代码可读性
- ✅ 开发者可以快速理解每个字段的作用
- ✅ IDE 智能提示更准确
- ✅ 减少查阅文档的时间

### 2. 维护便利性
- ✅ 新成员快速上手
- ✅ 降低维护成本
- ✅ 减少误解和错误

### 3. 文档自动生成
- ✅ 可与 Swagger 等工具集成
- ✅ 自动生成数据库字典
- ✅ 便于团队协作

### 4. 数据质量
- ✅ 明确的字段定义
- ✅ 减少数据录入错误
- ✅ 便于数据治理

---

## 🎯 最佳实践建议

1. **保持一致性**: 所有表都应该有注释
2. **详细程度**: 表注释描述用途，字段注释说明数据类型和含义
3. **更新同步**: 修改 schema 时同步更新注释
4. **语言统一**: 使用中文注释，便于国内团队沟通

---

## 📝 后续优化

- [ ] 为索引添加注释
- [ ] 为约束添加注释
- [ ] 生成完整的数据库字典文档
- [ ] 集成到 CI/CD 流程中
