<template>
  <div class="message-item" :class="message.role">
    <div class="avatar">
      <el-icon v-if="message.role === 'user'" :size="20"><User /></el-icon>
      <el-icon v-else :size="20"><Service /></el-icon>
    </div>
    
    <div class="message-content">
      <div class="message-bubble">
        <!-- 思考过程展示 -->
        <div v-if="message.thinking" class="thinking-block">
          <div class="thinking-header" @click="toggleThinking">
            <el-icon class="thinking-icon"><MagicStick /></el-icon>
            <span class="thinking-title">思考过程</span>
            <el-icon class="expand-icon" :class="{ expanded: expandedThinking }">
              <ArrowDown />
            </el-icon>
          </div>
          <div v-if="expandedThinking" class="thinking-content">
            <div class="thinking-text">{{ message.thinking }}</div>
          </div>
        </div>
        
        <!-- 工具调用展示 -->
        <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls">
          <div
            v-for="(tool, index) in message.toolCalls"
            :key="index"
            class="tool-call-item"
          >
            <div class="tool-call-header" @click="toggleTool(index)">
              <el-icon class="tool-icon"><MagicStick /></el-icon>
              <span class="tool-name">{{ getToolDisplayName(tool.name) }}</span>
              <el-icon class="expand-icon" :class="{ expanded: expandedTools.includes(index) }">
                <ArrowDown />
              </el-icon>
            </div>
            <div v-if="expandedTools.includes(index)" class="tool-call-detail">
              <div class="tool-args">
                <span class="label">参数：</span>
                <code>{{ JSON.stringify(tool.arguments, null, 2) }}</code>
              </div>
              <div v-if="tool.result" class="tool-result">
                <span class="label">结果：</span>
                <!-- 功能14：浏览器截图 base64 渲染 -->
                <img
                  v-if="getScreenshotImage(tool.result)"
                  :src="getScreenshotImage(tool.result)"
                  class="screenshot-img"
                  @click="previewImage(getScreenshotImage(tool.result))"
                />
                <div v-else class="result-content">{{ tool.result }}</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Plan模式：任务规划步骤 -->
        <div v-if="message.plan && message.plan.length > 0" class="plan-steps">
          <div class="plan-title">
            <el-icon><List /></el-icon>
            <span>任务规划（{{ message.plan.length }}步）</span>
          </div>
          <div class="plan-step-list">
            <div
              v-for="step in message.plan"
              :key="step.id"
              class="plan-step"
              :class="step.status"
            >
              <div class="step-status">
                <el-icon v-if="step.status === 'completed'"><CircleCheck /></el-icon>
                <el-icon v-else-if="step.status === 'running'"><Loading /></el-icon>
                <el-icon v-else-if="step.status === 'failed'"><CircleClose /></el-icon>
                <el-icon v-else><Clock /></el-icon>
              </div>
              <div class="step-content">
                <div class="step-title">{{ step.id }}. {{ step.title }}</div>
                <div v-if="step.description" class="step-desc">{{ step.description }}</div>
                <div v-if="step.result && expandedPlan" class="step-result">{{ step.result }}</div>
              </div>
            </div>
          </div>
          <div class="plan-toggle" @click="expandedPlan = !expandedPlan">
            {{ expandedPlan ? '收起执行结果' : '展开执行结果' }}
            <el-icon :class="{ expanded: expandedPlan }"><ArrowDown /></el-icon>
          </div>
        </div>

        <!-- 多Agent模式：执行轨迹 -->
        <div v-if="message.agentTrace && message.agentTrace.length > 0" class="agent-trace">
          <div class="trace-title" @click="expandedTrace = !expandedTrace">
            <el-icon><UserFilled /></el-icon>
            <span>多Agent协作过程（{{ message.agentTrace.length }}步）</span>
            <el-icon class="expand-icon" :class="{ expanded: expandedTrace }"><ArrowDown /></el-icon>
          </div>
          <div v-if="expandedTrace" class="trace-timeline">
            <div
              v-for="(item, index) in message.agentTrace"
              :key="index"
              class="trace-item"
              :class="getAgentClass(item.agent)"
            >
              <div class="trace-agent-badge">{{ getAgentLabel(item.agent) }}</div>
              <div class="trace-content">
                <span class="trace-action">{{ getActionLabel(item.action) }}</span>
                <span class="trace-text">{{ item.content }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 图片消息 -->
        <div v-if="message.image" class="message-image">
          <img :src="message.image" alt="图片" @click="previewImage(message.image)" />
        </div>
        
        <!-- 编辑模式（用户消息） -->
        <div v-if="editing" class="edit-area">
          <el-input
            v-model="editText"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 12 }"
            class="edit-textarea"
            @keydown.ctrl.enter="saveEdit"
            @keydown.meta.enter="saveEdit"
            @keydown.esc="cancelEdit"
          />
          <div class="edit-actions">
            <el-button size="small" @click="cancelEdit">取消 (Esc)</el-button>
            <el-button size="small" type="primary" @click="saveEdit">保存并重新生成 (Ctrl+Enter)</el-button>
          </div>
        </div>

        <!-- 消息内容 -->
        <div v-else-if="message.content" class="message-text-wrapper">
          <div class="message-text markdown-body" v-html="renderedContent" @click="handleCodeClick"></div>
          <span v-if="message.isStreaming" class="typing-cursor"></span>
        </div>
        <div v-else-if="message.isStreaming" class="loading-indicator">
          <span class="typing-dots">
            <span></span><span></span><span></span>
          </span>
          <span class="loading-text">正在思考...</span>
        </div>

        <!-- 代码执行结果面板 -->
        <div v-for="(state, runId) in codeRunStates" :key="runId" class="code-exec-panel">
          <div class="code-exec-header" @click="toggleRunResult(runId)">
            <el-icon v-if="state.running" class="running-icon"><Loading /></el-icon>
            <span class="exec-title">{{ state.running ? '正在执行...' : `执行完成 (退出码: ${state.result?.exitCode ?? '?'})` }}</span>
            <el-icon class="expand-icon" :class="{ expanded: state.expanded }"><ArrowDown /></el-icon>
          </div>
          <div v-if="state.expanded && !state.running && state.result" class="code-exec-body">
            <div v-if="state.result.stdout" class="exec-stdout">
              <div class="exec-label">输出:</div>
              <pre>{{ state.result.stdout }}</pre>
            </div>
            <div v-if="state.result.stderr" class="exec-stderr">
              <div class="exec-label">错误:</div>
              <pre>{{ state.result.stderr }}</pre>
            </div>
            <div v-if="state.result.images.length > 0" class="exec-images">
              <div class="exec-label">图表:</div>
              <img v-for="(img, i) in state.result.images" :key="i" :src="img" class="exec-image" />
            </div>
          </div>
        </div>
      </div>
      
      <!-- 消息操作按钮 -->
      <div v-if="message.role === 'assistant' && !message.isStreaming && message.content" class="message-actions">
        <el-button text size="small" @click="copyContent">
          <el-icon><CopyDocument /></el-icon>
          <span>{{ copied ? '已复制' : '复制' }}</span>
        </el-button>
        <el-button text size="small" @click="$emit('regenerate')">
          <el-icon><Refresh /></el-icon>
          <span>重新生成</span>
        </el-button>
      </div>

      <!-- 用户消息：编辑按钮 -->
      <div v-if="message.role === 'user' && !message.isStreaming && !editing" class="message-actions user-actions">
        <el-button text size="small" @click="startEdit">
          <el-icon><EditPen /></el-icon>
          <span>编辑</span>
        </el-button>
      </div>
      
      <!-- 来源引用 -->
      <div v-if="message.sources && message.sources.length > 0" class="sources">
        <div class="sources-title">
          <el-icon><Link /></el-icon>
          参考来源 ({{ message.sources.length }})
        </div>
        <div class="source-list">
          <div
            v-for="(source, index) in message.sources"
            :key="index"
            class="source-item source-card"
            @click="openSourceDetail(index + 1)"
          >
            <span class="source-index">{{ index + 1 }}</span>
            <div class="source-card-body">
              <div class="source-name">{{ source.source }}</div>
              <div class="source-meta">
                <span class="source-score">{{ (source.score * 100).toFixed(1) }}%</span>
                <span v-if="source.chunkIndex !== undefined" class="source-chunk">块{{ source.chunkIndex + 1 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 来源详情弹窗 -->
      <el-dialog v-model="showSourceDialog" title="来源详情" width="560px" append-to-body>
        <div v-if="activeSource" class="source-detail">
          <div class="sd-row">
            <span class="sd-label">文档名</span>
            <span class="sd-value">{{ activeSource.source }}</span>
          </div>
          <div class="sd-row">
            <span class="sd-label">块编号</span>
            <span class="sd-value">
              <template v-if="activeSource.chunkIndex !== undefined">第 {{ activeSource.chunkIndex + 1 }} 块</template>
              <template v-else>-</template>
              <template v-if="activeSource.page"> · 第 {{ activeSource.page }} 页</template>
            </span>
          </div>
          <div class="sd-row">
            <span class="sd-label">相似度</span>
            <span class="sd-value sd-score">{{ (activeSource.score * 100).toFixed(1) }}%</span>
          </div>
          <div class="sd-row">
            <span class="sd-label">检索方式</span>
            <span class="sd-value">{{ retrievalMethodLabel(activeSource.retrievalMethod) }}</span>
          </div>
          <div class="sd-block">
            <div class="sd-label sd-block-label">原文片段</div>
            <div class="sd-snippet" v-html="snippetHtml(activeSource)"></div>
          </div>
        </div>
      </el-dialog>
      
      <div class="message-time">
        {{ formatTime(message.timestamp) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { User, Service, MagicStick, ArrowDown, Link, List, CircleCheck, CircleClose, Clock, Loading, UserFilled, CopyDocument, Refresh, EditPen } from '@element-plus/icons-vue'
import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import type { ChatMessage, CodeExecutionResult } from '@/types'
import { executeCode } from '@/api'

const props = defineProps<{
  message: ChatMessage
}>()

const emit = defineEmits<{
  (e: 'regenerate'): void
  (e: 'edit', messageId: string, newContent: string): void
}>()

const expandedTools = ref<number[]>([])
const expandedPlan = ref(false)
const expandedTrace = ref(false)
const expandedThinking = ref(false)
const copied = ref(false)

// 代码执行状态
const codeRunStates = ref<Record<string, { running: boolean; result: CodeExecutionResult | null; expanded: boolean }>>({})

// 编辑状态
const editing = ref(false)
const editText = ref('')

// ===== 功能9：溯源展示 =====
const showSourceDialog = ref(false)
const activeSource = ref<any>(null)

// 根据引用编号打开来源详情（编号从1开始）
function openSourceDetail(index: number) {
  const sources = props.message.sources || []
  const src = sources[index - 1]
  if (!src) return
  activeSource.value = { ...src, index }
  showSourceDialog.value = true
}

function retrievalMethodLabel(method?: string): string {
  const map: Record<string, string> = {
    vector: '向量检索',
    bm25: '关键词检索',
    hybrid: '混合检索',
  }
  return map[method || ''] || '混合检索'
}

// 将内容片段中的 <mark> 渲染为高亮（v-html）
function snippetHtml(src: any): string {
  if (!src) return ''
  return src.highlightedContent || src.content || ''
}

function startEdit() {
  editText.value = props.message.content || ''
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

function saveEdit() {
  const text = editText.value.trim()
  if (!text) return
  editing.value = false
  emit('edit', props.message.id, text)
}

// 复制消息内容
async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.message.content || '')
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (e) {
    console.error('复制失败:', e)
  }
}

// 图片预览
function previewImage(src: string) {
  const w = window.open()
  if (w) {
    w.document.write(`<img src="${src}" style="max-width:100%;max-height:100%;margin:auto;display:block;" />`)
    w.document.title = '图片预览'
  }
}

// 配置 marked + highlight.js 代码高亮（marked v11 使用扩展方式）
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      try {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value
        }
        return hljs.highlightAuto(code).value
      } catch {
        return code
      }
    }
  })
)
marked.setOptions({
  breaks: true,
  gfm: true,
})

// 自定义渲染器：为 python/javascript 代码块添加运行按钮
const renderer = new marked.Renderer()
const origCodeRenderer = renderer.code.bind(renderer)
renderer.code = function({ text, lang, escaped }) {
  const defaultHtml = origCodeRenderer({ text, lang, escaped })
  const langLower = (lang || '').toLowerCase()
  if (langLower === 'python' || langLower === 'javascript' || langLower === 'js') {
    const runBtn = `<button class="code-run-btn" data-lang="${langLower}" data-code-id="">▶ 运行</button>`
    // 在 pre 标签内插入按钮
    return defaultHtml.replace('<pre>', `<pre class="code-block-with-run">${runBtn}`)
  }
  return defaultHtml
}
marked.use({ renderer } as any)

const renderedContent = computed(() => {
  if (!props.message.content) return ''
  // 预处理：修复常见的 Markdown 格式问题
  let content = props.message.content
  // 在标题标记前添加换行（如果前面不是换行）
  content = content.replace(/([^\n])\s*(#{1,6}\s)/g, '$1\n\n$2')
  // 在列表标记前添加换行（如果前面不是换行）
  content = content.replace(/([^\n])\s*([-*+]\s)/g, '$1\n$2')
  // 在有序列表标记前添加换行
  content = content.replace(/([^\n])\s*(\d+\.\s)/g, '$1\n$2')
  // 修复表格分隔线
  content = content.replace(/\|\|-+\|/g, (match) => {
    return match.replace(/\|/g, '| ')
  })
  // 使用 DOMPurify 净化 HTML，防止 XSS 攻击
  const rawHtml = marked.parse(content)
  const sanitized = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div', 'sup'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'data-ref'],
  })
  // 将正文里的 [n] / [来源n] 转为可点击上标引用编号
  return sanitized.replace(/\[来源?(\d+)\]/g, (_, num) => {
    const idx = parseInt(num, 10)
    if (!Number.isFinite(idx) || idx < 1) return _
    return `<sup class="citation" data-ref="${idx}">[${idx}]</sup>`
  })
})

function toggleTool(index: number) {
  const i = expandedTools.value.indexOf(index)
  if (i > -1) {
    expandedTools.value.splice(i, 1)
  } else {
    expandedTools.value.push(index)
  }
}

// 功能14：从工具结果中提取浏览器截图 base64
function getScreenshotImage(result?: string): string | null {
  if (!result) return null
  const match = result.match(/\[IMAGE_BASE64\]([A-Za-z0-9+/=]+)/)
  if (match && match[1]) {
    return `data:image/png;base64,${match[1]}`
  }
  return null
}

function toggleThinking() {
  expandedThinking.value = !expandedThinking.value
}

function getToolDisplayName(name: string): string {
  const names: Record<string, string> = {
    search_knowledge_base: '知识库检索',
    calculate: '数学计算',
    get_current_time: '获取当前时间',
    create_file: '创建文件',
    read_file: '读取文件',
    write_file: '写入文件',
    append_file: '追加文件',
    list_files: '列出文件',
    search_files: '搜索文件',
    run_shell: '运行命令',
    translate_text: '文本翻译',
    summarize_text: '文本摘要',
    code_interpreter: '代码解释器',
  }
  return names[name] || name
}

// 多Agent轨迹相关函数
function getAgentClass(agent: string): string {
  const map: Record<string, string> = {
    Planner: 'agent-planner',
    Executor: 'agent-executor',
    Reviewer: 'agent-reviewer',
    Coordinator: 'agent-coordinator',
    System: 'agent-system',
  }
  return map[agent] || 'agent-other'
}

function getAgentLabel(agent: string): string {
  const map: Record<string, string> = {
    Planner: '📋 规划师',
    Executor: '⚡ 执行者',
    Reviewer: '🔍 审查员',
    Coordinator: '🎯 协调者',
    System: '⚠️ 系统',
  }
  return map[agent] || agent
}

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    start_planning: '开始规划',
    plan_created: '规划完成',
    start_execution: '开始执行',
    step_start: '执行步骤',
    step_done: '步骤完成',
    start_review: '开始审查',
    review_done: '审查完成',
    error: '错误',
  }
  return map[action] ? `[${map[action]}] ` : ''
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

// ===== 代码执行功能 =====
async function handleCodeClick(e: MouseEvent) {
  const target = e.target as HTMLElement

  // 引用编号点击：弹出来源详情
  if (target.classList.contains('citation')) {
    e.preventDefault()
    const ref = parseInt(target.dataset.ref || '0', 10)
    openSourceDetail(ref)
    return
  }

  if (!target.classList.contains('code-run-btn')) return
  e.preventDefault()

  const pre = target.closest('pre')
  if (!pre) return
  const codeEl = pre.querySelector('code')
  if (!codeEl) return

  const code = codeEl.textContent || ''
  const lang = target.dataset.lang || 'python'
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  codeRunStates.value[runId] = { running: true, result: null, expanded: true }

  try {
    const result = await executeCode(code, lang === 'js' ? 'javascript' : lang)
    codeRunStates.value[runId] = { running: false, result, expanded: true }
  } catch (err: any) {
    codeRunStates.value[runId] = {
      running: false,
      result: { stdout: '', stderr: err.message || '执行失败', exitCode: 1, images: [] },
      expanded: true,
    }
  }
}

function toggleRunResult(runId: string) {
  if (codeRunStates.value[runId]) {
    codeRunStates.value[runId].expanded = !codeRunStates.value[runId].expanded
  }
}
</script>

<style scoped>
.message-item {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  max-width: 85%;
  animation: messageFadeIn 0.3s ease-out;
}

.message-item.user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
}

.message-item.user .avatar {
  background: var(--primary-gradient);
  color: #fff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.message-item.assistant .avatar {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-bubble {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: 14px 18px;
  border: 1px solid var(--border-color);
  transition: background-color 0.3s, border-color 0.3s;
}

.message-item.user .message-bubble {
  background: var(--primary-gradient);
  border: none;
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}

.message-item.user .message-text {
  color: #fff;
}

.message-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
}

.loading-indicator {
  padding: 8px 0;
}

.typing-dots {
  display: inline-flex;
  gap: 4px;
}

.typing-dots span {
  width: 8px;
  height: 8px;
  background: var(--text-placeholder);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* 图片消息 */
.message-image {
  margin-bottom: 8px;
}

.message-image img {
  max-width: 300px;
  max-height: 300px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: transform 0.2s ease;
  border: 1px solid var(--border-color);
}

.message-image img:hover {
  transform: scale(1.02);
}

/* 消息内容包装器（用于打字机光标定位） */
.message-text-wrapper {
  position: relative;
  display: inline;
}

/* 打字机光标 */
.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  background: #409eff;
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-blink 0.8s infinite;
}

@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 加载指示器优化 */
.loading-indicator {
  padding: 8px 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.loading-text {
  font-size: 13px;
  color: #909399;
}

/* 思考过程样式 */
.thinking-block {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 6px 8px;
  background: #fdf6ec;
  border-radius: 6px;
  transition: background 0.2s;
}

.thinking-header:hover {
  background: #faecd8;
}

.thinking-icon {
  color: #e6a23c;
  font-size: 14px;
}

.thinking-title {
  font-size: 13px;
  color: #e6a23c;
  font-weight: 500;
  flex: 1;
}

.thinking-content {
  margin-top: 8px;
  padding: 10px 12px;
  background: #fdf6ec;
  border-radius: 6px;
  border-left: 3px solid #e6a23c;
}

.thinking-text {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-calls {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

/* Plan模式样式 */
.plan-steps {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.plan-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #e6a23c;
  margin-bottom: 10px;
}

.plan-step-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan-step {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  background: #fdf6ec;
  border-radius: 6px;
  border-left: 3px solid #e6a23c;
}

.plan-step.completed {
  background: #f0f9eb;
  border-left-color: #67c23a;
}

.plan-step.running {
  background: #ecf5ff;
  border-left-color: #409eff;
}

.plan-step.failed {
  background: #fef0f0;
  border-left-color: #f56c6c;
}

.step-status {
  flex-shrink: 0;
  margin-top: 2px;
}

.plan-step.completed .step-status {
  color: #67c23a;
}

.plan-step.running .step-status {
  color: #409eff;
}

.plan-step.failed .step-status {
  color: #f56c6c;
}

.plan-step.pending .step-status {
  color: #c0c4cc;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.step-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.step-result {
  font-size: 12px;
  color: #606266;
  margin-top: 6px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 4px;
  max-height: 120px;
  overflow-y: auto;
}

.plan-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  color: #e6a23c;
  cursor: pointer;
  margin-top: 8px;
  padding: 4px;
}

.plan-toggle:hover {
  text-decoration: underline;
}

.plan-toggle .expanded {
  transform: rotate(180deg);
}

/* 多Agent轨迹样式 */
.agent-trace {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.trace-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #909399;
  margin-bottom: 10px;
  cursor: pointer;
}

.trace-title .expand-icon {
  margin-left: auto;
  transition: transform 0.2s;
}

.trace-title .expand-icon.expanded {
  transform: rotate(180deg);
}

.trace-timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.trace-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #fafafa;
  border-left: 3px solid #c0c4cc;
}

.trace-item.agent-planner {
  background: #fdf6ec;
  border-left-color: #e6a23c;
}

.trace-item.agent-executor {
  background: #ecf5ff;
  border-left-color: #409eff;
}

.trace-item.agent-reviewer {
  background: #f0f9eb;
  border-left-color: #67c23a;
}

.trace-item.agent-coordinator {
  background: #f5f0ff;
  border-left-color: #9067c2;
}

.trace-item.agent-system {
  background: #fef0f0;
  border-left-color: #f56c6c;
}

.trace-agent-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.trace-content {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}

.trace-action {
  font-weight: 600;
  color: #303133;
  margin-right: 4px;
}

.trace-text {
  word-break: break-word;
}

.tool-call-item {
  margin-bottom: 8px;
}

.tool-call-item:last-child {
  margin-bottom: 0;
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f0f9eb;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.tool-icon {
  color: #67c23a;
}

.tool-name {
  flex: 1;
  font-weight: 500;
  color: #67c23a;
}

.expand-icon {
  transition: transform 0.2s;
  color: #909399;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.tool-call-detail {
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 0 0 6px 6px;
  font-size: 12px;
}

.tool-args, .tool-result {
  margin-bottom: 8px;
}

.tool-args:last-child, .tool-result:last-child {
  margin-bottom: 0;
}

.label {
  color: #909399;
  font-weight: 500;
}

.tool-args code {
  display: block;
  background: #fff;
  padding: 6px 8px;
  border-radius: 4px;
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

.result-content {
  margin-top: 4px;
  color: #606266;
  max-height: 100px;
  overflow-y: auto;
}

/* 功能14：浏览器截图 */
.screenshot-img {
  margin-top: 4px;
  max-width: 100%;
  max-height: 300px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  cursor: pointer;
}

.message-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  padding-left: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.message-actions:hover {
  opacity: 1;
}

.message-actions .el-button {
  padding: 2px 6px;
  font-size: 12px;
}

.message-actions .el-icon {
  margin-right: 2px;
}

/* 用户消息操作按钮右对齐 */
.user-actions {
  justify-content: flex-end;
}

/* 编辑区域 */
.edit-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-textarea :deep(.el-textarea__inner) {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.sources {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 8px;
}

.sources-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.source-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px;
}

.source-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.source-card:hover {
  border-color: var(--primary);
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.15);
}

.source-index {
  width: 18px;
  height: 18px;
  background: var(--primary, #409eff);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
  margin-top: 1px;
}

.source-card-body {
  flex: 1;
  min-width: 0;
}

.source-name {
  color: #606266;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.source-meta {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.source-score {
  color: #67c23a;
  font-weight: 500;
  font-size: 10px;
}

.source-chunk {
  color: #909399;
  font-size: 10px;
}

/* ===== 功能9：引用上标 ===== */
.citation {
  color: var(--primary, #409eff);
  font-size: 0.72em;
  font-weight: 600;
  cursor: pointer;
  margin: 0 1px;
  padding: 0 2px;
  border-radius: 3px;
  transition: background 0.15s;
  user-select: none;
}

.citation:hover {
  background: var(--primary-light, #ecf5ff);
  text-decoration: underline;
}

/* 来源详情弹窗 */
.source-detail {
  font-size: 13px;
}

.sd-row {
  display: flex;
  margin-bottom: 10px;
  line-height: 1.6;
}

.sd-label {
  width: 70px;
  flex-shrink: 0;
  color: #909399;
}

.sd-value {
  flex: 1;
  color: #303133;
  word-break: break-word;
}

.sd-score {
  color: #67c23a;
  font-weight: 600;
}

.sd-block {
  margin-top: 14px;
}

.sd-block-label {
  margin-bottom: 6px;
}

.sd-snippet {
  background: #f8f9fa;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 10px 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.7;
  color: #303133;
  max-height: 280px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.sd-snippet mark,
.source-highlight mark {
  background: #fff3a0;
  color: inherit;
  padding: 0 2px;
  border-radius: 2px;
}

.message-time {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 4px;
  padding: 0 4px;
}

.message-item.user .message-time {
  text-align: right;
}

/* ========== 代码运行按钮和执行结果 ========== */
.code-block-with-run {
  position: relative;
  padding-top: 36px !important;
}

.code-run-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--primary, #409eff);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
  z-index: 10;
  transition: opacity 0.2s;
}

.code-run-btn:hover {
  opacity: 0.85;
}

.code-exec-panel {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background: #f8f9fa;
}

.code-exec-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #ecf5ff;
  cursor: pointer;
  font-size: 12px;
}

.code-exec-header .running-icon {
  animation: spin 1s linear infinite;
  color: #409eff;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.code-exec-header .exec-title {
  flex: 1;
  color: #409eff;
  font-weight: 500;
}

.code-exec-body {
  padding: 8px 12px;
  max-height: 300px;
  overflow-y: auto;
}

.exec-label {
  font-size: 11px;
  font-weight: 600;
  color: #909399;
  margin-bottom: 4px;
}

.exec-stdout pre {
  background: #fff;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0 0 8px 0;
  max-height: 200px;
  overflow-y: auto;
}

.exec-stderr pre {
  background: #fef0f0;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  color: #f56c6c;
}

.exec-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.exec-image {
  max-width: 100%;
  max-height: 300px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .message-item {
    gap: 8px;
  }
  
  .avatar {
    width: 32px;
    height: 32px;
  }
  
  .avatar :deep(.el-icon) {
    font-size: 16px !important;
  }
  
  .message-bubble {
    padding: 10px 14px;
    font-size: 14px;
  }
  
  .thinking-header,
  .tool-call-header {
    padding: 8px 10px;
    font-size: 12px;
  }
  
  .plan-step,
  .trace-item {
    padding: 8px 10px;
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  .message-bubble {
    padding: 8px 12px;
    font-size: 13px;
  }
}
</style>
