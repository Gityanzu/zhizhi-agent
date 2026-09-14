import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

// 路由配置
const routes: RouteRecordRaw[] = [
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
    path: '/agents',
    name: 'Agents',
    component: () => import('@/views/AgentsView.vue'),
    meta: { title: 'Agent 市场' },
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

// 动态设置页面标题
router.beforeEach((to, _from, next) => {
  document.title = (to.meta.title as string) || '智知 AI Agent';
  next();
});

export default router;
