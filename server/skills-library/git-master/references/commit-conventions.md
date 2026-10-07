# Git 工程约定速查

## 分支策略选型

| 策略 | 适用 | 特征 |
|---|---|---|
| Trunk-Based | 持续部署、高成熟度 CI、小步提交 | 主干常驻可发布，分支存活 <2 天，配特性开关 |
| Release Branch | 定期发版（App/私有化交付） | main 开发，切 `release/1.2` 冻结测试，补丁双合 |
| Git Flow | 多版本并行维护、强监管行业 | 五类分支重流程；互联网团队慎用（已推送的历史不要 rebase） |

**冲突预防**：分支活得越久，合并越痛——大功能拆纵向小步（按行为切，不按文件层切）。

## Tag 与发布

```bash
git tag -a v1.2.0 -m "feat: 会话导出 + fix: 登录限流"   # 附注标签（带作者/日期）
git push origin v1.2.0
# 版本号来源：CHANGELOG 顶部条目 = 最新 tag = 部署产物版本，三者必须一致
```

## 常用救场命令（附风险说明）

| 场景 | 命令 | 注意 |
|---|---|---|
| 提交信息写错（未推送） | `git commit --amend` | 已推送禁 amend |
| 文件误删找回 | `git restore <file>` / `git checkout -- <file>` | 未暂存的删除找不回 |
| 撤掉暂存 | `git restore --staged <file>` | 只退暂存不丢改动 |
| 撤销某提交（已推送） | `git revert <sha>` | 生成新提交，历史安全 |
| 本地分支拉回某提交 | `git reset --soft HEAD~1` | `--hard` 会丢工作区，慎用 |
| 提交混进了密钥 | `git filter-repo`（新工具）清除历史 + 立刻轮换该密钥 | BFG 亦可；清除后所有协作者需重克隆 |

## 提交拆分实操示例

现场：改完登录逻辑，顺手格式化了 30 个文件，还升级了 package-lock。

```bash
# 提交 1：纯格式化（review 时可跳过）
git add -p server/src    # 只选格式化块
git commit -m "chore: 统一 server 端代码格式（prettier）"
# 提交 2：依赖升级单独走，出问题好回滚
git add server/package-lock.json && git commit -m "build: 升级 pg 至 8.13，修复连接泄漏"
# 提交 3：真正的功能
git add -p && git commit  # feat(auth): …
```

## 评审约定

- PR 标题沿用 Conventional 格式（squash 合并时直接成为提交信息）
- 默认评审窗口 24h 内；超 400 行的 PR 先要求拆分再评审
- CI 三件套底线：构建 + 测试 + lint；另加提交信息格式校验（commitlint）
