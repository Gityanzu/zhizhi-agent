<template>
  <el-dropdown trigger="click" class="agent-selector">
    <div class="agent-selector-btn">
      <span class="agent-icon">{{ currentAgent?.avatar || '🤖' }}</span>
      <span class="agent-name">{{ currentAgent?.name || '默认助手' }}</span>
      <el-icon><ArrowDown /></el-icon>
    </div>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item :class="{ active: !chatStore.currentAgentId }" @click="select(null)">
          <span class="item-icon">🤖</span>
          <span>默认助手</span>
        </el-dropdown-item>
        <el-dropdown-item
          v-for="agent in chatStore.customAgents"
          :key="agent.id"
          :class="{ active: chatStore.currentAgentId === agent.id }"
          @click="select(agent.id)"
        >
          <span class="item-icon">{{ agent.avatar }}</span>
          <span>{{ agent.name }}</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()

const currentAgent = computed(() => {
  if (!chatStore.currentAgentId) return null
  return chatStore.customAgents.find(a => a.id === chatStore.currentAgentId) || null
})

function select(agentId: string | null) {
  chatStore.selectAgent(agentId)
}
</script>

<style scoped>
.agent-selector-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
}
.agent-selector-btn:hover {
  background: var(--bg-hover);
}
.agent-selector-btn .el-icon:last-child {
  font-size: 12px;
  color: var(--text-secondary);
}
.agent-icon {
  font-size: 16px;
}
.agent-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 8px;
}
:deep(.el-dropdown-menu__item.active) {
  color: var(--primary);
  background: var(--primary-light);
}
</style>
