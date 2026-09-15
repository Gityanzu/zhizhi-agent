# API 设计规范

## 概述

本规范遵循 RESTful API 设计原则，确保 API 的可读性、一致性和可维护性。适用于前后端分离架构。

---

## 1. 设计原则

### 1.1 资源导向

API 应围绕资源设计，使用名词而非动词：

```bash
# ✅ 推荐：使用名词
GET    /api/users          # 获取用户列表
GET    /api/users/:id      # 获取单个用户
POST   /api/users          # 创建用户
PUT    /api/users/:id      # 更新用户
DELETE /api/users/:id      # 删除用户

# ❌ 避免：使用动词
GET    /api/getUsers       # 不推荐
POST   /api/createUser     # 不推荐
DELETE /api/deleteUser     # 不推荐
```

### 1.2 无状态

服务器不应保存客户端的会话状态，每个请求包含所有必要信息：

```typescript
// ✅ 推荐：客户端携带所有信息
POST /api/auth/login
{
  "username": "admin",
  "password": "123456"
}

// ❌ 避免：依赖服务器会话
POST /api/auth/login
{
  "username": "admin"  // 服务器记住这个用户
}
```

### 1.3 统一响应格式

所有 API 返回统一的响应格式：

```typescript
// 成功响应
{
  "code": 200,
  "message": "success",
  "data": { ... }
}

// 错误响应
{
  "code": 400,
  "message": "参数错误",
  "error": { ... }
}

// 分页响应
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 10
  }
}
```

---

## 2. URL 设计规范

### 2.1 基础格式

```
https://api.example.com/v1/{resource}/{id}
```

### 2.2 RESTful 端点

| HTTP 方法 | 端点 | 说明 |
|-----------|------|------|
| `GET` | `/api/users` | 获取用户列表 |
| `GET` | `/api/users/:id` | 获取单个用户 |
| `POST` | `/api/users` | 创建用户 |
| `PUT` | `/api/users/:id` | 完整更新用户 |
| `PATCH` | `/api/users/:id` | 部分更新用户 |
| `DELETE` | `/api/users/:id` | 删除用户 |

### 2.3 集合操作

```bash
# 查询过滤
GET /api/users?name=John&role=admin

# 排序
GET /api/users?sort=createdAt&order=desc

# 分页
GET /api/users?page=1&pageSize=10

# 复合查询
GET /api/users?name=John&role=admin&page=1&pageSize=10&sort=createdAt&order=desc
```

### 2.4 子资源

```bash
# 获取用户的项目
GET /api/users/:userId/projects

# 获取用户的项目详情
GET /api/users/:userId/projects/:projectId

# 为用户添加项目
POST /api/users/:userId/projects
```

### 2.5 关联操作

```bash
# 给用户分配角色
POST /api/users/:userId/roles
{
  "roleId": "role-123"
}

# 获取用户的角色
GET /api/users/:userId/roles
```

---

## 3. HTTP 方法规范

### 3.1 GET

**用途**：查询资源，不应修改服务器状态

```bash
GET /api/users/:id
GET /api/users?name=John
GET /api/users/:id/documents
```

**响应：**

```typescript
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "user-123",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### 3.2 POST

**用途**：创建新资源

```bash
POST /api/users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "123456"
}
```

**响应：**

```typescript
{
  "code": 201,
  "message": "用户创建成功",
  "data": {
    "id": "user-123",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### 3.3 PUT

**用途**：完整更新资源（替换整个资源）

```bash
PUT /api/users/:id
Content-Type: application/json

{
  "id": "user-123",
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

### 3.4 PATCH

**用途**：部分更新资源

```bash
PATCH /api/users/:id
Content-Type: application/json

{
  "name": "Jane Doe"
}
```

### 3.5 DELETE

**用途**：删除资源

```bash
DELETE /api/users/:id
```

**响应：**

```typescript
{
  "code": 204,
  "message": "删除成功"
}
```

---

## 4. 状态码规范

### 4.1 成功响应

| 状态码 | 说明 | 使用场景 |
|--------|------|----------|
| `200 OK` | 请求成功 | GET 请求 |
| `201 Created` | 资源已创建 | POST 请求成功 |
| `204 No Content` | 请求成功，无返回内容 | DELETE 请求成功 |
| `206 Partial Content` | 部分内容 | 分页、范围请求 |

### 4.2 客户端错误

| 状态码 | 说明 | 使用场景 |
|--------|------|----------|
| `400 Bad Request` | 请求参数错误 | 参数验证失败 |
| `401 Unauthorized` | 未授权 | Token 过期、未登录 |
| `403 Forbidden` | 禁止访问 | 权限不足 |
| `404 Not Found` | 资源不存在 | ID 不存在 |
| `422 Unprocessable Entity` | 请求格式正确但语义错误 | 验证失败 |
| `429 Too Many Requests` | 请求过于频繁 | 限流 |

### 4.3 服务器错误

| 状态码 | 说明 | 使用场景 |
|--------|------|----------|
| `500 Internal Server Error` | 服务器内部错误 | 代码错误、数据库错误 |
| `502 Bad Gateway` | 网关错误 | 上游服务不可用 |
| `503 Service Unavailable` | 服务不可用 | 维护中、过载 |
| `504 Gateway Timeout` | 网关超时 | 请求超时 |

---

## 5. 错误响应格式

### 5.1 标准错误响应

```typescript
{
  "code": 400,
  "message": "参数错误",
  "error": {
    "field": "email",
    "message": "邮箱格式不正确"
  }
}
```

### 5.2 自定义错误响应

```typescript
// 参数验证错误
{
  "code": 422,
  "message": "验证失败",
  "errors": [
    {
      "field": "email",
      "message": "邮箱格式不正确"
    },
    {
      "field": "password",
      "message": "密码长度至少 8 位"
    }
  ]
}

// 未授权错误
{
  "code": 401,
  "message": "未授权访问",
  "error": {
    "type": "INVALID_TOKEN",
    "description": "Token 已过期，请重新登录"
  }
}

// 权限错误
{
  "code": 403,
  "message": "权限不足",
  "error": {
    "required": "admin",
    "current": "user"
  }
}
```

---

## 6. 认证和授权

### 6.1 Token 认证

**请求头：**

```bash
GET /api/users/:id
Authorization: Bearer <token>
```

### 6.2 API Key 认证

**请求头：**

```bash
GET /api/documents
X-API-Key: <api-key>
```

### 6.3 OAuth 2.0

**请求头：**

```bash
GET /api/me
Authorization: Bearer <access-token>
```

---

## 7. 分页规范

### 7.1 查询参数

```bash
GET /api/users?page=1&pageSize=10&sort=createdAt&order=desc
```

### 7.2 响应格式

```typescript
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "1",
        "name": "User 1"
      },
      {
        "id": "2",
        "name": "User 2"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 10,
    "totalPages": 10,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## 8. 过滤和排序

### 8.1 过滤

```bash
# 简单过滤
GET /api/users?role=admin

# 多个条件
GET /api/users?name=John&role=admin&status=active

# 范围查询
GET /api/users?createdAt[gte]=2024-01-01&createdAt[lte]=2024-12-31

# 模糊搜索
GET /api/users?search=John
```

### 8.2 排序

```bash
# 升序
GET /api/users?sort=createdAt&order=asc

# 降序
GET /api/users?sort=createdAt&order=desc

# 多字段排序
GET /api/users?sort=createdAt,order=desc&sort=name,order=asc
```

---

## 9. 版本控制

### 9.1 URL 版本

```bash
GET /api/v1/users
GET /api/v2/users
```

### 9.2 Header 版本

```bash
GET /api/users
Accept: application/vnd.api+json; version=2
```

### 9.3 版本管理

```
/api/
  /v1/          # 旧版本
  /v2/          # 当前版本
  /v3/          # 下一个版本（未来）
```

---

## 10. 文档

### 10.1 OpenAPI 规范

使用 OpenAPI (Swagger) 定义 API 文档：

```yaml
openapi: 3.0.0
info:
  title: 用户 API
  version: 1.0.0
paths:
  /users:
    get:
      summary: 获取用户列表
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: pageSize
          in: query
          schema:
            type: integer
            default: 10
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'
```

### 10.2 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "user-123",
        "name": "John Doe",
        "email": "john@example.com"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 10
  }
}
```

---

## 11. 请求和响应示例

### 11.1 创建用户

**请求：**

```bash
POST /api/users
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepass123",
  "role": "user"
}
```

**响应：**

```json
{
  "code": 201,
  "message": "用户创建成功",
  "data": {
    "id": "user-123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 11.2 更新用户

**请求：**

```bash
PATCH /api/users/user-123
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Jane Doe",
  "role": "admin"
}
```

**响应：**

```json
{
  "code": 200,
  "message": "用户更新成功",
  "data": {
    "id": "user-123",
    "name": "Jane Doe",
    "email": "john@example.com",
    "role": "admin",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

### 11.3 删除用户

**请求：**

```bash
DELETE /api/users/user-123
Authorization: Bearer <token>
```

**响应：**

```json
{
  "code": 204,
  "message": "删除成功"
}
```

### 11.4 获取用户详情

**请求：**

```bash
GET /api/users/user-123
Authorization: Bearer <token>
```

**响应：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "user-123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "admin",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

---

## 12. 错误处理

### 12.1 通用错误处理

```typescript
// 服务器错误
{
  "code": 500,
  "message": "服务器内部错误",
  "error": {
    "type": "INTERNAL_ERROR",
    "message": "Database connection failed",
    "trace": "..." // 生产环境不返回
  }
}

// 参数错误
{
  "code": 400,
  "message": "参数错误",
  "error": {
    "field": "email",
    "message": "邮箱格式不正确"
  }
}

// 未找到错误
{
  "code": 404,
  "message": "资源不存在",
  "error": {
    "resource": "user",
    "id": "user-123"
  }
}

// 认证失败
{
  "code": 401,
  "message": "未授权访问",
  "error": {
    "type": "INVALID_TOKEN",
    "message": "Token 已过期",
    "retry": true
  }
}
```

### 12.2 错误处理中间件

```typescript
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('未处理的错误:', err);

  // 生产环境不返回详细错误信息
  const isProd = process.env.NODE_ENV === 'production';

  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    ...(!isProd && {
      error: {
        type: 'INTERNAL_ERROR',
        message: err.message,
      }
    })
  });
});
```

---

## 13. 性能优化

### 13.1 分页

- 使用游标分页替代 offset 分页（大数据集）
- 设置合理的默认 pageSize

### 13.2 响应缓存

```typescript
// 缓存控制
app.use('/api/users', cacheControl({
  maxAge: 60 * 5, // 5 分钟
}));
```

### 13.3 压缩

```typescript
app.use(compression());
```

---

## 14. 安全性

### 14.1 输入验证

```typescript
// 使用 Joi 或 Zod 验证
const schema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});
```

### 14.2 输出过滤

```typescript
// 隐藏敏感字段
const safeUser = {
  id: user.id,
  name: user.name,
  email: user.email,
  // 不返回 password、token 等敏感信息
};
```

---

## 15. 实现示例

### 15.1 Express 路由

```typescript
import express from 'express';
import { userService } from '../services/user';

const router = express.Router();

// 获取用户列表
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, sort = 'createdAt', order = 'desc', ...filters } = req.query;

    const result = await userService.list({
      page: Number(page),
      pageSize: Number(pageSize),
      sort,
      order,
      filters,
    });

    res.json({
      code: 200,
      message: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// 获取单个用户
router.get('/:id', async (req, res, next) => {
  try {
    const user = await userService.findById(req.params.id);
    res.json({
      code: 200,
      message: 'success',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// 创建用户
router.post('/', async (req, res, next) => {
  try {
    const user = await userService.create(req.body);
    res.status(201).json({
      code: 201,
      message: '用户创建成功',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// 更新用户
router.put('/:id', async (req, res, next) => {
  try {
    const user = await userService.update(req.params.id, req.body);
    res.json({
      code: 200,
      message: '用户更新成功',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// 删除用户
router.delete('/:id', async (req, res, next) => {
  try {
    await userService.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { router as userRoutes };
```

---

## 16. 最佳实践

### ✅ 做什么

1. 使用 RESTful 设计
2. 统一响应格式
3. 合理使用 HTTP 方法
4. 返回适当的 HTTP 状态码
5. 提供详细的错误信息
6. 添加 API 文档
7. 进行版本控制
8. 实现分页和过滤
9. 添加认证和授权
10. 进行输入验证

### ❌ 避免什么

1. 使用动词作为 URL
2. 返回任意格式的响应
3. 混合使用 PUT 和 PATCH
4. 使用 200 表示错误
5. 隐藏错误信息
6. 没有文档
7. 没有版本控制
8. 没有分页
9. 暴露敏感信息
10. 不进行输入验证

---

**Co-Authored-By: Claude Code <noreply@anthropic.com>**
