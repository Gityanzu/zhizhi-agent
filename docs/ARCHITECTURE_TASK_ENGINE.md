# 异步任务引擎（`/api/tasks`）架构说明

> 本文档说明对话与「编辑重生成」统一后的**异步任务引擎**。旧版 `POST /api/chat/stream` 的内联 HITL（文件操作审批、Plan 前置确认）已从 `chat.ts` 移除，全部收敛到任务引擎；前端主聊天流与编辑重生成均经 `/api/tasks`。`chat.ts` 现仅保留 `/send`（非流式、同步返回、无 HITL）与 `/vision`（多模态）。

## 1. 为什么需要任务引擎

- **中途交互**：文件操作审批（写文件 / 执行命令）、Plan 前置确认都要求「请求中途挂起、等待用户决策后恢复」，同步 HTTP 无法表达。
- **编辑重生成**：需要在后台对新历史重新执行 Agent，且要与消息树（`parentId` / `branchId`）对齐。
- **解耦**：用「任务 + SSE 事件流」把「中途交互」与「请求/响应」解耦——接口立即返回 `taskId`，后续进度通过 SSE 推送给前端。

## 2. 模块划分

| 文件 | 职责 |
|------|------|
| `server/src/routes/task.ts` | HTTP 路由；`handleCreateTask(body, userId)` 抽出为纯函数便于单测 |
| `server/src/services/taskManager.ts` | `TaskManager` 状态机：创建 / 挂起 / 恢复 / 取消 / 记住授权 / 事件广播 |
| `server/src/services/taskRunner.ts` | `runTaskInBackground` 后台执行编排（agent / plan / multi），调用 `requestApproval` / `requestPlanConfirm` |
| `server/src/services/taskStore.ts` | 任务存储（内存为主，元数据持久化 `data/tasks.json`） |
| `server/src/services/history.ts` | `truncateHistoryForEdit` 编辑模式历史截断纯函数 |

## 3. 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/tasks` | 创建任务，body：`{sessionId?, message, mode?, agentId?, collectionIds?, enableThinking?, parentId?, branchId?, isEdit?, editMessageId?, modelParams?}`，立即返回 `{taskId, sessionId}` |
| `GET` | `/api/tasks` | 任务列表（query：`sessionId?`、`status?`） |
| `GET` | `/api/tasks/:id` | 任务详情（`status` / `result` / `error` / `usage`） |
| `GET` | `/api/tasks/:id/events` | SSE 订阅进度（`?cursor=` 断线重连补齐历史事件） |
| `POST` | `/api/tasks/:id/cancel` | 取消任务 |
| `POST` | `/api/tasks/:id/approve` | 审批挂起的文件操作，body：`{approved: boolean, remember?: boolean}`（`remember=true` 记住本会话同类授权，后续不再弹窗） |
| `POST` | `/api/tasks/:id/plan-confirm` | Plan 前置确认，body：`{confirmed: boolean, feedback?: string}` |

## 4. 任务状态机

```
            ┌──────────────┐
            │   pending    │
            └──────┬───────┘
                   │ create
                   ▼
            ┌──────────────┐
   ┌────────│   running    │────────┐
   │        └──────┬───────┘        │
   │               │               │
   │      requestApproval      requestPlanConfirm
   │               │               │
   ▼               ▼               ▼
┌─────────┐  ┌──────────────┐  ┌──────────────────┐
│cancelled│  │ need_approval │  │ need_plan_confirm │
└─────────┘  └──────┬───────┘  └────────┬──────────┘
   ▲                │ resolveApproval    │ resolvePlanConfirm
   │                │ (remember?)        │ (10min 超时自动 cancelled)
   │                ▼                     ▼
   │          ┌──────────────┐    ┌──────────────┐
   └──────────│   running    │<───│   running    │
              └──────┬───────┘    └──────────────┘
                     │
            setStatus(completed | failed)
                     │
                     ▼
              ┌──────────────┐
              │  completed / │
              │   failed /   │
              │  cancelled   │  (终态)
              └──────────────┘
```

状态取值：`pending` | `running` | `need_approval` | `need_plan_confirm` | `completed` | `failed` | `cancelled`。

## 5. HITL：文件操作审批

- Agent 中途要写文件 / 执行命令 → `taskManager.requestApproval(taskId, { kind, ... })`：状态置 `need_approval`，广播 `approval_required`，并阻塞一个 Promise 让 Agent 停在当前步骤。
- 用户操作 → `POST /api/tasks/:id/approve` → `taskManager.resolveApproval(taskId, { approved, remember })`：恢复被阻塞的 Promise（`approved` 决定 Agent 是否继续）。
  - `remember=true` 时调用 `rememberApproval(sessionId, kind)`，同会话同类授权后续不再弹窗（Agent 层命中记忆后直接放行）。
- 无挂起审批时调用 `approve` 返回 `false`（对应端点 409）。

## 6. Plan 前置确认

- `taskManager.requestPlanConfirm(taskId, plan)`：状态置 `need_plan_confirm`，广播 `plan_proposed`，并启动 10 分钟超时（超时自动 `cancelled`）。
- 用户操作 → `POST /api/tasks/:id/plan-confirm` → `taskManager.resolvePlanConfirm(taskId, { confirmed, feedback })`：恢复 Promise，Agent 按确认结果继续或中止。

## 7. 取消

- `POST /api/tasks/:id/cancel` → `taskManager.requestCancel`：
  - 若任务正处于 `need_approval` / `need_plan_confirm`，以 `false` 恢复对应 Promise，让 Agent 感知到「用户取消」并中止。
  - 否则直接置 `cancelled`。

## 8. 编辑 / 分支 / 模型参数

- `parentId` / `branchId`：消息树挂接（编辑 / 重生成时挂到指定父消息与分支）。
- `isEdit` / `editMessageId`：编辑重生成模式；`isEdit=true` 时不新增用户消息（消息已由 `editMessageApi` 更新），`history.ts` 把历史截断到 `editMessageId` 为止。
- `modelParams`：请求级模型参数覆盖（`temperature`、`top_p` 等），仅当为对象时透传。

## 9. SSE 事件流

- `GET /api/tasks/:id/events?cursor=`：SSE，每条 `data` 为 `{seq, ts, type, data}`；`cursor` 用于断线重连补齐历史事件（服务端保留有限环形缓冲）。
- 事件类型：`token` / `tool_call` / `tool_result` / `plan_step` / `planning` / `agent_progress` / `agent_trace` / `approval_required` / `plan_proposed` / `status`。
  - `status` 事件的负载为状态机取值之一；其中 `completed` / `failed` / `cancelled` 表示任务结束。
  - `approval_required` / `plan_proposed` 携带挂起所需上下文（审批 kind / plan 内容）。

## 10. 前端集成要点

- 创建：`POST /api/tasks` → `{taskId, sessionId}`。
- 订阅：`new EventSource('/api/tasks/' + taskId + '/events')`（桌面端经 `hostServer` 同源透传，避免 CORS）。
- 部署：反向代理需对 `/api/tasks/` 关闭 `proxy_buffering` 并拉长 `proxy_read_timeout`（见 `deploy/nginx.conf`），否则 SSE 会被缓冲、进度流卡顿。
- 鉴权：SSE 走同源或带 `?token=`（与 REST 一致的 `optionalAuth`）。
