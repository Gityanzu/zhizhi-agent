<template>
  <div class="workflow-editor">
    <!-- 顶部工具栏 -->
    <div class="wf-toolbar">
      <el-input v-model="workflowName" placeholder="工作流名称" class="wf-name" />
      <el-input v-model="workflowDesc" placeholder="描述（可选）" class="wf-desc" />
      <el-button type="primary" size="small" @click="handleSave">
        <el-icon><Check /></el-icon> 保存
      </el-button>
      <el-button type="success" size="small" :loading="executing" @click="handleExecute">
        <el-icon><VideoPlay /></el-icon> 执行
      </el-button>
    </div>

    <div class="wf-body">
      <!-- 左侧：节点列表 -->
      <div class="wf-nodes">
        <div class="wf-panel-title">节点列表（{{ nodes.length }}）</div>
        <div
          v-for="node in nodes"
          :key="node.id"
          class="wf-node-item"
          :class="{ active: selectedNodeId === node.id }"
          @click="selectedNodeId = node.id"
        >
          <span class="node-type-badge" :class="node.type">{{ nodeTypeLabel(node.type) }}</span>
          <span class="node-name">{{ node.name }}</span>
          <el-button text size="small" class="del-node" @click.stop="removeNode(node.id)">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
        <el-select size="small" placeholder="添加节点" class="add-node-select" @change="addNode">
          <el-option v-for="t in nodeTypes" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
      </div>

      <!-- 中间：节点配置表单 -->
      <div class="wf-config">
        <div class="wf-panel-title">节点配置</div>
        <div v-if="currentNode" class="node-form">
          <el-form label-width="90px" size="small">
            <el-form-item label="节点名称">
              <el-input v-model="currentNode.name" />
            </el-form-item>
            <el-form-item label="类型">
              <el-tag size="small">{{ nodeTypeLabel(currentNode.type) }}</el-tag>
            </el-form-item>

            <!-- start 节点 -->
            <template v-if="currentNode.type === 'start'">
              <el-form-item label="初始变量(JSON)">
                <el-input v-model="startVarsText" type="textarea" :rows="3" placeholder='{"name":"张三"}' />
              </el-form-item>
              <el-form-item label="循环次数">
                <el-input-number v-model="currentNode.loopCount" :min="1" :max="20" />
              </el-form-item>
              <el-form-item label="循环回到节点">
                <el-select v-model="currentNode.loopNodeId" clearable placeholder="默认回到start">
                  <el-option v-for="n in nodes" :key="n.id" :label="n.name" :value="n.id" />
                </el-select>
              </el-form-item>
            </template>

            <!-- llm 节点 -->
            <template v-else-if="currentNode.type === 'llm'">
              <el-form-item label="Prompt">
                <el-input v-model="currentNode.prompt" type="textarea" :rows="4" placeholder="支持 {{变量名}} 引用，如：请总结 {{input}}" />
              </el-form-item>
              <el-form-item label="输出变量名">
                <el-input v-model="currentNode.outputVar" placeholder="如 llm_result" />
              </el-form-item>
            </template>

            <!-- tool 节点 -->
            <template v-else-if="currentNode.type === 'tool'">
              <el-form-item label="工具名">
                <el-select v-model="currentNode.toolName" placeholder="选择工具">
                  <el-option v-for="t in toolOptions" :key="t" :label="t" :value="t" />
                </el-select>
              </el-form-item>
              <el-form-item label="工具参数(JSON)">
                <el-input v-model="toolArgsText" type="textarea" :rows="3" placeholder='{"query":"{{keyword}}"}' />
              </el-form-item>
              <el-form-item label="输出变量名">
                <el-input v-model="currentNode.outputVar" placeholder="如 tool_result" />
              </el-form-item>
            </template>

            <!-- code 节点 -->
            <template v-else-if="currentNode.type === 'code'">
              <el-form-item label="代码语言">
                <el-select v-model="currentNode.language">
                  <el-option label="Python" value="python" />
                  <el-option label="JavaScript" value="javascript" />
                </el-select>
              </el-form-item>
              <el-form-item label="代码">
                <el-input v-model="currentNode.code" type="textarea" :rows="6" placeholder="print('hello')" />
              </el-form-item>
              <el-form-item label="输出变量名">
                <el-input v-model="currentNode.outputVar" placeholder="如 code_result" />
              </el-form-item>
            </template>

            <!-- condition 节点 -->
            <template v-else-if="currentNode.type === 'condition'">
              <el-form-item label="条件表达式">
                <el-input v-model="currentNode.expression" placeholder="如 score > 80 或 status == 'ok'" />
              </el-form-item>
              <el-form-item label="为真时走向">
                <el-select v-model="currentNode.trueNodeId" clearable placeholder="选择节点">
                  <el-option v-for="n in nodes" :key="n.id" :label="n.name" :value="n.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="为假时走向">
                <el-select v-model="currentNode.falseNodeId" clearable placeholder="选择节点">
                  <el-option v-for="n in nodes" :key="n.id" :label="n.name" :value="n.id" />
                </el-select>
              </el-form-item>
            </template>

            <!-- 普通下一节点（非 condition/end） -->
            <el-form-item v-if="currentNode.type !== 'condition' && currentNode.type !== 'end'" label="下一节点">
              <el-select v-model="currentNode.nextNodeId" clearable placeholder="选择下一个要执行的节点">
                <el-option v-for="n in nodes" :key="n.id" :label="n.name" :value="n.id" :disabled="n.id === currentNode.id" />
              </el-select>
            </el-form-item>

            <!-- end 节点 -->
            <el-form-item v-if="currentNode.type === 'end'" label="结果变量名">
              <el-input v-model="currentNode.outputVar" placeholder="要作为最终结果的变量名" />
            </el-form-item>
          </el-form>
        </div>
        <div v-else class="empty-hint">从左侧选择或添加节点进行配置</div>
      </div>
    </div>

    <!-- 执行结果面板 -->
    <div v-if="execResult" class="wf-result">
      <div class="wf-panel-title">执行结果（{{ execResult.success ? '成功' : '失败' }}）</div>
      <div v-if="execResult.error" class="exec-error">{{ execResult.error }}</div>
      <div v-if="execResult.finalResult !== null && execResult.finalResult !== undefined" class="final-result">
        <span class="label">最终结果：</span>
        <pre>{{ formatValue(execResult.finalResult) }}</pre>
      </div>
      <div class="node-results">
        <div
          v-for="nr in execResult.nodeResults"
          :key="nr.nodeId"
          class="node-result-item"
          :class="nr.status"
        >
          <span class="status-dot"></span>
          <span class="nr-name">{{ nr.nodeName }}</span>
          <el-tag size="small">{{ statusLabel(nr.status) }}</el-tag>
          <span v-if="nr.durationMs !== undefined" class="nr-time">{{ nr.durationMs }}ms</span>
          <pre v-if="nr.status === 'success' && nr.output !== undefined" class="nr-output">{{ formatValue(nr.output) }}</pre>
          <pre v-if="nr.error" class="nr-error">{{ nr.error }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check, Close, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()

const workflowName = ref('')
const workflowDesc = ref('')
const nodes = ref<any[]>([])
const selectedNodeId = ref<string>('')
const executing = ref(false)
const execResult = ref<any>(null)

const nodeTypes = [
  { value: 'start', label: '开始' },
  { value: 'llm', label: '大模型' },
  { value: 'tool', label: '工具' },
  { value: 'code', label: '代码' },
  { value: 'condition', label: '条件分支' },
  { value: 'merge', label: '合并' },
  { value: 'end', label: '结束' },
]

const toolOptions = [
  'web_search', 'calculate', 'get_current_time', 'translate_text', 'summarize_text',
  'search_knowledge_base', 'code_interpreter', 'text_to_sql',
]

const currentNode = computed(() => nodes.value.find(n => n.id === selectedNodeId.value))

// start 节点变量 JSON 双向绑定
const startVarsText = ref('{}')
watch(() => currentNode.value?.variables, (v) => {
  if (currentNode.value?.type === 'start') {
    startVarsText.value = JSON.stringify(v || {}, null, 2)
  }
}, { immediate: true })
watch(startVarsText, (val) => {
  if (currentNode.value?.type === 'start') {
    try { currentNode.value.variables = JSON.parse(val) } catch { /* 忽略解析中 */ }
  }
})

// tool 节点参数 JSON 双向绑定
const toolArgsText = ref('{}')
watch(() => currentNode.value?.toolArgs, (v) => {
  if (currentNode.value?.type === 'tool') {
    toolArgsText.value = JSON.stringify(v || {}, null, 2)
  }
}, { immediate: true })
watch(toolArgsText, (val) => {
  if (currentNode.value?.type === 'tool') {
    try { currentNode.value.toolArgs = JSON.parse(val) } catch { /* 忽略 */ }
  }
})

function nodeTypeLabel(t: string): string {
  return nodeTypes.find(x => x.value === t)?.label || t
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: '等待', running: '执行中', success: '成功', failed: '失败', skipped: '跳过',
  }
  return map[s] || s
}

function formatValue(v: any): string {
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

function addNode(type: string) {
  const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const node: any = {
    id,
    type,
    name: `${nodeTypeLabel(type)}节点`,
    nextNodeId: '',
  }
  if (type === 'start') { node.variables = {}; node.loopCount = 1 }
  if (type === 'llm') { node.prompt = ''; node.outputVar = 'llm_result' }
  if (type === 'tool') { node.toolName = 'web_search'; node.toolArgs = {}; node.outputVar = 'tool_result' }
  if (type === 'code') { node.code = ''; node.language = 'python'; node.outputVar = 'code_result' }
  if (type === 'condition') { node.expression = ''; node.trueNodeId = ''; node.falseNodeId = '' }
  nodes.value.push(node)
  selectedNodeId.value = id
}

function removeNode(id: string) {
  nodes.value = nodes.value.filter(n => n.id !== id)
  // 清理其他节点对该节点的引用
  nodes.value.forEach(n => {
    if (n.nextNodeId === id) n.nextNodeId = ''
    if (n.trueNodeId === id) n.trueNodeId = ''
    if (n.falseNodeId === id) n.falseNodeId = ''
    if (n.loopNodeId === id) n.loopNodeId = ''
  })
  if (selectedNodeId.value === id) selectedNodeId.value = ''
}

async function handleSave() {
  if (!workflowName.value.trim()) {
    ElMessage.warning('请输入工作流名称')
    return
  }
  try {
    await chatStore.saveWorkflow({
      name: workflowName.value,
      description: workflowDesc.value,
      nodes: nodes.value,
      edges: [],
    })
    ElMessage.success('工作流已保存')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.message || e))
  }
}

async function handleExecute() {
  if (!workflowName.value.trim()) {
    ElMessage.warning('请先保存工作流')
    return
  }
  executing.value = true
  execResult.value = null
  try {
    const saved = await chatStore.saveWorkflow({
      name: workflowName.value,
      description: workflowDesc.value,
      nodes: nodes.value,
      edges: [],
    })
    const result = await chatStore.runWorkflow(saved.id, {})
    execResult.value = result
  } catch (e: any) {
    ElMessage.error('执行失败: ' + (e?.message || e))
  } finally {
    executing.value = false
  }
}

// 接收外部加载的工作流
function loadWorkflow(wf: any) {
  workflowName.value = wf.name || ''
  workflowDesc.value = wf.description || ''
  nodes.value = (wf.nodes || []).map((n: any) => ({ ...n, nextNodeId: n.nextNodeId || '' }))
  selectedNodeId.value = nodes.value[0]?.id || ''
  execResult.value = null
}

defineExpose({ loadWorkflow })
</script>

<style scoped>
.workflow-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}
.wf-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.wf-name { width: 200px; }
.wf-desc { flex: 1; }
.wf-body {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 300px;
}
.wf-nodes {
  width: 240px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  overflow-y: auto;
}
.wf-config {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  overflow-y: auto;
}
.wf-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}
.wf-node-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  border: 1px solid transparent;
}
.wf-node-item:hover { background: var(--bg-hover); }
.wf-node-item.active {
  background: var(--primary-light);
  border-color: var(--primary);
}
.node-type-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #e4e7ed;
  color: #606266;
  flex-shrink: 0;
}
.node-type-badge.start { background: #f0f9eb; color: #67c23a; }
.node-type-badge.llm { background: #ecf5ff; color: #409eff; }
.node-type-badge.tool { background: #fdf6ec; color: #e6a23c; }
.node-type-badge.code { background: #f5f0ff; color: #9067c2; }
.node-type-badge.condition { background: #fef0f0; color: #f56c6c; }
.node-type-badge.end { background: #dfe6e9; color: #2d3436; }
.node-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.del-node { flex-shrink: 0; }
.add-node-select {
  width: 100%;
  margin-top: 8px;
}
.empty-hint {
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
}
.wf-result {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  max-height: 260px;
  overflow-y: auto;
}
.exec-error {
  color: #f56c6c;
  font-size: 13px;
  margin-bottom: 8px;
}
.final-result pre {
  background: var(--bg-tertiary);
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: pre-wrap;
  margin: 4px 0 10px;
}
.node-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.node-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--bg-tertiary);
  flex-wrap: wrap;
}
.node-result-item.success { border-left: 3px solid #67c23a; }
.node-result-item.failed { border-left: 3px solid #f56c6c; }
.node-result-item.running { border-left: 3px solid #409eff; }
.node-result-item.skipped { border-left: 3px solid #c0c4cc; opacity: 0.6; }
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.node-result-item.success .status-dot { color: #67c23a; }
.node-result-item.failed .status-dot { color: #f56c6c; }
.node-result-item.running .status-dot { color: #409eff; }
.node-result-item.skipped .status-dot { color: #c0c4cc; }
.nr-name { font-size: 13px; color: var(--text-primary); }
.nr-time { font-size: 11px; color: var(--text-secondary); }
.nr-output, .nr-error {
  width: 100%;
  font-size: 12px;
  background: var(--bg-secondary);
  padding: 6px;
  border-radius: 4px;
  white-space: pre-wrap;
  margin: 4px 0 0;
  max-height: 100px;
  overflow-y: auto;
}
.nr-error { color: #f56c6c; }
.label { font-weight: 600; font-size: 13px; }
</style>
