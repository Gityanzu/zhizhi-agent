# 技能库（SKILL.md 文件化技能）

对标 Claude Skills 的文件驱动技能机制：**一个文件夹 = 一个技能，改文件即改技能，热加载无需重启**。

## 目录结构

```
skills-library/
  <skill-id>/
    SKILL.md            # 必需：frontmatter 元数据 + 正文（system prompt）
    references/*.md     # 可选：深度文档（详情页渐进披露，人工阅读）
```

## SKILL.md 格式

```markdown
---
id: my-skill                # 缺省用文件夹名
name: 我的技能
description: 一句话描述（列表页展示）
icon: 🛠️
version: 1.0.0
trigger_keywords: [关键词1, 关键词2]   # 行内数组或 "-" 列表均可
allowed_tools: [read_file, write_file] # 空 = 全部工具可用
---

正文 Markdown 即该技能的 system prompt。
```

## 加载规则

- 启动时扫描；`POST /api/skill/reload` 热加载
- 优先级：**文件库 > 代码内置**（同 id 覆盖，如用文件定制 `coding` 技能）；PG 自定义技能不覆盖同 id 文件技能
- 额外目录：桌面端 `userData/skills/`、环境变量 `ZHI_SKILLS_DIR`

## 内置技能清单

| id | 名称 | 核心工具 |
|---|---|---|
| rag-search | RAG 文档检索 | search_knowledge_base |
| doc-parser | 文档解析 | parse_document |
| code-review | 代码审查 | read_file / search_files |
| test-writer | 单元测试生成 | code_interpreter / create_file |
| debugger | 调试专家 | code_interpreter / run_shell |
| api-designer | API与方案设计 | create_file / write_file |
| sql-analyst | SQL 数据分析 | text_to_sql / calculate |
| git-master | Git 提交规范 | read_file / write_file |
