<template>
  <div class="page-layout">
    <Sidebar />
    <div class="page-content">
      <header class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">知识库</h1>
          <p class="page-desc">管理文档、记忆和提示词模板</p>
        </div>
      </header>
      <div class="page-body">
        <el-tabs v-model="activeTab" class="page-tabs">
          <el-tab-pane label="文档管理" name="documents">
            <DocumentPanel />
          </el-tab-pane>
          <el-tab-pane label="记忆" name="memory">
            <MemoryPanel />
          </el-tab-pane>
          <el-tab-pane label="提示词" name="prompt">
            <PromptPanel />
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '@/components/common/Sidebar.vue'
import DocumentPanel from '@/components/knowledge/DocumentPanel.vue'
import MemoryPanel from '@/components/knowledge/MemoryPanel.vue'
import PromptPanel from '@/components/knowledge/PromptPanel.vue'

const activeTab = ref('documents')
</script>
