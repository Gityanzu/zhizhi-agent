<template>
  <div class="page-layout">
    <Sidebar />
    <div class="page-content">
      <!-- 顶部导航栏 -->
      <header class="page-header">
        <div class="header-left">
          <el-button @click="$router.push('/chat')">
            <el-icon><ArrowLeft /></el-icon>
            返回聊天
          </el-button>
          <h1 class="page-title">Agent 管理</h1>
        </div>
        <p class="page-desc">管理自定义 Agent、工具和 Agent 市场</p>
      </header>
      
      <!-- 页面主体内容 -->
      <div class="page-body">
        <el-tabs v-model="activeTab" class="page-tabs">
          <el-tab-pane name="agents">
            <AgentManager />
          </el-tab-pane>
          <el-tab-pane name="tools">
            <CustomToolManager />
          </el-tab-pane>
          <el-tab-pane name="market">
            <AgentMarket />
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from '@/components/common/Sidebar.vue'
import AgentManager from '@/components/agent/AgentManager.vue'
import CustomToolManager from '@/components/agent/CustomToolManager.vue'
import AgentMarket from '@/components/agent/AgentMarket.vue'
import { ArrowLeft } from '@element-plus/icons-vue'

const router = useRouter()
const activeTab = ref('agents')
</script>

<style scoped>
.page-layout {
  display: flex;
  height: 100vh;
}

.page-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  background: var(--bg-primary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.page-body {
  flex: 1;
  overflow: auto;
  padding: 20px 24px;
}

/* 页面内 Tabs 通用样式 */
.page-tabs {
  height: 100%;
}

.page-tabs :deep(.el-tabs__content) {
  height: calc(100% - 40px);
  overflow: auto;
}
</style>
