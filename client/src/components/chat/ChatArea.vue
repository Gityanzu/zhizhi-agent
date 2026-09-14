<template>
  <div class="chat-area">
    <!-- 搜索工具栏 -->
    <div v-if="showSearch" class="search-bar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索消息内容..."
        size="small"
        clearable
        @keyup.enter="searchNext"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <span v-if="searchResults.length > 0" class="search-count">
        {{ currentSearchIndex + 1 }}/{{ searchResults.length }}
      </span>
      <el-button size="small" text @click="searchPrev">
        <el-icon><ArrowUp /></el-icon>
      </el-button>
      <el-button size="small" text @click="searchNext">
        <el-icon><ArrowDown /></el-icon>
      </el-button>
      <el-button size="small" text @click="closeSearch">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>
    
    <!-- 分支切换栏（存在多个分支时显示） -->
    <div v-if="chatStore.branches.length > 1" class="branch-bar">
      <el-icon><Share /></el-icon>
      <span class="branch-label">分支</span>
      <el-select
        :model-value="chatStore.currentBranchId || chatStore.branches[chatStore.branches.length - 1]?.branchId"
        size="small"
        class="branch-select"
        @change="handleBranchChange"
      >
        <el-option
          v-for="(b, idx) in chatStore.branches"
          :key="b.branchId"
          :value="b.branchId"
          :label="`分支${idx + 1}：${b.preview}（${b.messageCount}条）`"
        />
      </el-select>
    </div>

    <!-- 关联知识库多选栏（存在知识库集合时显示） -->
    <div v-if="chatStore.collections.length > 0" class="kb-bar">
      <el-icon><Collection /></el-icon>
      <span class="kb-label">关联知识库</span>
      <el-select
        :model-value="chatStore.sessionCollectionIds"
        multiple
        collapse-tags
        collapse-tags-tooltip
        clearable
        size="small"
        class="kb-select"
        placeholder="不选则检索全部知识库"
        @change="handleKbChange"
      >
        <el-option
          v-for="col in chatStore.collections"
          :key="col.id"
          :value="col.id"
          :label="`${col.icon || '📄'} ${col.name}`"
        />
      </el-select>
    </div>

    <!-- 消息列表 -->
    <div class="messages-container" ref="messagesContainer">
      <!-- 浮动搜索按钮 -->
      <el-button
        v-if="!showSearch && chatStore.messages.length > 0"
        class="search-fab"
        circle
        size="small"
        @click="showSearch = true"
      >
        <el-icon><Search /></el-icon>
      </el-button>
      
      <div v-if="chatStore.messages.length === 0" class="welcome">
        <div class="welcome-icon">
          <el-icon :size="56"><Service /></el-icon>
        </div>
        <h2>你好，我是智知</h2>
        <p class="welcome-desc">企业知识库智能问答助手，支持 RAG 检索增强与 Agent 工具调用</p>
        
        <div class="feature-cards">
          <div class="feature-card" @click="sendQuickQuestion('帮我查询知识库中的内容')">
            <div class="feature-icon knowledge"><el-icon><Document /></el-icon></div>
            <div class="feature-title">知识库问答</div>
            <div class="feature-desc">上传文档，智能检索</div>
          </div>
          <div class="feature-card" @click="sendQuickQuestion('用Python写一个快速排序')">
            <div class="feature-icon code"><el-icon><Monitor /></el-icon></div>
            <div class="feature-title">代码生成</div>
            <div class="feature-desc">编写、解释、调试代码</div>
          </div>
          <div class="feature-card" @click="sendQuickQuestion('帮我制定一个3天的深圳旅行计划')">
            <div class="feature-icon plan"><el-icon><List /></el-icon></div>
            <div class="feature-title">任务规划</div>
            <div class="feature-desc">拆解复杂任务，分步执行</div>
          </div>
          <div class="feature-card" @click="sendQuickQuestion('今天深圳的天气怎么样？')">
            <div class="feature-icon search"><el-icon><Search /></el-icon></div>
            <div class="feature-title">联网搜索</div>
            <div class="feature-desc">实时获取最新信息</div>
          </div>
        </div>
        
        <div class="quick-questions">
          <div
            v-for="q in quickQuestions"
            :key="q"
            class="quick-item"
            @click="sendQuickQuestion(q)"
          >
            {{ q }}
          </div>
        </div>
      </div>
      
      <MessageItem
        v-for="msg in chatStore.messages"
        :key="msg.id"
        :message="msg"
        @regenerate="handleRegenerate(msg)"
        @edit="handleEdit"
      />
    </div>
    
    <!-- 输入区域 -->
    <div class="input-area">
      <!-- 图片预览 -->
      <div v-if="selectedImage" class="image-preview">
        <img :src="selectedImage" alt="预览" />
        <el-button type="danger" size="small" circle @click="clearImage">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <!-- 语音识别中（功能13） -->
      <div v-if="speech.isListening.value" class="listening-bar">
        <span class="listening-dot"></span>
        <span class="listening-text">正在聆听... {{ speech.transcript.value }}</span>
      </div>
      
      <div class="input-wrapper">
        <div class="input-box">
          <el-input
            ref="chatInputRef"
            v-model="inputText"
            type="textarea"
            :rows="2"
            :placeholder="selectedImage ? '输入关于图片的问题，按 Enter 发送' : '输入你的问题，按 Enter 发送，Shift+Enter 换行'"
            @keydown.enter.exact="handleSend"
            :disabled="chatStore.isLoading"
            resize="none"
            class="chat-input"
          />
          <div class="input-bottom-bar">
            <div class="input-left-actions">
              <!-- 模式选择下拉 -->
              <el-dropdown trigger="click" class="mode-dropdown">
                <button class="mode-select-btn">
                  <el-icon><component :is="currentModeIcon" /></el-icon>
                  <span>{{ currentModeLabel }}</span>
                  <el-icon class="arrow-icon"><ArrowDown /></el-icon>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="m in modes"
                      :key="m.value"
                      :class="{ active: chatStore.mode === m.value }"
                      @click="chatStore.mode = m.value"
                    >
                      <el-icon><component :is="m.icon" /></el-icon>
                      <span>{{ m.label }}</span>
                      <el-icon v-if="chatStore.mode === m.value" class="check-icon"><Check /></el-icon>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <!-- 图片上传按钮 -->
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                style="display: none"
                @change="handleImageChange"
              />
              <button class="action-btn" :disabled="chatStore.isLoading" @click="triggerFileInput">
                <el-icon><Picture /></el-icon>
              </button>
              <!-- 语音输入按钮（功能13） -->
              <button
                class="action-btn mic-btn"
                :class="{ listening: speech.isListening.value }"
                :disabled="!speech.supported.value"
                @click="toggleVoiceInput"
              >
                <el-icon><Microphone /></el-icon>
              </button>
            </div>
            <div class="input-right-actions">
              <!-- 思考开关 -->
              <el-tooltip content="开启思考过程" placement="top">
                <button class="action-btn thinking-btn" :class="{ active: chatStore.enableThinking }" @click="chatStore.enableThinking = !chatStore.enableThinking">
                  <el-icon><MagicStick /></el-icon>
                </button>
              </el-tooltip>

              <!-- 模型选择器 -->
              <el-dropdown trigger="click" class="model-dropdown">
                <button class="model-select-btn">
                  <el-icon class="model-icon"><Cpu /></el-icon>
                  <span class="model-name">{{ chatStore.currentModel?.name || '选择模型' }}</span>
                  <el-tag v-if="chatStore.currentModel?.free" size="small" type="success" effect="plain" class="model-tag">免费</el-tag>
                  <el-icon class="arrow-icon"><ArrowDown /></el-icon>
                </button>
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
                        <el-icon v-if="selectedModel === model.id" class="check-icon"><Check /></el-icon>
                      </el-dropdown-item>
                    </template>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <button
                v-if="chatStore.isLoading"
                class="stop-btn"
                @click="chatStore.stopGeneration"
              >
                <el-icon><Close /></el-icon>
                停止
              </button>
              <button
                v-else
                class="send-btn"
                :disabled="!inputText.trim() && !selectedImage"
                @click="handleSend"
              >
                <el-icon><Promotion /></el-icon>
                发送
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="input-tip">
        <el-tag v-if="selectedImage" type="warning" size="small">图片模式：qwen3.5-ocr 多模态理解</el-tag>
        <el-tag v-else-if="chatStore.mode === 'qa'" type="primary" size="small">智能问答：直接大模型回答</el-tag>
        <el-tag v-else-if="chatStore.mode === 'agent'" type="success" size="small">Agent 模式：自动调用工具</el-tag>
        <el-tag v-else type="warning" size="small">Plan 模式：任务规划执行</el-tag>
        <span v-if="chatStore.error" class="error-text">{{ chatStore.error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { Service, Promotion, Picture, Close, Search, ArrowUp, ArrowDown, Share, Collection, Microphone, Document, Monitor, List, Cpu, Check, MagicStick, ChatDotRound, UserFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { useSpeech } from '@/composables/useSpeech'
import MessageItem from './MessageItem.vue'

const chatStore = useChatStore()
const inputText = ref('')
const chatInputRef = ref()
const messagesContainer = ref<HTMLElement | null>(null)
const selectedImage = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// 模型选择相关状态
const selectedModel = ref('')
const selectedSkill = ref('')

const modes = [
  { value: 'qa', label: '问答', icon: ChatDotRound },
  { value: 'agent', label: 'Agent', icon: Service },
  { value: 'plan', label: 'Plan', icon: List },
  { value: 'multi', label: '多Agent', icon: UserFilled },
]

const currentModeLabel = computed(() => {
  const m = modes.find(m => m.value === chatStore.mode)
  return m ? m.label : '问答'
})

const currentModeIcon = computed(() => {
  const m = modes.find(m => m.value === chatStore.mode)
  return m ? m.icon : ChatDotRound
})

watch(() => chatStore.currentModel, (model) => {
  if (model) selectedModel.value = model.id
}, { immediate: true })

watch(() => chatStore.activeSkill, (skill) => {
  if (skill) selectedSkill.value = skill.id
}, { immediate: true })

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

// 功能13：语音识别
const speech = useSpeech()

function toggleVoiceInput() {
  if (!speech.supported.value) {
    ElMessage.warning('当前浏览器不支持语音识别，请使用 Chrome/Edge 并通过 HTTPS 或 localhost 访问')
    return
  }
  if (speech.isListening.value) {
    speech.stopListening()
  } else {
    const ok = speech.startListening((finalText) => {
      inputText.value = finalText
      // 自动发送
      if (finalText.trim()) {
        chatStore.sendMessage(finalText)
        clearInput()
      }
    })
    if (!ok) {
      ElMessage.warning('无法启动语音识别，请检查麦克风权限')
    }
  }
}

// 消息搜索
const showSearch = ref(false)
const searchQuery = ref('')
const searchResults = ref<number[]>([])
const currentSearchIndex = ref(0)

const quickQuestions = [
  '公司的报销流程是什么？',
  '帮我计算 12500 的 15% 是多少',
  '现在几点了？',
  '介绍一下你自己',
]

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    ElMessage.error('仅支持 PNG、JPEG、WebP、GIF 格式')
    input.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 5MB')
    input.value = ''
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    selectedImage.value = e.target?.result as string
    console.log('[ChatArea] 图片已选择，大小:', (e.target?.result as string).length, 'chars')
  }
  reader.onerror = () => {
    ElMessage.error('图片读取失败')
  }
  reader.readAsDataURL(file)
  input.value = ''
}

function clearImage() {
  selectedImage.value = null
}

// 清空输入框（确保 el-input 的 textarea 与 v-model 同步）
function clearInput() {
  inputText.value = ''
  nextTick(() => {
    // 手动同步 textarea 的 value，解决 el-input v-model 不同步问题
    const textarea = chatInputRef.value?.textarea
    if (textarea) {
      textarea.value = ''
    }
  })
}

async function handleSend() {
  if (chatStore.isLoading) return
  
  // 图片模式：调用图片理解接口
  if (selectedImage.value) {
    const question = inputText.value.trim() || '请描述这张图片的内容'
    await chatStore.sendImageMessage(selectedImage.value, question)
    selectedImage.value = null
    clearInput()
    return
  }
  
  // 普通文本模式
  if (!inputText.value.trim()) return
  chatStore.sendMessage(inputText.value)
  clearInput()
}

function sendQuickQuestion(q: string) {
  inputText.value = q
  handleSend()
}

// 重新生成回答
function handleRegenerate(msg: any) {
  chatStore.regenerate()
}

// 编辑用户消息并重新生成
async function handleEdit(messageId: string, newContent: string) {
  await chatStore.editMessage(messageId, newContent)
}

// 切换分支
async function handleBranchChange(branchId: string) {
  await chatStore.switchBranch(branchId)
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 关联知识库多选变化：持久化到当前会话
function handleKbChange(ids: string[]) {
  chatStore.setSessionCollections(Array.isArray(ids) ? ids : [])
}

// 监听清空输入事件（Ctrl+L）
function handleClearInput() {
  clearInput()
}

// 消息搜索功能
function doSearch() {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    currentSearchIndex.value = 0
    return
  }
  const query = searchQuery.value.toLowerCase()
  searchResults.value = chatStore.messages
    .map((msg, index) => (msg.content?.toLowerCase().includes(query) ? index : -1))
    .filter(i => i >= 0)
  currentSearchIndex.value = 0
  if (searchResults.value.length > 0) {
    scrollToMessage(searchResults.value[0])
  }
}

function searchNext() {
  if (searchResults.value.length === 0) {
    doSearch()
    return
  }
  currentSearchIndex.value = (currentSearchIndex.value + 1) % searchResults.value.length
  scrollToMessage(searchResults.value[currentSearchIndex.value])
}

function searchPrev() {
  if (searchResults.value.length === 0) return
  currentSearchIndex.value = (currentSearchIndex.value - 1 + searchResults.value.length) % searchResults.value.length
  scrollToMessage(searchResults.value[currentSearchIndex.value])
}

function scrollToMessage(index: number) {
  nextTick(() => {
    const elements = messagesContainer.value?.querySelectorAll('.message-item')
    if (elements && elements[index]) {
      elements[index].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

function closeSearch() {
  showSearch.value = false
  searchQuery.value = ''
  searchResults.value = []
  currentSearchIndex.value = 0
}

onMounted(() => {
  window.addEventListener('clear-input', handleClearInput)
  chatStore.loadCollections()
})

onUnmounted(() => {
  window.removeEventListener('clear-input', handleClearInput)
})

// 自动滚动到底部
watch(
  () => chatStore.messages.map(m => m.content).join(''),
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
)
</script>

<style scoped>
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.search-bar .el-input {
  flex: 1;
}

.search-count {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}

.search-fab {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.search-fab:hover {
  opacity: 1;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  position: relative;
  background: var(--bg-primary);
  transition: background-color 0.3s;
}

/* 分支切换栏 */
.branch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.branch-label {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.branch-select {
  flex: 1;
  max-width: 480px;
}

/* 关联知识库栏 */
.kb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.kb-label {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.kb-select {
  flex: 1;
  max-width: 480px;
}

.welcome {
  text-align: center;
  padding: 40px 20px 20px;
}

.welcome-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 20px;
  background: var(--primary-gradient);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
}

.welcome-icon :deep(.el-icon) {
  font-size: 36px;
}

.welcome h2 {
  font-size: 28px;
  color: var(--text-primary);
  margin-bottom: 10px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.welcome-desc {
  color: var(--text-secondary);
  margin-bottom: 32px;
  font-size: 15px;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
}

/* 功能卡片 */
.feature-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  max-width: 640px;
  margin: 0 auto 28px;
}

.feature-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 16px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.feature-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
}

.feature-icon {
  width: 40px;
  height: 40px;
  margin: 0 auto 10px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
}

.feature-icon.knowledge { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.feature-icon.code { background: linear-gradient(135deg, #10b981, #059669); }
.feature-icon.plan { background: linear-gradient(135deg, #f59e0b, #d97706); }
.feature-icon.search { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }

.feature-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.feature-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  max-width: 600px;
  margin: 0 auto;
}

.quick-item {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-item:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-light);
  transform: translateY(-1px);
  box-shadow: var(--shadow);
}

.input-area {
  padding: 16px 24px 20px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  transition: background-color 0.3s, border-color 0.3s;
}

.image-preview {
  max-width: 800px;
  margin: 0 auto 12px;
  position: relative;
  display: inline-block;
}

.image-preview img {
  max-width: 200px;
  max-height: 150px;
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.image-preview .el-button {
  position: absolute;
  top: -8px;
  right: -8px;
}

.input-wrapper {
  max-width: 800px;
  margin: 0 auto;
  position: relative;
}

.input-box {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 14px 18px 10px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.input-box:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1), 0 4px 12px rgba(0, 0, 0, 0.06);
}

.chat-input :deep(.el-textarea__inner) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  resize: none !important;
  font-size: 14px !important;
  line-height: 1.6 !important;
  max-height: 200px !important;
}

.chat-input :deep(.el-textarea__inner:focus) {
  box-shadow: none !important;
}

.input-bottom-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
  gap: 8px;
}

.input-left-actions,
.input-right-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 模式选择按钮 */
.mode-select-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
  font-weight: 500;
}

.mode-select-btn:hover {
  border-color: var(--primary-color, #6366f1);
  color: var(--primary-color, #6366f1);
}

.mode-select-btn .arrow-icon {
  font-size: 12px;
}

/* 模型选择按钮 */
.model-select-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  max-width: 200px;
}

.model-select-btn:hover {
  border-color: var(--primary-color, #6366f1);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

.model-icon {
  color: var(--primary-color, #6366f1);
  font-size: 14px;
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
  transform: scale(0.85);
}

.model-select-btn .arrow-icon {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
}

/* 思考按钮 */
.thinking-btn.active {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
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

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 18px;
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--primary);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn,
.stop-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border: none;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.send-btn {
  background: var(--primary-gradient);
  color: #fff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stop-btn {
  background: var(--danger);
  color: #fff;
}

.stop-btn:hover {
  background: #f78989;
}

.input-tip {
  max-width: 800px;
  margin: 8px auto 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.error-text {
  color: var(--danger);
  font-size: 12px;
}

/* 功能13：语音识别 */
.mic-btn.listening {
  background: var(--danger);
  color: #fff;
  animation: mic-pulse 1.2s infinite;
}

@keyframes mic-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.listening-bar {
  max-width: 800px;
  margin: 0 auto 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #fef0f0;
  border-radius: 8px;
}

.listening-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
  animation: mic-pulse 1s infinite;
  flex-shrink: 0;
}

.listening-text {
  font-size: 13px;
  color: #f56c6c;
}

/* ========== 响应式：平板 ========== */
@media (max-width: 1024px) {
  .messages-container {
    padding: 16px;
  }
  
  .welcome {
    padding: 40px 16px;
  }
  
  .welcome h2 {
    font-size: 20px;
  }
  
  .input-area {
    padding: 12px 16px 16px;
  }
}

/* ========== 响应式：手机 ========== */
@media (max-width: 768px) {
  .messages-container {
    padding: 12px;
  }
  
  .welcome {
    padding: 30px 12px;
  }
  
  .welcome-icon :deep(.el-icon) {
    font-size: 48px !important;
  }
  
  .welcome h2 {
    font-size: 18px;
  }
  
  .welcome p {
    font-size: 13px;
  }
  
  .quick-questions {
    gap: 8px;
  }
  
  .quick-item {
    padding: 8px 12px;
    font-size: 12px;
  }
  
  .input-area {
    padding: 10px 12px 14px;
  }
  
  .input-wrapper {
    max-width: 100%;
  }
  
  .input-bottom-bar {
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .input-left-actions,
  .input-right-actions {
    gap: 4px;
  }
  
  .mode-select-btn,
  .model-select-btn {
    padding: 4px 8px;
    font-size: 12px;
  }
  
  .model-name {
    max-width: 80px;
  }
  
  .model-tag {
    display: none;
  }
  
  .input-actions {
    position: static;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
  
  .input-tip {
    max-width: 100%;
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .image-preview img {
    max-width: 150px;
    max-height: 120px;
  }
}

/* ========== 响应式：小屏手机 ========== */
@media (max-width: 480px) {
  .messages-container {
    padding: 8px;
  }
  
  .welcome {
    padding: 20px 8px;
  }
  
  .welcome h2 {
    font-size: 16px;
  }
  
  .welcome p {
    font-size: 12px;
  }
  
  .quick-item {
    padding: 6px 10px;
    font-size: 11px;
  }
  
  .input-area {
    padding: 8px 10px 12px;
  }
}
</style>
