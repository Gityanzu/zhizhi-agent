<template>
  <div class="page-layout">
    <Sidebar />
    <div class="page-content">
      <header class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Agent 管理</h1>
          <p class="page-desc">管理自定义Agent、工具和Agent市场</p>
        </div>
      </header>
      <div class="page-body">
        <el-tabs v-model="activeTab" class="page-tabs">
          <el-tab-pane label="我的Agent" name="agents">
            <AgentManager />
          </el-tab-pane>
          <el-tab-pane label="自定义工具" name="tools">
            <CustomToolManager />
          </el-tab-pane>
          <el-tab-pane label="Agent市场" name="market">
            <AgentMarket />
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '@/components/common/Sidebar.vue'
import AgentManager from '@/components/agent/AgentManager.vue'
import CustomToolManager from '@/components/agent/CustomToolManager.vue'
import AgentMarket from '@/components/agent/AgentMarket.vue'

const activeTab = ref('agents')
</script>
