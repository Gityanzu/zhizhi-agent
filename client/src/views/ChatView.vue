<template>
  <div class="app-container" :class="{ 'is-mobile': isMobile }">
    <!-- 移动端侧边栏抽屉 -->
    <el-drawer
      v-model="mobileSidebarVisible"
      direction="ltr"
      size="280px"
      :with-header="false"
      class="mobile-sidebar-drawer"
    >
      <Sidebar @session-selected="mobileSidebarVisible = false" @import="showImportDialog = true" @share="openShare" />
    </el-drawer>
    
    <!-- 桌面端侧边栏 -->
    <Sidebar v-if="!isMobile" @import="showImportDialog = true" @share="openShare" />
    
    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部栏 -->
      <header class="header">
        <div class="header-left">
          <!-- 移动端汉堡菜单 -->
          <el-button
            v-if="isMobile"
            text
            class="menu-toggle"
            @click="mobileSidebarVisible = true"
          >
            <el-icon :size="20"><Menu /></el-icon>
          </el-button>
          <h1 class="logo">智知</h1>
          
          <!-- Agent选择器 -->
          <AgentSelector />
        </div>
        
        <div class="header-center">
          <!-- 模型和模式已移到输入区上方的工具栏 -->
        </div>
        
        <div class="header-right">
          <!-- Token徽标 -->
          <el-tooltip placement="bottom" effect="dark">
            <template #content>
              <div class="token-tooltip">
                <div v-if="chatStore.lastTokenUsage" class="token-row">
                  <span>本次：</span>
                  <span>{{ chatStore.lastTokenUsage.totalTokens }} tokens</span>
                </div>
                <div v-if="chatStore.sessionUsage" class="token-row">
                  <span>会话累计：</span>
                  <span>{{ chatStore.sessionUsage.totalTokens }} tokens</span>
                </div>
                <div v-if="chatStore.sessionUsage" class="token-row">
                  <span>消息数：</span>
                  <span>{{ chatStore.sessionUsage.messageCount }}</span>
                </div>
              </div>
            </template>
            <div class="token-badge" v-if="chatStore.lastTokenUsage || chatStore.sessionUsage">
              <el-icon><DataAnalysis /></el-icon>
              <span>{{ chatStore.lastTokenUsage?.totalTokens || chatStore.sessionUsage?.totalTokens || 0 }}</span>
            </div>
          </el-tooltip>
          
          <!-- 更多菜单 -->
          <el-dropdown trigger="click" @command="handleHeaderMenu">
            <button class="icon-btn">
              <el-icon><MoreFilled /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="document">
                  <el-icon><Document /></el-icon>知识库
                </el-dropdown-item>
                <el-dropdown-item command="stats">
                  <el-icon><DataAnalysis /></el-icon>用量统计
                </el-dropdown-item>
                <el-dropdown-item command="memory">
                  <el-icon><Collection /></el-icon>记忆管理
                </el-dropdown-item>
                <el-dropdown-item command="prompt">
                  <el-icon><EditPen /></el-icon>提示词模板
                </el-dropdown-item>
                <el-dropdown-item command="modelParams">
                  <el-icon><Setting /></el-icon>模型参数
                </el-dropdown-item>
                <el-dropdown-item command="agentManager">
                  <el-icon><Operation /></el-icon>Agent管理
                </el-dropdown-item>
                <el-dropdown-item command="agentMarket">
                  <el-icon><Star /></el-icon>Agent市场
                </el-dropdown-item>
                <el-dropdown-item command="workflow">
                  <el-icon><Share /></el-icon>工作流编排
                </el-dropdown-item>
                <el-dropdown-item command="dbQuery">
                  <el-icon><Coin /></el-icon>数据库查询
                </el-dropdown-item>
                <el-dropdown-item command="customTools">
                  <el-icon><Tools /></el-icon>自定义工具
                </el-dropdown-item>
                <el-dropdown-item command="voiceSettings">
                  <el-icon><Microphone /></el-icon>语音设置
                </el-dropdown-item>
                <el-dropdown-item command="modelCompare">
                  <el-icon><ScaleToOriginal /></el-icon>模型对比
                </el-dropdown-item>
                <el-dropdown-item command="apiKeys">
                  <el-icon><Key /></el-icon>API密钥
                </el-dropdown-item>
                <el-dropdown-item command="settings">
                  <el-icon><Setting /></el-icon>设置
                </el-dropdown-item>
                <el-dropdown-item divided command="export">
                  <el-icon><Download /></el-icon>导出对话
                </el-dropdown-item>
                <el-dropdown-item command="theme">
                  <el-icon><Moon v-if="!isDark" /><Sunny v-else /></el-icon>{{ isDark ? '浅色模式' : '深色模式' }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      
      <!-- 当前模式提示条 -->
      <div class="mode-tip" :class="chatStore.mode">
        <el-icon v-if="chatStore.mode === 'qa'"><ChatDotRound /></el-icon>
        <el-icon v-else-if="chatStore.mode === 'agent'"><Service /></el-icon>
        <el-icon v-else-if="chatStore.mode === 'plan'"><List /></el-icon>
        <el-icon v-else><UserFilled /></el-icon>
        <span>{{ modeTipText }}</span>
        <span v-if="chatStore.activeSkill" class="current-skill-tag">
          {{ chatStore.activeSkill.icon }} {{ chatStore.activeSkill.name }}
        </span>
        <span v-if="chatStore.currentModel" class="current-model-tag">
          {{ chatStore.currentModel.name }}
        </span>
      </div>
      
      <!-- 对话区域 -->
      <ChatArea />
      
      <!-- 文档管理面板 -->
      <DocumentPanel v-if="showDocumentPanel" @close="showDocumentPanel = false" />
      
      <ObservabilityPanel v-model="showObservability" />
      <MemoryPanel v-model="showMemory" />
      <PromptPanel v-model="showPrompt" />
      <ModelParamsPanel v-model="showModelParams" />
      
      <!-- Agent管理面板 -->
      <el-dialog v-model="showAgentManager" title="Agent 管理" width="700px" :destroy-on-close="true">
        <AgentManager />
      </el-dialog>
      
      <!-- 自定义工具管理面板 -->
      <el-dialog v-model="showCustomToolManager" title="自定义工具管理" width="750px" :destroy-on-close="true">
        <CustomToolManager />
      </el-dialog>

      <!-- 功能16：Agent市场 -->
      <el-dialog v-model="showAgentMarket" title="Agent 市场" width="850px" :destroy-on-close="true">
        <AgentMarket @used="showAgentMarket = false" />
      </el-dialog>

      <!-- 功能12：工作流编排 -->
      <el-drawer v-model="showWorkflow" title="工作流编排" size="900px" destroy-on-close>
        <div class="workflow-layout">
          <!-- 工作流列表 -->
          <div class="wf-list">
            <div class="wf-list-title">工作流列表</div>
            <div
              v-for="wf in chatStore.workflows"
              :key="wf.id"
              class="wf-list-item"
              :class="{ active: activeWorkflowId === wf.id }"
              @click="selectWorkflow(wf.id)"
            >
              <span>{{ wf.name }}</span>
              <el-button text size="small" class="wf-del" @click.stop="deleteWorkflow(wf.id)">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <el-button size="small" class="wf-new-btn" @click="newWorkflow">
              <el-icon><Plus /></el-icon> 新建工作流
            </el-button>
          </div>
          <!-- 工作流编辑器 -->
          <div class="wf-editor-wrap">
            <WorkflowEditor ref="workflowEditorRef" />
          </div>
        </div>
      </el-drawer>

      <!-- 功能15：数据库查询 -->
      <el-dialog v-model="showDBQuery" title="数据库查询" width="700px" :destroy-on-close="true">
        <el-tabs v-model="dbTab">
          <el-tab-pane label="连接管理" name="connections">
            <DBConnectionManager />
          </el-tab-pane>
          <el-tab-pane label="自然语言查询" name="query">
            <DBQueryPanel />
          </el-tab-pane>
        </el-tabs>
      </el-dialog>

      <!-- 功能13：语音设置 -->
      <el-dialog v-model="showVoiceSettings" title="语音设置" width="420px">
        <div class="voice-settings">
          <div class="voice-setting-row">
            <div>
              <div class="vs-title">语音输入</div>
              <div class="vs-desc">在输入框使用麦克风进行语音转文字（需 Chrome/Edge）</div>
            </div>
            <el-switch
              :model-value="chatStore.voiceInputEnabled"
              @change="chatStore.toggleVoiceInput()"
            />
          </div>
          <div class="voice-setting-row">
            <div>
              <div class="vs-title">自动播报</div>
              <div class="vs-desc">收到 AI 回答后自动朗读</div>
            </div>
            <el-switch
              :model-value="chatStore.autoSpeakEnabled"
              @change="chatStore.toggleAutoSpeak()"
            />
          </div>
          <div class="voice-tip">
            语音功能基于浏览器原生 API，需在 HTTPS 或 localhost 环境下使用。
          </div>
        </div>
      </el-dialog>

      <!-- 功能11：模型对比抽屉 -->
      <el-drawer
        v-model="showModelCompare"
        title="模型对比"
        size="85%"
        destroy-on-close
      >
        <ModelCompareView v-if="showModelCompare" />
      </el-drawer>
      
      <!-- 移动端技能选择弹窗 -->
      <el-dialog
        v-model="showMobileSkillDialog"
        title="选择技能"
        width="90%"
        :show-close="true"
      >
        <div class="mobile-select-list">
          <div
            v-for="skill in chatStore.skills"
            :key="skill.id"
            class="mobile-select-item"
            :class="{ active: chatStore.activeSkill?.id === skill.id }"
            @click="handleMobileSkillSelect(skill.id)"
          >
            <span class="item-icon">{{ skill.icon }}</span>
            <div class="item-info">
              <span class="item-name">{{ skill.name }}</span>
              <span class="item-desc">{{ skill.description }}</span>
            </div>
            <el-icon v-if="chatStore.activeSkill?.id === skill.id" class="check-icon"><Check /></el-icon>
          </div>
        </div>
      </el-dialog>
      
      <!-- 移动端模型选择弹窗 -->
      <el-dialog
        v-model="showMobileModelDialog"
        title="选择模型"
        width="90%"
        :show-close="true"
      >
        <div class="mobile-select-list">
          <div
            v-for="model in chatStore.availableModels"
            :key="model.id"
            class="mobile-select-item"
            :class="{ active: chatStore.currentModel?.id === model.id }"
            @click="handleMobileModelSelect(model.id)"
          >
            <div class="item-info">
              <span class="item-name">{{ model.name }}</span>
              <span class="item-desc">{{ model.description }}</span>
            </div>
            <el-icon v-if="chatStore.currentModel?.id === model.id" class="check-icon"><Check /></el-icon>
          </div>
        </div>
      </el-dialog>

      <!-- 功能17：分享对话弹窗 -->
      <ShareDialog v-model="showShareDialog" :session-id="shareSessionId" />

      <!-- 功能18：导入对话弹窗 -->
      <ImportDialog v-model="showImportDialog" />

      <!-- 功能20：API Key 管理 -->
      <el-dialog v-model="showApiKeys" title="API 密钥管理" width="680px" :destroy-on-close="true">
        <ApiKeyManager />
      </el-dialog>

      <!-- 功能19：PWA 安装提示 -->
      <div v-if="deferredPrompt" class="install-banner" @click="promptInstall">
        <el-icon><Download /></el-icon>
        <span>安装智知到桌面，离线可用</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Document, Cpu, ChatDotRound, Service, List, UserFilled, MagicStick, DataAnalysis, Collection, EditPen, Menu, MoreFilled, Check, Download, Moon, Sunny, ArrowDown, Setting, Operation, Tools, ScaleToOriginal, Star, Share, Coin, Microphone, Plus, Close, Key } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import Sidebar from '@/components/common/Sidebar.vue'
import ChatArea from '@/components/chat/ChatArea.vue'
import DocumentPanel from '@/components/knowledge/DocumentPanel.vue'
import ObservabilityPanel from '@/components/agent/ObservabilityPanel.vue'
import MemoryPanel from '@/components/knowledge/MemoryPanel.vue'
import PromptPanel from '@/components/knowledge/PromptPanel.vue'
import ModelParamsPanel from '@/components/agent/ModelParamsPanel.vue'
import ModelCompareView from '@/components/agent/ModelCompareView.vue'
import AgentSelector from '@/components/agent/AgentSelector.vue'
import AgentManager from '@/components/agent/AgentManager.vue'
import CustomToolManager from '@/components/agent/CustomToolManager.vue'
import AgentMarket from '@/components/agent/AgentMarket.vue'
import WorkflowEditor from '@/components/agent/WorkflowEditor.vue'
import DBConnectionManager from '@/components/settings/DBConnectionManager.vue'
import DBQueryPanel from '@/components/common/DBQueryPanel.vue'
import ShareDialog from '@/components/common/ShareDialog.vue'
import ImportDialog from '@/components/common/ImportDialog.vue'
import ApiKeyManager from '@/components/settings/ApiKeyManager.vue'
import { useChatStore } from '@/stores/chat'
import { useIsMobile } from '@/composables/useIsMobile'
import type { SessionInfo } from '@/types'

const chatStore = useChatStore()
const router = useRouter()
const showDocumentPanel = ref(false)
const showObservability = ref(false)
const showMemory = ref(false)
const showPrompt = ref(false)
const showModelParams = ref(false)
const showAgentManager = ref(false)
const showCustomToolManager = ref(false)
const showModelCompare = ref(false)
const showAgentMarket = ref(false)
const showWorkflow = ref(false)
const showDBQuery = ref(false)
const showVoiceSettings = ref(false)
// 功能17/18/20
const showShareDialog = ref(false)
const shareSessionId = ref('')
const showImportDialog = ref(false)
const showApiKeys = ref(false)
// 功能19：PWA 安装提示
const deferredPrompt = ref<any>(null)
const dbTab = ref('connections')
const mobileSidebarVisible = ref(false)
const showMobileSkillDialog = ref(false)
const showMobileModelDialog = ref(false)

// 功能12：工作流
const workflowEditorRef = ref<InstanceType<typeof WorkflowEditor> | null>(null)
const activeWorkflowId = ref<string | null>(null)

// 深色模式
const isDark = ref(localStorage.getItem('theme') === 'dark')

// 顶部栏更多菜单
function handleHeaderMenu(command: string) {
  switch (command) {
    case 'document':
      router.push('/knowledge')
      break
    case 'stats':
      router.push('/analytics')
      break
    case 'memory':
      router.push('/knowledge')
      break
    case 'prompt':
      router.push('/knowledge')
      break
    case 'modelParams':
      router.push('/settings')
      break
    case 'agentManager':
      router.push('/agents')
      break
    case 'agentMarket':
      router.push('/agents')
      break
    case 'workflow':
      router.push('/workflow')
      break
    case 'dbQuery':
      showDBQuery.value = true
      chatStore.loadDBConnections()
      break
    case 'voiceSettings':
      showVoiceSettings.value = true
      break
    case 'customTools':
      router.push('/agents')
      break
    case 'modelCompare':
      showModelCompare.value = true
      break
    case 'apiKeys':
      router.push('/settings')
      break
    case 'settings':
      router.push('/settings')
      break
    case 'export':
      exportConversation()
      break
    case 'theme':
      toggleDarkMode()
      break
  }
}

function toggleDarkMode() {
  isDark.value = !isDark.value
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// 设置保存后刷新用户信息
// 初始化深色模式
if (isDark.value) {
  document.documentElement.classList.add('dark')
}

// 导出当前对话为 Markdown
function exportConversation() {
  if (chatStore.messages.length === 0) {
    ElMessage.warning('没有可导出的对话内容')
    return
  }
  
  const sessionTitle = chatStore.currentSession?.title || '对话记录'
  const date = new Date().toLocaleDateString('zh-CN')
  
  let markdown = `# ${sessionTitle}\n\n`
  markdown += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`
  markdown += `---\n\n`
  
  for (const msg of chatStore.messages) {
    const role = msg.role === 'user' ? '👤 用户' : '🤖 智知'
    markdown += `## ${role}\n\n${msg.content}\n\n`
    
    // 导出思考过程
    if (msg.thinking) {
      markdown += `<details>\n<summary>思考过程</summary>\n\n${msg.thinking}\n\n</details>\n\n`
    }
    
    // 导出工具调用
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      markdown += `**工具调用：**\n\n`
      for (const tool of msg.toolCalls) {
        markdown += `- \`${tool.name}\`: ${JSON.stringify(tool.arguments)}\n`
      }
      markdown += `\n`
    }
    
    // 导出参考来源
    if (msg.sources && msg.sources.length > 0) {
      markdown += `**参考来源：**\n\n`
      for (const src of msg.sources) {
        markdown += `- ${src.source} (相似度: ${(src.score * 100).toFixed(1)}%)\n`
      }
      markdown += `\n`
    }
  }
  
  // 下载文件
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sessionTitle}_${date}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  ElMessage.success('对话已导出为 Markdown 文件')
}

// 响应式：检测移动端
const { isMobile } = useIsMobile()

// 移动端菜单处理
function handleMobileMenu(command: string) {
  switch (command) {
    case 'skill':
      showMobileSkillDialog.value = true
      break
    case 'model':
      showMobileModelDialog.value = true
      break
    case 'mode_qa':
      chatStore.mode = 'qa'
      ElMessage.success('已切换到问答模式')
      break
    case 'mode_agent':
      chatStore.mode = 'agent'
      ElMessage.success('已切换到Agent模式')
      break
    case 'mode_plan':
      chatStore.mode = 'plan'
      ElMessage.success('已切换到Plan模式')
      break
    case 'mode_multi':
      chatStore.mode = 'multi'
      ElMessage.success('已切换到多Agent模式')
      break
    case 'thinking':
      chatStore.enableThinking = !chatStore.enableThinking
      ElMessage.success(`思考模式已${chatStore.enableThinking ? '开启' : '关闭'}`)
      break
    case 'document':
      showDocumentPanel.value = !showDocumentPanel.value
      break
    case 'stats':
      showObservability.value = true
      break
    case 'memory':
      showMemory.value = true
      break
    case 'prompt':
      showPrompt.value = true
      break
  }
}

// 移动端技能选择
async function handleMobileSkillSelect(skillId: string) {
  try {
    const result = await chatStore.switchSkill(skillId)
    if (result.success) {
      ElMessage.success(`已切换到 ${result.skill.name}`)
      showMobileSkillDialog.value = false
    }
  } catch (e) {
    ElMessage.error('技能切换失败')
  }
}

// 移动端模型选择
async function handleMobileModelSelect(modelId: string) {
  try {
    const result = await chatStore.switchModel(modelId)
    if (result.success) {
      ElMessage.success(`已切换到 ${result.model.name}`)
      showMobileModelDialog.value = false
    }
  } catch (e) {
    ElMessage.error('模型切换失败')
  }
}

const modeTipText = computed(() => {
  switch (chatStore.mode) {
    case 'qa':
      return '智能问答：直接调用大模型生成回答，响应最快'
    case 'agent':
      return 'Agent 模式：自动识别并调用工具（计算、文件、时间等）'
    case 'plan':
      return 'Plan 模式：先拆解任务为多步计划，再逐步执行并汇总'
    case 'multi':
      return '多Agent协作：Planner规划 → Executor执行 → Reviewer审查，三Agent协同'
    default:
      return ''
  }
})

// 全局快捷键处理
function handleKeydown(e: KeyboardEvent) {
  // Ctrl/Cmd + K：新建对话
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    chatStore.newSession()
    ElMessage.success('已新建对话')
  }
  // Ctrl/Cmd + L：清空输入框（需要 ChatArea 配合，这里触发自定义事件）
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('clear-input'))
  }
  // Escape：停止生成
  if (e.key === 'Escape' && chatStore.isLoading) {
    e.preventDefault()
    chatStore.stopGeneration()
  }
  // Ctrl/Cmd + B：切换侧边栏
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault()
    mobileSidebarVisible.value = !mobileSidebarVisible.value
  }
}

// 功能12：工作流操作
function selectWorkflow(id: string) {
  activeWorkflowId.value = id
  const wf = chatStore.workflows.find(w => w.id === id)
  if (wf && workflowEditorRef.value) {
    workflowEditorRef.value.loadWorkflow(wf)
  }
}

function newWorkflow() {
  activeWorkflowId.value = null
  workflowEditorRef.value?.loadWorkflow({ name: '', description: '', nodes: [], edges: [] })
}

// 功能17：打开分享弹窗
function openShare(session: SessionInfo) {
  shareSessionId.value = session.id
  showShareDialog.value = true
}

// 功能19：PWA 安装提示
function promptInstall() {
  if (!deferredPrompt.value) return
  deferredPrompt.value.prompt()
  deferredPrompt.value = null
}

async function deleteWorkflow(id: string) {
  await ElMessageBox.confirm('确认删除该工作流？', '提示', { type: 'warning' })
  await chatStore.removeWorkflow(id)
  if (activeWorkflowId.value === id) newWorkflow()
  ElMessage.success('已删除')
}

onMounted(() => {
  chatStore.loadSessions()
  chatStore.loadFolders()
  chatStore.loadDocuments()
  chatStore.loadModelInfo()
  chatStore.loadSkills()
  chatStore.loadCustomAgents()
  chatStore.loadCustomTools()
  window.addEventListener('keydown', handleKeydown)
  // 功能19：监听 PWA 安装提示
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault()
    deferredPrompt.value = e
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.3s, border-color 0.3s;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
  margin: 0;
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  flex-shrink: 0;
}

/* 模型选择器按钮 */
.model-selector-btn {
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

.model-selector-btn:hover {
  background: var(--bg-hover);
}

.model-selector-btn .model-icon {
  color: var(--primary);
  font-size: 16px;
}

.model-selector-btn .el-icon:last-child {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 模型下拉菜单 */
.model-dropdown-menu {
  max-height: 400px;
  overflow-y: auto;
  min-width: 220px;
}

.dropdown-section {
  padding: 4px 0;
}

.dropdown-section-title {
  font-size: 11px;
  color: var(--text-secondary);
  padding: 8px 16px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.model-dropdown-menu .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
}

.model-dropdown-menu .el-dropdown-menu__item .item-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
}

.model-dropdown-menu .el-dropdown-menu__item .check-icon {
  margin-left: auto;
  color: var(--primary);
}

.model-dropdown-menu .el-dropdown-menu__item.active {
  color: var(--primary);
  background: var(--primary-light);
}

/* 功能10：模型分组头 */
.model-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px 2px;
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.model-group-name {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ollama-offline span {
  color: var(--text-secondary);
}

/* 模式切换 */
.mode-switch {
  display: flex;
  background: var(--bg-tertiary);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  font-weight: 500;
}

.mode-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.mode-btn.active {
  background: var(--bg-secondary);
  color: var(--primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  font-weight: 600;
}

/* 图标按钮 */
.icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 18px;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon-btn.active {
  color: var(--primary);
  background: var(--primary-light);
}

/* Token 徽标 */
.token-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--primary-light);
  border: 1px solid var(--primary);
  border-radius: 12px;
  font-size: 12px;
  color: var(--primary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.token-badge:hover {
  background: var(--primary);
  color: #fff;
}

.token-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--primary-light);
  border: 1px solid var(--primary);
  border-radius: 12px;
  font-size: 12px;
  color: var(--primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.token-badge:hover {
  background: var(--primary);
  color: #fff;
}

.mode-switcher {
}

.token-badge .el-icon {
  font-size: 14px;
}

.token-unit {
  color: #909399;
  font-size: 11px;
}

.token-tooltip {
  padding: 4px 0;
}

.token-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 0;
  font-size: 12px;
  white-space: nowrap;
}

.mode-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  font-size: 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.mode-tip.qa {
  background: var(--primary-light);
  color: var(--primary);
}

.mode-tip.agent {
  background: rgba(103, 194, 58, 0.1);
  color: var(--success);
}

.mode-tip.plan {
  background: rgba(230, 162, 60, 0.1);
  color: var(--warning);
}

.mode-tip.multi {
  background: rgba(114, 46, 209, 0.1);
  color: #722ed1;
}

.current-skill-tag {
  background: rgba(255, 255, 255, 0.8);
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.current-model-tag {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.8);
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

/* 移动端菜单按钮 */
.menu-toggle {
  padding: 4px;
  margin-right: 4px;
}

/* 移动端侧边栏抽屉 */
.mobile-sidebar-drawer :deep(.el-drawer__body) {
  padding: 0;
}

/* ========== 响应式：平板（768px - 1024px） ========== */
@media (max-width: 1024px) {
  .header {
    padding: 8px 12px;
  }
  
  .skill-selector, .model-selector {
    display: none;
  }
  
  .thinking-switch {
    display: none;
  }
  
  .mode-switch :deep(.el-radio-button__inner) {
    padding: 8px 8px;
    font-size: 11px;
  }
  
  .mode-switch :deep(.el-radio-button__inner .el-icon) {
    display: none;
  }
}

/* ========== 响应式：手机（< 768px） ========== */
@media (max-width: 768px) {
  .app-container {
    flex-direction: column;
  }
  
  .header {
    padding: 8px 12px;
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .header-left {
    gap: 6px;
  }
  
  .logo {
    font-size: 16px;
  }
  
  .header-right {
    gap: 8px;
  }
  
  .mode-tip {
    padding: 4px 12px;
    font-size: 11px;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .current-skill-tag,
  .current-model-tag {
    font-size: 10px;
    padding: 1px 8px;
  }
  
  .token-badge {
    padding: 3px 8px;
    font-size: 11px;
  }
  
  .token-unit {
    display: none;
  }
}

/* ========== 响应式：小屏手机（< 480px） ========== */
@media (max-width: 480px) {
  .header {
    padding: 6px 10px;
  }
  
  .logo {
    font-size: 15px;
  }
  
  .mode-tip {
    font-size: 10px;
    padding: 3px 10px;
  }
}

/* 移动端选择列表 */
.mobile-select-list {
  max-height: 60vh;
  overflow-y: auto;
}

.mobile-select-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
}

.mobile-select-item:hover {
  background: #f5f7fa;
}

.mobile-select-item.active {
  background: #ecf5ff;
  border: 1px solid #409eff;
}

.mobile-select-item .item-icon {
  font-size: 24px;
}

.mobile-select-item .item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mobile-select-item .item-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.mobile-select-item .item-desc {
  font-size: 12px;
  color: #909399;
}

.mobile-select-item .check-icon {
  color: #409eff;
  font-size: 18px;
}

/* 深色模式适配（全局覆盖） */
.dark .header {
  background: var(--bg-secondary) !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.dark .header .logo,
.dark .header .subtitle {
  color: var(--text-primary) !important;
}

.dark .sidebar {
  background: var(--bg-secondary) !important;
  border-right: 1px solid var(--border-color) !important;
}

/* ========== 功能12：工作流布局 ========== */
.workflow-layout {
  display: flex;
  gap: 12px;
  height: calc(100vh - 100px);
}
.wf-list {
  width: 200px;
  border-right: 1px solid var(--border-color);
  padding-right: 12px;
  overflow-y: auto;
  flex-shrink: 0;
}
.wf-list-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}
.wf-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  margin-bottom: 4px;
  color: var(--text-primary);
}
.wf-list-item:hover { background: var(--bg-hover); }
.wf-list-item.active {
  background: var(--primary-light);
  color: var(--primary);
}
.wf-new-btn {
  width: 100%;
  margin-top: 8px;
}
.wf-del { color: #f56c6c; }
.wf-editor-wrap {
  flex: 1;
  min-width: 0;
}

/* ========== 功能13：语音设置 ========== */
.voice-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.voice-setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.vs-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.vs-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.voice-tip {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 8px;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

/* 功能19：PWA 安装提示条 */
.install-banner {
  position: fixed;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--primary);
  color: #fff;
  border-radius: 24px;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  z-index: 9999;
}
</style>
