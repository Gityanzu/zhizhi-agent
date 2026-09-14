<template>
  <div class="page-layout">
    <Sidebar />
    <div class="page-content">
      <header class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">设置</h1>
          <p class="page-desc">管理用户资料、偏好、API Key和数据</p>
        </div>
      </header>
      <div class="page-body">
        <el-tabs v-model="activeTab" class="page-tabs">
          <el-tab-pane label="基本资料" name="profile">
            <UserSettings :default-tab="'profile'" @close="activeTab = 'profile'" />
          </el-tab-pane>
          <el-tab-pane label="偏好设置" name="preferences">
            <UserSettings :default-tab="'preferences'" @close="activeTab = 'preferences'" />
          </el-tab-pane>
          <el-tab-pane label="模型参数" name="params">
            <ModelParamsPanel />
          </el-tab-pane>
          <el-tab-pane label="API Key" name="apikey">
            <ApiKeyManager />
          </el-tab-pane>
          <el-tab-pane label="数据库连接" name="db">
            <DBConnectionManager />
          </el-tab-pane>
          <el-tab-pane label="数据管理" name="data">
            <UserSettings :default-tab="'data'" @close="activeTab = 'data'" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '@/components/common/Sidebar.vue'
import UserSettings from '@/components/settings/UserSettings.vue'
import ModelParamsPanel from '@/components/agent/ModelParamsPanel.vue'
import ApiKeyManager from '@/components/settings/ApiKeyManager.vue'
import DBConnectionManager from '@/components/settings/DBConnectionManager.vue'

const activeTab = ref('profile')
</script>
