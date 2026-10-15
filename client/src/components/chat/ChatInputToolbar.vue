<template>
  <div class="chat-input-toolbar">
    <!-- 左侧：模型选择器 -->
    <div class="toolbar-left">
      <el-dropdown trigger="click" class="model-dropdown">
        <div class="model-selector-btn">
          <el-icon class="model-icon"><Cpu /></el-icon>
          <span class="model-name">{{ chatStore.currentModel?.name || '选择模型' }}</span>
          <el-tag v-if="chatStore.currentModel?.free" size="small" type="success" effect="plain" class="model-tag">免费</el-tag>
          <el-icon><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu class="model-dropdown-menu">
            <div class="dropdown-section">
              <div class="dropdown-section-title">技能</div>
              <el-dropdown-item 
                v-for="skill in chatStore.skills" 
                :key="skill.id"
                :class="{ active: selectedSkill === skill.id }"
                @click="selectedSkill = skill.id; handleSkillChange(skill.id)"
              >
                <span class="item-icon">{{ skill.icon }}</span>
                <span>{{ skill.name }}</span>
                <el-icon v-if="selectedSkill === skill.id" class="check-icon"><Check /></el-icon>
              </el-dropdown-item>
            </div>
            <el-dropdown-item divided class="dropdown-section-title" disabled>模型</el-dropdown-item>
            <!-- 用户 Key 没能生效时必须可见：否则"配了 Key 却还在用系统模型"完全无感 -->
            <el-dropdown-item v-if="chatStore.userProvider?.warning" disabled class="model-warning">
              <el-icon class="item-icon"><Warning /></el-icon>
              <span>{{ chatStore.userProvider.warning }}</span>
            </el-dropdown-item>
            <template v-for="g in chatStore.modelGroups" :key="g.providerId">
              <div class="model-group-header">
                <span class="model-group-name">
                  {{ g.providerName }}
                  <el-tag v-if="g.type === 'ollama'" size="small" :type="g.available ? 'success' : 'info'" effect="plain">
                    {{ g.available ? '本地' : '未检测到' }}
                  </el-tag>
                </span>
                <el-button
                  v-if="g.type === 'ollama'"
                  size="small"
                  text
                  :loading="chatStore.isRefreshingOllama"
                  @click="handleRefreshOllama"
                >
                  刷新
                </el-button>
                <el-button
                  v-else-if="chatStore.userProvider?.configured"
                  size="small"
                  text
                  :loading="chatStore.isRefreshingModels"
                  @click="handleRefreshModels"
                >
                  刷新
                </el-button>
              </div>
              <el-dropdown-item
                v-if="!g.available && g.type === 'ollama'"
                disabled
                class="ollama-offline"
              >
                <el-icon class="item-icon"><Cpu /></el-icon>
                <span>Ollama未运行</span>
              </el-dropdown-item>
              <el-dropdown-item
                v-for="model in g.models"
                :key="g.providerId + ':' + model.id"
                :class="{ active: selectedModel === model.id }"
                @click="selectedModel = model.id; handleModelChange(model.id, g.providerId)"
              >
                <el-icon class="item-icon"><Cpu /></el-icon>
                <span>{{ model.name }}</span>
                <el-tag v-if="model.free" size="small" type="success" effect="plain">免费</el-tag>
                <!-- 自定义模型可删除；内置模型不提供删除入口 -->
                <el-icon
                  v-if="isCustomModel(model.id)"
                  class="remove-icon"
                  title="删除该自定义模型"
                  @click.stop="handleRemoveCustomModel(model.id)"
                >
                  <Close />
                </el-icon>
                <el-icon v-if="selectedModel === model.id" class="check-icon"><Check /></el-icon>
              </el-dropdown-item>
            </template>
            <!-- 自定义模型入口：有些模型不在厂商清单里（如带日期的版本号） -->
            <el-dropdown-item
              v-if="chatStore.userProvider?.configured"
              divided
              class="custom-model-item"
              @click="handleAddCustomModel"
            >
              <el-icon class="item-icon"><Plus /></el-icon>
              <span>自定义模型…</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- 思考开关 -->
      <el-tooltip content="开启思考过程" placement="top">
        <button class="thinking-btn" :class="{ active: chatStore.enableThinking }" @click="chatStore.enableThinking = !chatStore.enableThinking">
          <el-icon><MagicStick /></el-icon>
          <span v-if="chatStore.enableThinking" class="thinking-label">思考中</span>
        </button>
      </el-tooltip>
    </div>

    <!-- 右侧：模式切换 -->
    <div class="toolbar-right">
      <div class="mode-switch">
        <button 
          v-for="m in modes" 
          :key="m.value"
          class="mode-btn"
          :class="{ active: chatStore.mode === m.value }"
          @click="chatStore.mode = m.value"
        >
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Cpu, ArrowDown, Check, MagicStick, ChatDotRound, Service, List, UserFilled, Warning, Close, Plus } from '@element-plus/icons-vue'

const chatStore = useChatStore()

const selectedModel = ref('')
const selectedSkill = ref('')

// 显式标注 value 的字面量联合类型：否则推断为 string，赋给 chatStore.mode 会类型报错
const modes: Array<{ value: 'qa' | 'agent' | 'plan' | 'multi'; label: string; icon: any }> = [
  { value: 'qa', label: '问答', icon: ChatDotRound },
  { value: 'agent', label: 'Agent', icon: Service },
  { value: 'plan', label: 'Plan', icon: List },
  { value: 'multi', label: '多Agent', icon: UserFilled },
]

watch(() => chatStore.currentModel, (model) => {
  if (model) selectedModel.value = model.id
}, { immediate: true })

watch(() => chatStore.activeSkill, (skill) => {
  if (skill) selectedSkill.value = skill.id
}, { immediate: true })

// 用当前用户的 Key 向厂商拉取最新模型清单
async function handleRefreshModels() {
  try {
    const res = await chatStore.refreshUserProviderModels()
    if (res) ElMessage.success(res.message || '已刷新模型列表')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '刷新模型列表失败')
  }
}

function isCustomModel(modelId: string) {
  return !!chatStore.userProvider?.customModels?.some((m: any) => m.id === modelId)
}

// 添加自定义模型：厂商清单之外的 id（如百炼上的 deepseek-v4-flash-0731）
async function handleAddCustomModel() {
  let modelId = ''
  try {
    const { value } = await ElMessageBox.prompt(
      '填写厂商支持的模型 id，保存后会立即切换过去。',
      '添加自定义模型',
      {
        confirmButtonText: '添加',
        cancelButtonText: '取消',
        inputPlaceholder: '例如 deepseek-v4-flash-0731',
        inputPattern: /^[A-Za-z0-9._:\/-]{1,200}$/,
        inputErrorMessage: '仅允许字母、数字与 . - _ : / ，且不超过 200 字符',
      }
    )
    modelId = String(value || '').trim()
  } catch {
    return // 用户取消
  }

  try {
    const data = await chatStore.addUserCustomModel(
      modelId,
      chatStore.userProvider?.providerId || undefined
    )
    ElMessage.success(data?.message || '已添加自定义模型')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '添加自定义模型失败')
  }
}

async function handleRemoveCustomModel(modelId: string) {
  try {
    await ElMessageBox.confirm(`删除自定义模型「${modelId}」？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }

  try {
    const data = await chatStore.removeUserCustomModel(modelId)
    ElMessage.success(data?.message || '已删除自定义模型')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除自定义模型失败')
  }
}

async function handleModelChange(modelId: string, providerId?: string) {
  try {
    const result = await chatStore.switchModel(modelId, providerId)
    if (result.success) {
      ElMessage.success(`已切换到 ${result.model.name}`)
    }
  } catch (e) {
    ElMessage.error('模型切换失败')
    if (chatStore.currentModel) selectedModel.value = chatStore.currentModel.id
  }
}

async function handleRefreshOllama() {
  try {
    const res = await chatStore.refreshOllama()
    if (res.ollamaAvailable) {
      ElMessage.success(res.message || 'Ollama 模型已刷新')
    } else {
      ElMessage.warning('Ollama未运行，请先启动 Ollama 服务')
    }
  } catch (e) {
    ElMessage.error('刷新Ollama失败')
  }
}

async function handleSkillChange(skillId: string) {
  try {
    const result = await chatStore.switchSkill(skillId)
    if (result.success) {
      ElMessage.success(`已切换到 ${result.skill.name}`)
    }
  } catch (e) {
    ElMessage.error('技能切换失败')
    if (chatStore.activeSkill) selectedSkill.value = chatStore.activeSkill.id
  }
}
</script>

<style scoped>
.chat-input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-secondary, #f9fafb);
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

/* 模型选择器 */
.model-selector-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  max-width: 240px;
}

.model-selector-btn:hover {
  border-color: var(--primary-color, #6366f1);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

.model-icon {
  color: var(--primary-color, #6366f1);
  font-size: 16px;
}

.model-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-tag {
  margin-left: 2px;
}

/* 思考按钮 */
.thinking-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, #fff);
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary, #6b7280);
}

.thinking-btn:hover {
  border-color: var(--primary-color, #6366f1);
  color: var(--primary-color, #6366f1);
}

.thinking-btn.active {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  border-color: transparent;
}

.thinking-label {
  font-size: 12px;
  font-weight: 500;
}

/* 模式切换 */
.mode-switch {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--bg-primary, #fff);
  border-radius: 10px;
  border: 1px solid var(--border-color, #e5e7eb);
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  transition: all 0.2s;
  white-space: nowrap;
}

.mode-btn:hover {
  color: var(--text-primary, #111827);
  background: var(--bg-hover, #f3f4f6);
}

.mode-btn.active {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

/* 下拉菜单样式 */
.model-dropdown-menu {
  max-height: 400px;
  overflow-y: auto;
}

.dropdown-section {
  padding: 4px 0;
}

.dropdown-section-title {
  padding: 8px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 用户 Key 未能生效时的提示：需要换行，且用告警色与普通条目区分 */
.model-warning {
  max-width: 320px;
  height: auto !important;
  white-space: normal !important;
  line-height: 1.5;
  color: #e6a23c !important;
}

/* 自定义模型条目的删除按钮：默认弱化，hover 变红 */
.remove-icon {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  cursor: pointer;
}

.remove-icon:hover {
  color: #f56c6c;
}

.custom-model-item {
  color: var(--primary, #6366f1);
}
}

.item-icon {
  margin-right: 8px;
  font-size: 14px;
}

.check-icon {
  margin-left: auto;
  color: var(--primary-color, #6366f1);
}

.model-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 4px;
}

.model-group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  display: flex;
  align-items: center;
  gap: 6px;
}

.ollama-offline {
  color: var(--text-tertiary, #9ca3af);
}

/* 响应式 */
@media (max-width: 768px) {
  .chat-input-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 8px 12px;
  }
  
  .toolbar-left,
  .toolbar-right {
    justify-content: center;
  }
  
  .mode-switch {
    width: 100%;
    justify-content: space-between;
  }
  
  .mode-btn {
    flex: 1;
    justify-content: center;
    padding: 6px 8px;
    font-size: 12px;
  }
  
  .model-selector-btn {
    max-width: none;
    flex: 1;
  }
}
</style>
