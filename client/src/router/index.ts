import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { getToken } from '@/api/request';

// 路由配置
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录 - 智知 Agent', public: true },
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('@/views/ForgotPasswordView.vue'),
    meta: { title: '忘记密码 - 智知 Agent', public: true },
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('@/views/ResetPasswordView.vue'),
    meta: { title: '重置密码 - 智知 Agent', public: true },
  },
  {
    path: '/change-password',
    name: 'ChangePassword',
    component: () => import('@/views/ChangePasswordView.vue'),
    meta: { title: '修改密码 - 智知 Agent' },
  },
  {
    path: '/',
    redirect: '/chat',
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/ChatView.vue'),
    meta: { title: '智知 - 智能问答' },
  },
  // 预留后续页面路由
  {
    path: '/workspace',
    name: 'Workspace',
    component: () => import('@/views/WorkspaceView.vue'),
    meta: { title: '工作台' },
  },
  {
    path: '/code-workbench',
    name: 'CodeWorkbench',
    component: () => import('@/views/CodeWorkbenchView.vue'),
    meta: { title: '代码工作台' },
  },
  {
    path: '/agents',
    name: 'Agents',
    component: () => import('@/views/AgentsView.vue'),
    meta: { title: 'Agent 市场' },
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('@/views/AgentSearchView.vue'),
    meta: { title: '搜索 Agent' },
  },
  {
    path: '/agents/:id',
    name: 'AgentDetail',
    component: () => import('@/views/AgentDetailView.vue'),
    meta: { title: 'Agent 详情' },
  },
  {
    path: '/knowledge',
    name: 'Knowledge',
    component: () => import('@/views/KnowledgeView.vue'),
    meta: { title: '知识库' },
  },
  {
    path: '/workflow',
    name: 'Workflow',
    component: () => import('@/views/WorkflowView.vue'),
    meta: { title: '工作流编辑器' },
  },
  {
    path: '/analytics',
    name: 'Analytics',
    component: () => import('@/views/AnalyticsView.vue'),
    meta: { title: '数据分析' },
  },
  {
    path: '/monitor',
    name: 'Monitor',
    component: () => import('@/views/MonitorView.vue'),
    meta: { title: '监控' },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置' },
  },
  // 404
  {
    path: '/:pathMatch(.*)*',
    redirect: '/chat',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  // 切换页面时滚动到顶部
  scrollBehavior() {
    return { top: 0 }
  },
});

// 动态设置页面标题 + 登录拦截
router.beforeEach((to, _from, next) => {
  document.title = (to.meta.title as string) || '智知 AI Agent';

  const isPublic = to.meta.public === true;
  // 以本地 token 作为登录判据（避免 init() 异步拉取 user 未就绪时误判）
  const authed = !!getToken();

  // 未登录访问受保护页面 → 重定向登录页，并记录来源以便登录后回跳
  if (!isPublic && !authed) {
    const redirect = to.fullPath && to.fullPath !== '/chat' ? { redirect: to.fullPath } : {};
    return next({ path: '/login', query: redirect });
  }

  // 已登录仍访问登录/注册类页面 → 直接回聊天
  if (authed && (to.path === '/login' || to.path === '/forgot-password' || to.path === '/reset-password')) {
    return next({ path: '/chat' });
  }

  next();
});

export default router;
