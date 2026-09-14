<template>
  <div class="page-layout">
    <Sidebar />
    <div class="page-content">
      <header class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">数据分析</h1>
          <p class="page-desc">查看使用统计和可观测性数据</p>
        </div>
      </header>
      <div class="page-body">
        <ObservabilityPanel />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Sidebar from '@/components/common/Sidebar.vue'
import ObservabilityPanel from '@/components/agent/ObservabilityPanel.vue'
</script>
