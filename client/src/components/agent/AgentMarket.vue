<template>
  <div class="agent-market">
    <!-- 搜索和筛选 -->
    <div class="market-toolbar">
      <el-input v-model="searchText" placeholder="搜索模板..." size="small" clearable class="search-input">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-radio-group v-model="activeCategory" size="small">
        <el-radio-button v-for="c in categories" :key="c" :value="c">{{ c }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 模板卡片网格 -->
    <div class="template-grid">
      <div v-for="t in filteredTemplates" :key="t.id" class="template-card">
        <div class="template-head">
          <span class="template-avatar">{{ t.avatar }}</span>
          <div class="template-meta">
            <div class="template-name">{{ t.name }}</div>
            <el-tag size="small" effect="plain">{{ t.category }}</el-tag>
          </div>
        </div>
        <div class="template-desc">{{ t.description }}</div>
        <div class="template-tools">
          <el-tag v-for="tool in t.tools.slice(0, 4)" :key="tool" size="small" type="info" effect="plain">
            {{ tool }}
          </el-tag>
          <el-tag v-if="t.tools.length > 4" size="small" type="info" effect="plain">
            +{{ t.tools.length - 4 }}
          </el-tag>
        </div>
        <el-button type="primary" size="small" class="use-btn" @click="useTemplate(t)">
          使用此模板
        </el-button>
      </div>
    </div>
    <div v-if="filteredTemplates.length === 0" class="empty">未找到匹配的模板</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { agentTemplates, AGENT_CATEGORIES, type AgentTemplate } from '@/data/agentTemplates'

const emit = defineEmits<{ (e: 'used'): void }>()

const chatStore = useChatStore()
const searchText = ref('')
const activeCategory = ref('全部')
const categories = AGENT_CATEGORIES

const filteredTemplates = computed(() => {
  return agentTemplates.filter(t => {
    const matchCat = activeCategory.value === '全部' || t.category === activeCategory.value
    const matchSearch = !searchText.value ||
      t.name.includes(searchText.value) || t.description.includes(searchText.value)
    return matchCat && matchSearch
  })
})

async function useTemplate(t: AgentTemplate) {
  try {
    await chatStore.createCustomAgent({
      name: t.name,
      avatar: t.avatar,
      description: t.description,
      systemPrompt: t.systemPrompt,
      model: t.model,
      tools: [...t.tools],
      temperature: t.temperature,
    })
    ElMessage.success(`已创建 Agent：${t.name}`)
    emit('used')
  } catch (e: any) {
    ElMessage.error('创建失败: ' + (e?.message || e))
  }
}
</script>

<style scoped>
.agent-market { display: flex; flex-direction: column; gap: 12px; }
.market-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}
.search-input { width: 240px; }
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.template-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s;
}
.template-card:hover {
  border-color: var(--primary);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.12);
}
.template-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.template-avatar { font-size: 28px; }
.template-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.template-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  min-height: 36px;
}
.template-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.use-btn { width: 100%; }
.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px 0;
}
</style>
