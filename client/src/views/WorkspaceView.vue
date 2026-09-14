<template>
  <div class="placeholder-page">
    <div class="placeholder-content">
      <el-icon :size="48" color="#909399"><Setting /></el-icon>
      <h2>工作台</h2>
      <p>该页面正在开发中...</p>
      <el-button type="primary" @click="$router.push('/chat')">返回聊天</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Setting } from '@element-plus/icons-vue';
</script>

<style scoped>
.placeholder-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--bg-primary);
}
.placeholder-content {
  text-align: center;
  color: var(--text-primary);
}
.placeholder-content h2 {
  margin: 16px 0 8px;
}
.placeholder-content p {
  color: var(--text-secondary);
  margin-bottom: 24px;
}
</style>
