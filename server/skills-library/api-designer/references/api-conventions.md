# API 规范模板库

## OpenAPI 3.x 骨架

```yaml
openapi: 3.0.3
info:
  title: 订单服务 API
  version: 1.0.0
  description: 契约先行：本文件是唯一事实源，由 CI 校验与实现一致
servers:
  - url: https://api.example.com/v1
tags:
  - name: orders
paths:
  /orders:
    get:
      tags: [orders]
      summary: 订单列表（游标分页）
      parameters:
        - { in: query, name: limit, schema: { type: integer, maximum: 100, default: 20 } }
        - { in: query, name: cursor, schema: { type: string } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/OrderList' } } } }
        default: { $ref: '#/components/responses/Problem' }
    post:
      tags: [orders]
      summary: 创建订单（幂等）
      parameters:
        - { in: header, name: Idempotency-Key, required: true, schema: { type: string, format: uuid } }
      responses:
        '201': { description: Created }
        '409': { description: 幂等键冲突 }
        default: { $ref: '#/components/responses/Problem' }
  /orders/{orderId}:
    get:
      parameters: [{ in: path, name: orderId, required: true, schema: { type: string } }]
      responses:
        '200': { description: OK }
        '404': { $ref: '#/components/responses/Problem' }
components:
  schemas:
    Order:
      type: object
      required: [id, status, createdAt]
      properties:
        id: { type: string, example: ord_8f3k2 }
        status: { type: string, enum: [pending, paid, shipped, done, cancelled] }
        createdAt: { type: string, format: date-time }
    Problem:
      type: object
      description: RFC7807 错误包
      properties:
        type: { type: string, example: https://api.example.com/errors/ORDER.NOT_FOUND }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
        instance: { type: string }
        traceId: { type: string, description: 排障用链路 ID }
```

## HTTP 状态码使用约定

| 码 | 场景 | 常见误用 |
|---|---|---|
| 200 | 查询成功 | 业务失败也返回 200（禁止） |
| 201 | 创建成功 + Location 头 | |
| 202 | 异步受理 | |
| 400 | 参数校验失败（列字段级错误） | 把业务规则错误塞进 400 |
| 401 / 403 | 未登录 / 无权限 | 混用 |
| 404 | 资源不存在 **或不允许知道存在** | 越权访问回 404 是特性不是 bug |
| 409 | 状态冲突（重复提交/乐观锁） | |
| 422 | 语义校验失败（可选） | |
| 429 | 限流 + Retry-After | |
| 5xx | 只对"服务器自己坏了"使用 | 下游业务错误透传成 500 |

## 错误码字典设计

`<域>.<简述>` 大写下划线：`AUTH.TOKEN_EXPIRED`、`PAY.CHANNEL_UNAVAILABLE`。
规则：①对客户端有行为意义的错误必须有独立码；②纯提示类可共用 `COMMON.VALIDATION_FAILED` + details。
