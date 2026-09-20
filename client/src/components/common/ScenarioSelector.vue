<template>
  <div class="scenario-selector">
    <!-- 场景分类 -->
    <div class="scenario-tabs">
      <el-button
        v-for="scenario in scenarios"
        :key="scenario.id"
        :type="activeScenario === scenario.id ? 'primary' : ''"
        :class="{ 'scenario-active': activeScenario === scenario.id }"
        @click="selectScenario(scenario.id)"
      >
        <span class="scenario-icon">{{ scenario.icon }}</span>
        {{ scenario.name }}
      </el-button>
    </div>

    <!-- 场景描述和推荐 Agent -->
    <div v-if="currentScenario" class="scenario-info">
      <p class="scenario-description">{{ currentScenario.description }}</p>
      <div class="recommended-agents">
        <span class="label">推荐助手：</span>
        <el-button
          v-for="agentId in currentScenario.agents"
          :key="agentId"
          size="small"
          text
          class="agent-btn"
          @click="selectAgent(agentId)"
        >
          {{ getAgentName(agentId) }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SCENARIOS, DEFAULT_SCENARIO_ID, type Scenario } from '@/data/scenarios';

const props = defineProps<{
  activeScenario: string;
}>();

const emit = defineEmits<{
  (e: 'change', scenarioId: string): void;
  (e: 'select-agent', agentId: string): void;
}>();

const scenarios = computed(() => SCENARIOS);

const currentScenario = computed(() => 
  SCENARIOS.find(s => s.id === props.activeScenario)
);

function selectScenario(scenarioId: string) {
  emit('change', scenarioId);
}

function selectAgent(agentId: string) {
  emit('select-agent', agentId);
}

// 根据 agentId 获取名称（简化版，实际应该从 agent 列表获取）
function getAgentName(agentId: string): string {
  const nameMap: Record<string, string> = {
    'writing-assistant': '写作助手',
    'meeting-minutes': '会议纪要',
    'translator': '翻译官',
    'code-reviewer': '代码审查员',
    'programming-assistant': '编程助手',
    'frontend-expert': '前端专家',
    'creative-writing': '创意写作',
    'legal-advisor': '法律顾问',
    'content-writer': '内容创作者',
    'data-analyst': '数据分析师',
    'excel-helper': 'Excel 助手',
    'business-intelligence': '商业智能',
    'academic-researcher': '学术研究员',
    'study-tutor': '学习导师',
    'knowledge-qa': '知识问答',
  };
  return nameMap[agentId] || agentId;
}
</script>

<style scoped>
.scenario-selector {
  margin-bottom: 20px;
}

.scenario-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.scenario-tabs .el-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 13px;
  transition: all 0.3s;
}

.scenario-tabs .el-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.scenario-tabs .scenario-active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: #667eea;
  font-weight: 600;
}

.scenario-icon {
  font-size: 16px;
}

.scenario-info {
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 10px;
  border-left: 3px solid #667eea;
}

.scenario-description {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #666;
  line-height: 1.5;
}

.recommended-agents {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.recommended-agents .label {
  font-size: 12px;
  font-weight: 600;
  color: #333;
}

.recommended-agents .agent-btn {
  font-size: 12px;
  color: #667eea;
  padding: 3px 10px;
  border: 1px solid #667eea;
  border-radius: 10px;
  transition: all 0.2s;
}

.recommended-agents .agent-btn:hover {
  background: #667eea;
  color: white;
}
</style>
