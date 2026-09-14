<template>
  <div class="page-layout">
    <Sidebar />
    <div class="page-content">
      <header class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">工作流编辑器</h1>
          <p class="page-desc">可视化编排Agent工作流</p>
        </div>
        <div class="page-header-right">
          <el-button @click="newWorkflow">新建工作流</el-button>
        </div>
      </header>
      <div class="page-body" style="overflow: hidden; padding: 0;">
        <WorkflowEditor ref="workflowEditorRef" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '@/components/common/Sidebar.vue'
import WorkflowEditor from '@/components/agent/WorkflowEditor.vue'

const workflowEditorRef = ref<InstanceType<typeof WorkflowEditor> | null>(null)

function newWorkflow() {
  workflowEditorRef.value?.newWorkflow?.()
}
</script>
