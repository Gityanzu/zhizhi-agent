# 代码开发规范

## 概述

本规范结合了 Vue 3、TypeScript、Express、ESLint、Prettier 等主流技术和工具的最佳实践，确保代码的一致性、可维护性和可读性。

---

## 1. 项目结构规范

### 1.1 前端目录结构

```
client/
├── src/
│   ├── api/              # API 接口层
│   │   ├── request.ts    # Axios 实例配置
│   │   ├── auth.ts       # 认证相关 API
│   │   ├── userApiKey.ts # 用户 API Key 管理
│   │   └── *.ts          # 按模块划分的 API 文件
│   ├── components/       # 组件目录
│   │   ├── common/       # 通用组件
│   │   ├── chat/         # 聊天相关组件
│   │   ├── agent/        # Agent 相关组件
│   │   ├── knowledge/    # 知识库组件
│   │   └── settings/     # 设置相关组件
│   ├── composables/      # 组合式函数
│   ├── views/            # 页面视图
│   ├── stores/           # Pinia 状态管理
│   ├── types/            # TypeScript 类型定义
│   ├── router/           # Vue Router 配置
│   ├── utils/            # 工具函数
│   ├── assets/           # 静态资源
│   ├── App.vue           # 根组件
│   └── main.ts           # 入口文件
├── public/               # 公共静态资源
└── package.json
```

### 1.2 后端目录结构

```
server/
├── src/
│   ├── routes/           # 路由定义
│   ├── services/         # 业务逻辑层
│   │   ├── vectorStore.ts  # 向量数据库服务
│   │   ├── llm.ts          # LLM 接口服务
│   │   ├── llmProvider.ts  # LLM 提供商适配
│   │   ├── auth.ts         # 认证服务
│   │   └── *.ts            # 其他业务服务
│   ├── middleware/       # 中间件
│   ├── db.ts             # 数据库配置
│   ├── config.ts         # 配置文件
│   ├── mcp/              # MCP 协议实现
│   ├── public/           # 公共静态文件
│   ├── tests/            # 测试文件
│   ├── index.ts          # 入口文件
│   └── utils.ts          # 工具函数
├── node_modules/
├── data/                 # 数据目录
├── tests/                # 测试文件
└── package.json
```

---

## 2. TypeScript 编码规范

### 2.1 类型定义

**使用接口定义对象结构，类型别名定义联合类型或基础类型：**

```typescript
// ✅ 推荐：接口定义对象结构
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// ✅ 推荐：类型别名定义联合类型
type UserRole = 'admin' | 'user' | 'guest';
type Status = 'pending' | 'active' | 'inactive';

// ✅ 推荐：类型别名定义复杂类型
type ApiResponse<T> = {
  data: T;
  message: string;
  success: boolean;
};
```

### 2.2 变量声明

**使用 `const` 而非 `let`，避免隐式 any：**

```typescript
// ✅ 推荐：使用 const 声明常量
const API_BASE_URL = 'http://localhost:3001';
const MAX_RETRY_COUNT = 3;

// ✅ 推荐：显式指定类型
const userId: string = '123';

// ❌ 避免：使用 let 和隐式 any
let userId = '123'; // 隐式 any
let result: any = someFunction(); // 避免 any
```

### 2.3 函数定义

**使用 TypeScript 类型注解，保持函数签名清晰：**

```typescript
// ✅ 推荐：完整类型注解
interface RequestBody {
  name: string;
  age: number;
}

interface Response {
  success: boolean;
  data?: RequestBody;
}

function createUser(data: RequestBody): Promise<Response> {
  return api.post('/users', data);
}

// ✅ 推荐：箭头函数
const getUserById = async (id: string): Promise<User> => {
  return api.get(`/users/${id}`);
};

// ✅ 推荐：可选参数和默认参数
function createUser(
  name: string,
  role: UserRole = 'user',
  isActive: boolean = true
): User {
  // ...
}
```

### 2.4 枚举使用

**使用枚举替代魔法字符串：**

```typescript
// ✅ 推荐：使用枚举
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

enum StatusCode {
  SUCCESS = 200,
  NOT_FOUND = 404,
  SERVER_ERROR = 500,
}

// ❌ 避免：魔法字符串
if (role === 'admin') { }
if (status === 200) { }
```

---

## 3. Vue 3 组件规范

### 3.1 组件命名

**使用 PascalCase 命名，以大写字母开头：**

```vue
<!-- ✅ 推荐：PascalCase -->
<template>
  <MessageItem :message="message" />
  <AgentSelector :selected="selected" />
  <ChatArea />
</template>
```

### 3.2 组件结构

**遵循单文件组件结构：SFC 结构（script setup 优先）**

```vue
<script setup lang="ts">
// 1. 导入依赖
import { ref, computed, onMounted } from 'vue';
import type { User } from '@/types/user';

// 2. 定义 Props
interface Props {
  user: User;
  active?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  active: false,
});

// 3. 定义 Emits
interface Emits {
  (e: 'update', value: string): void;
  (e: 'delete'): void;
}
const emit = defineEmits<Emits>();

// 4. 响应式状态
const count = ref(0);
const searchText = ref('');

// 5. 计算属性
const doubleCount = computed(() => count.value * 2);

// 6. 方法
const increment = () => {
  count.value++;
};

// 7. 生命周期钩子
onMounted(() => {
  console.log('组件已挂载');
});
</script>

<template>
  <!-- 模板内容 -->
</template>

<style scoped>
/* 样式内容 */
</style>
```

### 3.3 Props 定义

**使用 `defineProps` 类型化定义：**

```typescript
// ✅ 推荐：完整类型注解
interface Props {
  title: string;
  count?: number;
  items: string[];
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
});
```

### 3.4 组件通讯

**使用 v-model 进行双向绑定：**

```vue
<script setup lang="ts">
interface Props {
  modelValue: string;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const handleChange = (value: string) => {
  emit('update:modelValue', value);
};
</script>

<template>
  <input
    :value="modelValue"
    @input="handleChange"
  />
</template>
```

### 3.5 Composables 使用

**遵循组合式函数命名约定：**

```typescript
// ✅ 推荐：useXxx 命名
export function useUser() {
  const user = ref<User | null>(null);
  const loading = ref(false);

  const fetchUser = async (id: string) => {
    loading.value = true;
    try {
      user.value = await api.getUser(id);
    } finally {
      loading.value = false;
    }
  };

  return { user, loading, fetchUser };
}

// ✅ 推荐：可复用的 hook
export function useIsMobile() {
  const isMobile = ref(window.innerWidth < 768);

  const handleResize = () => {
    isMobile.value = window.innerWidth < 768;
  };

  onMounted(() => {
    window.addEventListener('resize', handleResize);
  });

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
  });

  return isMobile;
}
```

---

## 4. API 层规范

### 4.1 Axios 实例配置

**统一配置，添加拦截器：**

```typescript
// client/src/api/request.ts
import axios from 'axios';

const TOKEN_KEY = 'zhizhi_agent_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// 统一 axios 实例
export const api = axios.create({
  baseURL: '/api',
  timeout: 300000,
});

// 请求拦截器
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export async function healthCheck() {
  const res = await api.get('/health');
  return res.data;
}
```

### 4.2 API 模块划分

**按模块组织 API 请求：**

```typescript
// client/src/api/user.ts
import { api } from './request';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await api.post('/auth/login', data);
  return res.data;
}

export async function getUserInfo(): Promise<User> {
  const res = await api.get('/user/info');
  return res.data;
}
```

---

## 5. Express 后端规范

### 5.1 路由组织

**模块化路由，按功能分组：**

```typescript
// server/src/routes/index.ts
import express from 'express';
import { router as authRoutes } from './auth';
import { router as userRoutes } from './user';
import { router as chatRoutes } from './chat';
// ... 其他路由

const router = express.Router();

// API 路由
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/chat', chatRoutes);

export { router as apiRoutes };
```

### 5.2 路由处理器

**使用 async/await，返回标准响应格式：**

```typescript
// server/src/routes/chat.ts
import express from 'express';
import { chatService } from '../services/chat';

const router = express.Router();

// 聊天接口
router.post('/message', async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({
        error: '消息内容不能为空',
      });
    }

    const result = await chatService.processMessage(message, sessionId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// SSE 流式接口
router.post('/stream', async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await chatService.streamMessage(message, sessionId, res);
  } catch (error) {
    next(error);
  }
});

export { router as chatRoutes };
```

### 5.3 中间件使用

**按顺序组织中间件：**

```typescript
// 1. 错误处理中间件（最后）
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('未处理的错误:', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: '服务器内部错误',
    ...(!isProd && { detail: err.message }),
  });
});

// 2. 路由中间件
app.use('/api/chat', chatRoutes);

// 3. JSON 解析中间件
app.use(express.json({ limit: '10mb' }));

// 4. CORS 中间件
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('不允许的跨域来源'));
    }
  },
  credentials: true,
}));
```

---

## 6. Pinia 状态管理规范

### 6.1 Store 命名

**使用 useXxx 命名：**

```typescript
// client/src/stores/auth.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login, logout, getUserInfo } from '@/api/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem('zhizhi_agent_token'));
  const loading = ref(false);

  const isLoggedIn = computed(() => !!token.value);

  const loginAction = async (credentials: LoginRequest) => {
    loading.value = true;
    try {
      const res = await login(credentials);
      token.value = res.token;
      localStorage.setItem('zhizhi_agent_token', res.token);
      user.value = res.user;
    } finally {
      loading.value = false;
    }
  };

  const logoutAction = async () => {
    await logout();
    token.value = null;
    user.value = null;
    localStorage.removeItem('zhizhi_agent_token');
  };

  const fetchUserInfo = async () => {
    loading.value = true;
    try {
      user.value = await getUserInfo();
    } finally {
      loading.value = false;
    }
  };

  return {
    user,
    token,
    loading,
    isLoggedIn,
    loginAction,
    logoutAction,
    fetchUserInfo,
  };
});
```

### 6.2 使用 Store

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const handleLogin = async () => {
  await authStore.loginAction({ username: 'admin', password: '123456' });
};
</script>
```

---

## 7. Git 提交规范

### 7.1 提交信息格式

**使用 Conventional Commits 规范：**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 类型：**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式调整（不影响功能）
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建、工具链相关

**示例：**

```bash
# 新功能
git commit -m "feat(auth): 添加 JWT 认证中间件"

# Bug 修复
git commit -m "fix(chat): 修复流式响应中断问题"

# 文档更新
git commit -m "docs(readme): 更新安装和使用说明"

# 代码重构
git commit -m "refactor(api): 重构 API 响应格式"

# 性能优化
git commit -m "perf(chat): 优化长文本处理性能"
```

---

## 8. 命名规范

### 8.1 文件命名

**使用小写字母、连字符分隔：**

```
✅ 推荐：
  - user-api.ts
  - auth-service.ts
  - chat-panel.vue
  - config.ts

❌ 避免：
  - UserApi.ts
  - auth_service.ts
  - ChatPanel.vue
  - Config.ts
```

### 8.2 变量和函数命名

**使用 camelCase：**

```typescript
✅ 推荐：
  const userName = 'John';
  const getUserInfo = async () => {};
  const MAX_RETRY = 3;

❌ 避免：
  const UserName = 'John';
  const get_user_info = async () => {};
```

### 8.3 类和接口命名

**使用 PascalCase：**

```typescript
✅ 推荐：
  class UserService {}
  interface UserResponse {}
  enum UserRole {}

❌ 避免：
  class userService {}
  interface user_response {}
```

---

## 9. 代码注释规范

### 9.1 函数注释

**使用 JSDoc 注释：**

```typescript
/**
 * 用户登录
 * @param credentials - 登录凭证
 * @returns Promise<LoginResponse>
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  // ...
}
```

### 9.2 复杂逻辑注释

**解释"为什么"而不是"是什么"：**

```typescript
// ❌ 避免：解释显而易见的逻辑
const count = 0; // 计数器

// ✅ 推荐：解释复杂逻辑和决策
// 使用 localStorage 存储 token 而非内存，以便在页面刷新后保持登录状态
const token = localStorage.getItem(TOKEN_KEY);
```

---

## 10. 环境变量规范

### 10.1 变量命名

**使用大写下划线格式：**

```typescript
// ✅ 推荐
VITE_API_BASE_URL
VITE_APP_TITLE
NODE_ENV
DATABASE_URL
```

### 10.2 .env 文件示例

```bash
# .env.development
VITE_API_BASE_URL=http://localhost:3001
VITE_APP_TITLE=智知 - 企业知识库智能问答 Agent

# .env.production
VITE_API_BASE_URL=https://api.example.com
VITE_APP_TITLE=智知
```

---

## 11. 错误处理

### 11.1 统一错误处理

**前端：使用 try-catch 和 axios 拦截器**

```typescript
try {
  const data = await api.get('/users/1');
} catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) {
      // 处理 404
    } else if (error.response?.status === 500) {
      // 处理 500
    }
  }
}
```

**后端：使用 express 错误处理中间件**

```typescript
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('未处理的错误:', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: '服务器内部错误',
    ...(!isProd && { detail: err.message }),
  });
});
```

---

## 12. 性能优化

### 12.1 前端优化

- 使用 `v-memo` 缓存重复渲染
- 使用 `v-once` 缓存静态内容
- 使用 `v-show` 替代 `v-if` 控制频繁切换的元素
- 使用 `keep-alive` 缓存页面状态

### 12.2 后端优化

- 使用连接池（如 mysql2）
- 使用流式处理（如 SSE）
- 实现缓存机制（如 Redis）
- 添加速率限制

---

## 13. 安全规范

### 13.1 认证授权

- 所有 API 需要认证（Bearer Token）
- 使用 HTTPS
- 实现权限控制
- 输入验证和过滤（XSS、SQL 注入防护）

### 13.2 敏感信息

- 不在前端存储敏感信息
- 使用环境变量管理密钥
- 定期轮换密钥

---

## 14. 测试规范

### 14.1 单元测试

**示例（后端）：**

```typescript
// tests/auth.test.ts
import { expect, describe, it, beforeEach, vi } from 'vitest';
import { login } from '../src/services/auth';

describe('auth service', () => {
  it('should login successfully', async () => {
    const user = await login({ username: 'admin', password: '123' });
    expect(user).toHaveProperty('token');
  });
});
```

---

## 15. Linting 和 Formatting

### 15.1 推荐配置

- **前端**：ESLint + Prettier + Vue / TypeScript 推荐配置
- **后端**：ESLint + Prettier + TypeScript 推荐配置

### 15.2 推荐插件

**前端：**
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `eslint-plugin-vue`
- `prettier`

**后端：**
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `prettier`

---

## 16. 代码审查清单

在提交代码前，请检查：

- [ ] 代码是否符合本规范
- [ ] 添加了必要的类型注解
- [ ] 添加了必要的注释
- [ ] 函数和变量命名规范
- [ ] 错误处理完善
- [ ] 没有使用 any 类型（除非必要）
- [ ] 没有 console.log 等调试代码
- [ ] 添加了必要的单元测试
- [ ] 更新了相关文档

---

**Co-Authored-By: Claude Code <noreply@anthropic.com>**
